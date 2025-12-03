/**
 * CSV Upload Route for MicroStrategy Compliance Data
 *
 * This route handles the standard CSV upload used in production for the big MicroStrategy export.
 *
 * PERFORMANCE OPTIMIZATION:
 * - Uses batched multi-row INSERTs (batch size: 250 rows) instead of per-row inserts
 * - This significantly reduces database round-trips and improves upload speed
 * - The CSV column → DB column mapping (CSV_TO_DB_MAPPING) is intentionally preserved
 *
 * ENCODING:
 * - Handles UTF-16LE to UTF-8 conversion for MicroStrategy exports
 * - Preserves BOM handling for proper character encoding
 *
 * DATA INTEGRITY:
 * - Same data structure and meaning as before optimization
 * - Same JSON response shape for API consumers
 * - Same audit logging behavior
 */
import { NextRequest, NextResponse } from 'next/server';
import { parse as csvParse } from 'csv-parse';
import { query } from '@/lib/db';

// Promisify the async CSV parser for sync-like usage
async function parseCSV(content: string, options?: { relax_column_count?: boolean }): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const records: any[] = [];
    const parser = csvParse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: options?.relax_column_count ?? false,
    });
    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        records.push(record);
      }
    });
    parser.on('error', reject);
    parser.on('end', () => resolve(records));
    parser.write(content);
    parser.end();
  });
}
import { getServerSession } from 'next-auth';
import { authOptions } from '../auth/[...nextauth]/route';
import { logAuditEvent } from '../admin/_audit';

export const runtime = 'nodejs';

// CSV column name to database column mapping
const CSV_TO_DB_MAPPING: Record<string, string> = {
  'Response Number': 'response_number',
  'Response Date': 'response_date',
  'Response Date Time': 'response_date_time',
  'Radio Name': 'radio_name',
  'Response Area': 'response_area',
  'Origin Description': 'origin_description',
  'Origin Address': 'origin_address',
  'Origin Location City': 'origin_location_city',
  'Origin Zip': 'origin_zip',
  'Origin Latitude': 'origin_latitude',
  'Origin Longitude': 'origin_longitude',
  'Destination Description': 'destination_description',
  'Destination Address': 'destination_address',
  'Destination Location City': 'destination_location_city',
  'Destination Zip': 'destination_zip',
  'Caller Type': 'caller_type',
  'Problem Description': 'problem_description',
  'Priority': 'priority',
  '': 'unnamed_col_19', // Blank column after Priority
  'Transport Mode': 'transport_mode',
  'Master Incident Cancel Reason': 'master_incident_cancel_reason',
  'Call in Que Time': 'call_in_que_time',
  'Call Taking Complete Time': 'call_taking_complete_time',
  'Assigned Time - First Unit': 'assigned_time_first_unit',
  'Assigned Time': 'assigned_time',
  'Enroute Time': 'enroute_time',
  'Staged Time': 'staged_time',
  'Arrived at Scene Time': 'arrived_at_scene_time',
  'Depart Scene Time': 'depart_scene_time',
  'Arrived Destination Time': 'arrived_destination_time',
  'Call Cleared Time': 'call_cleared_time',
  'Master Incident Delay Reason Description': 'master_incident_delay_reason_description',
  'Vehicle Assigned Delay Reason': 'vehicle_assigned_delay_reason',
  'CAD Is Transport': 'cad_is_transport',
  'Queue Response Time': 'queue_response_time',
  'Assigned Response Time': 'assigned_response_time',
  'Enroute Response Time': 'enroute_response_time',
  'Assigned to Arrived At Scene': 'assigned_to_arrived_at_scene',
  'Call In Queue to Cleared Call Lag': 'call_in_queue_to_cleared_call_lag',
  'Compliance Time': 'compliance_time',
};

// Convert UTF-16LE to UTF-8
function convertUtf16LeToUtf8(buffer: Buffer): string {
  // Check for BOM (Byte Order Mark) - UTF-16LE starts with FF FE
  if (buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString('utf16le').replace(/^\uFEFF/, '');
  }
  // Try UTF-16LE anyway (MicroStrategy exports)
  try {
    const utf16Text = buffer.toString('utf16le');
    if (utf16Text.includes(',') || utf16Text.includes('\t')) {
      return utf16Text.replace(/^\uFEFF/, '');
    }
  } catch (e) {
    // Fall through to UTF-8
  }
  return buffer.toString('utf8').replace(/^\uFEFF/, '');
}

// Build response_area to parish_id cache
async function getResponseAreaMappings(): Promise<Map<string, number>> {
  const { rows } = await query<{ response_area: string; parish_id: number }>(
    'SELECT response_area, parish_id FROM response_area_mappings'
  );
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.response_area.toLowerCase(), row.parish_id);
  }
  return map;
}

export async function POST(req: NextRequest) {
  try {
    // Get session for audit logging (non-blocking - upload still works if not logged in)
    const session = await getServerSession(authOptions);
    const sessionUser = session?.user as any;

    const formData = await req.formData();
    const file = formData.get('file');
    const testMode = formData.get('testMode') === 'true'; // DRY RUN - no actual inserts
    const regionIdParam = formData.get('regionId');
    const regionId = regionIdParam ? parseInt(regionIdParam.toString(), 10) : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'CSV file is required' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      return NextResponse.json({ error: 'Only .CSV files are allowed' }, { status: 400 });
    }

    if (!regionId || isNaN(regionId)) {
      return NextResponse.json({ error: 'Region is required for upload' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const csvText = convertUtf16LeToUtf8(buffer);

    let records: any[];
    try {
      records = await parseCSV(csvText, { relax_column_count: true });
    } catch (parseError: any) {
      return NextResponse.json({ error: `CSV parsing failed: ${parseError.message}` }, { status: 400 });
    }

    if (!records.length) {
      return NextResponse.json({ error: 'No data rows found in CSV' }, { status: 400 });
    }

    const detectedColumns = Object.keys(records[0]);
    console.log('CSV Columns detected:', detectedColumns);
    console.log('Total rows to process:', records.length);
    console.log('Test mode:', testMode);

    // Get response area to parish mappings
    const responseAreaMap = await getResponseAreaMappings();

    // Get parish names for reporting
    const { rows: parishes } = await query<{ id: number; name: string }>(
      'SELECT id, name FROM parishes'
    );
    const parishNames = new Map(parishes.map(p => [p.id, p.name]));

    let wouldProcess = 0;
    let wouldProcessOther = 0; // Calls going to "Other" (parish_id = 0)
    const unknownResponseAreas: Map<string, number> = new Map();
    const parishBreakdown: Map<string, number> = new Map();
    const sampleRows: any[] = [];
    const errorDetails: string[] = [];

    // Analyze each row
    for (const row of records) {
      const responseArea = row['Response Area'] || '';
      const parishId = responseAreaMap.get(responseArea.toLowerCase());

      if (!parishId) {
        // Will be inserted into "Other" (parish_id = 0)
        wouldProcessOther++;
        const count = unknownResponseAreas.get(responseArea) || 0;
        unknownResponseAreas.set(responseArea, count + 1);

        // Track in breakdown as "Other"
        const otherCount = parishBreakdown.get('Other') || 0;
        parishBreakdown.set('Other', otherCount + 1);
        continue;
      }

      wouldProcess++;
      const parishName = parishNames.get(parishId) || `Parish ${parishId}`;
      const count = parishBreakdown.get(parishName) || 0;
      parishBreakdown.set(parishName, count + 1);

      // Collect sample rows for preview
      if (sampleRows.length < 5) {
        sampleRows.push({
          responseNumber: row['Response Number'],
          responseArea: responseArea,
          parish: parishName,
          complianceTime: row['Compliance Time'],
          priority: row['Priority'],
        });
      }
    }

    // If test mode, return analysis without inserting
    const totalWouldInsert = wouldProcess + wouldProcessOther;
    if (testMode) {
      return NextResponse.json({
        ok: true,
        testMode: true,
        total: records.length,
        wouldProcess: totalWouldInsert,
        wouldProcessContracted: wouldProcess,
        wouldProcessOther: wouldProcessOther,
        wouldSkip: 0, // Now we insert all calls (unknown go to "Other")
        detectedColumns,
        parishBreakdown: Object.fromEntries(parishBreakdown),
        unknownResponseAreas: Object.fromEntries(unknownResponseAreas),
        sampleRows,
        message: `TEST MODE: Would insert ${totalWouldInsert} calls (${wouldProcess} contracted + ${wouldProcessOther} other)`,
      });
    }

    // ACTUAL INSERT MODE - Using batched inserts for performance
    // Batch size of 250 rows provides good balance between memory usage and insert speed
    const BATCH_SIZE = 250;
    let processed = 0;
    let processedOther = 0;
    let errors = 0;

    // Pre-compute the fixed column list for consistent batching
    // All rows will use the same columns to enable multi-row INSERT
    const fixedDbColumns: string[] = ['parish_id', 'region_id', 'raw_row', 'is_excluded', 'exclusion_reason'];
    for (const [csvCol, dbCol] of Object.entries(CSV_TO_DB_MAPPING)) {
      fixedDbColumns.push(dbCol);
    }
    const columnsPerRow = fixedDbColumns.length;

    // Batch arrays
    let batchValues: any[] = [];
    let batchPlaceholders: string[] = [];
    let batchProcessed = 0;
    let batchProcessedOther = 0;

    // Helper function to flush the current batch
    const flushBatch = async () => {
      if (batchPlaceholders.length === 0) return;

      try {
        const insertQuery = `INSERT INTO calls (${fixedDbColumns.join(', ')}) VALUES ${batchPlaceholders.join(', ')}`;
        await query(insertQuery, batchValues);
        processed += batchProcessed;
        processedOther += batchProcessedOther;
      } catch (batchError: any) {
        // If batch fails, count all rows in batch as errors
        errors += batchPlaceholders.length;
        if (errorDetails.length < 10) {
          errorDetails.push(`Batch error: ${batchError.message}`);
        }
      }

      // Reset batch
      batchValues = [];
      batchPlaceholders = [];
      batchProcessed = 0;
      batchProcessedOther = 0;
    };

    for (const row of records) {
      try {
        const responseArea = row['Response Area'] || '';
        const parishId = responseAreaMap.get(responseArea.toLowerCase());

        // Use parish_id = 0 for unknown response areas ("Other")
        const effectiveParishId = parishId || 0;

        // Build values array in the same order as fixedDbColumns
        const rowValues: any[] = [effectiveParishId, regionId, JSON.stringify(row), false, null];
        for (const [csvCol] of Object.entries(CSV_TO_DB_MAPPING)) {
          rowValues.push(row[csvCol] || null);
        }

        // Calculate placeholder indices for this row
        const startIdx = batchValues.length + 1;
        const placeholders = rowValues.map((_, i) => `$${startIdx + i}`).join(', ');
        batchPlaceholders.push(`(${placeholders})`);
        batchValues.push(...rowValues);

        if (parishId) {
          batchProcessed++;
        } else {
          batchProcessedOther++;
        }

        // Flush batch when it reaches BATCH_SIZE
        if (batchPlaceholders.length >= BATCH_SIZE) {
          await flushBatch();
        }
      } catch (rowError: any) {
        errors++;
        if (errorDetails.length < 10) {
          errorDetails.push(`Row error: ${rowError.message}`);
        }
      }
    }

    // Flush any remaining rows in the final batch
    await flushBatch();

    const totalProcessed = processed + processedOther;
    console.log(`Upload complete: ${totalProcessed} processed (${processed} contracted + ${processedOther} other), ${errors} errors`);

    // Log audit event for successful upload
    try {
      await logAuditEvent({
        actorUserId: sessionUser?.id,
        actorEmail: sessionUser?.email,
        action: 'UPLOAD_COMPLIANCE',
        targetType: 'compliance_data',
        targetId: file.name,
        summary: `Uploaded ${file.name} to region ${regionId}: ${totalProcessed} calls processed (${processed} contracted, ${processedOther} other)`,
        metadata: {
          filename: file.name,
          file_size_bytes: file.size,
          region_id: regionId,
          total_rows: records.length,
          processed: totalProcessed,
          processed_contracted: processed,
          processed_other: processedOther,
          errors,
          parish_breakdown: Object.fromEntries(parishBreakdown),
        },
      });
    } catch (auditErr) {
      console.error('Failed to log upload audit event:', auditErr);
      // Don't fail the upload if audit logging fails
    }

    return NextResponse.json({
      ok: true,
      testMode: false,
      total: records.length,
      processed: totalProcessed,
      processedContracted: processed,
      processedOther: processedOther,
      skipped: 0,
      errors,
      parishBreakdown: Object.fromEntries(parishBreakdown),
      errorDetails: errorDetails.length > 0 ? errorDetails : undefined,
    });

  } catch (err: any) {
    console.error('upload-compliance error:', err);
    return NextResponse.json(
      { error: 'Server error processing file', details: err.message },
      { status: 500 }
    );
  }
}

