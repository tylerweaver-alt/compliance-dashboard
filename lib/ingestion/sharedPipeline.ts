/**
 * Shared Ingestion Pipeline
 * Common logic for both CSV upload and SQL Server live ingestion
 * 
 * Provides:
 * - Normalized call structure
 * - Validation
 * - Idempotent upsert (ON CONFLICT DO UPDATE)
 * - Response area to parish mapping
 */

import { query } from '@/lib/db';

// ============================================================================
// Types
// ============================================================================

export interface NormalizedCall {
  // Required identifiers
  response_number: string;
  response_date: string | null;
  
  // Location
  response_area: string | null;
  origin_address: string | null;
  origin_location_city: string | null;
  origin_latitude: string | null;
  origin_longitude: string | null;
  origin_zip: string | null;
  
  // Timing
  response_date_time: string | null;
  call_in_que_time: string | null;
  call_taking_complete_time: string | null;
  assigned_time_first_unit: string | null;
  assigned_time: string | null;
  enroute_time: string | null;
  staged_time: string | null;
  arrived_at_scene_time: string | null;
  depart_scene_time: string | null;
  arrived_destination_time: string | null;
  call_cleared_time: string | null;
  
  // Metrics
  queue_response_time: string | null;
  assigned_response_time: string | null;
  enroute_response_time: string | null;
  assigned_to_arrived_at_scene: string | null;
  call_in_queue_to_cleared_call_lag: string | null;
  compliance_time: string | null;
  
  // Call details
  radio_name: string | null;
  priority: string | null;
  caller_type: string | null;
  problem_description: string | null;
  transport_mode: string | null;
  cad_is_transport: string | null;
  master_incident_cancel_reason: string | null;
  master_incident_delay_reason_description: string | null;
  vehicle_assigned_delay_reason: string | null;
  
  // Destination
  destination_description: string | null;
  destination_address: string | null;
  destination_location_city: string | null;
  destination_zip: string | null;
  origin_description: string | null;
  
  // Raw data for debugging
  raw_row: Record<string, any>;
  
  // Source tracking
  source_type: 'csv' | 'sqlserver';
  source_id?: number;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface UpsertResult {
  status: 'created' | 'updated' | 'skipped';
  call_id?: number;
  error?: string;
}

// ============================================================================
// Response Area Mapping Cache
// ============================================================================

let responseAreaCache: Map<string, number> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute

export async function getResponseAreaMappings(): Promise<Map<string, number>> {
  const now = Date.now();
  if (responseAreaCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return responseAreaCache;
  }
  
  const { rows } = await query<{ response_area: string; parish_id: number }>(
    'SELECT response_area, parish_id FROM response_area_mappings'
  );
  
  responseAreaCache = new Map();
  for (const row of rows) {
    responseAreaCache.set(row.response_area.toLowerCase(), row.parish_id);
  }
  cacheTimestamp = now;
  
  return responseAreaCache;
}

export function clearResponseAreaCache(): void {
  responseAreaCache = null;
  cacheTimestamp = 0;
}

// ============================================================================
// Validation
// ============================================================================

export function validateNormalizedCall(call: NormalizedCall): ValidationResult {
  const errors: string[] = [];
  
  if (!call.response_number || call.response_number.trim() === '') {
    errors.push('Missing response_number');
  }
  
  // response_date is recommended but not strictly required
  // Other fields are optional
  
  return { ok: errors.length === 0, errors };
}

// ============================================================================
// Upsert (Idempotent Insert/Update)
// ============================================================================

/**
 * Upsert a normalized call into the database
 * Uses response_number as the unique key for deduplication
 * Returns created/updated/skipped status
 */
export async function upsertNormalizedCall(
  call: NormalizedCall,
  regionId: number
): Promise<UpsertResult> {
  const responseAreaMap = await getResponseAreaMappings();
  const parishId = call.response_area 
    ? responseAreaMap.get(call.response_area.toLowerCase()) || 0 
    : 0;

  try {
    // Use ON CONFLICT to handle duplicates idempotently
    const { rows } = await query<{ id: number; is_new: boolean }>(`
      INSERT INTO calls (
        response_number, response_date, response_date_time,
        radio_name, response_area, origin_description, origin_address,
        origin_location_city, origin_zip, origin_latitude, origin_longitude,
        destination_description, destination_address, destination_location_city, destination_zip,
        caller_type, problem_description, priority, transport_mode,
        master_incident_cancel_reason, call_in_que_time, call_taking_complete_time,
        assigned_time_first_unit, assigned_time, enroute_time, staged_time,
        arrived_at_scene_time, depart_scene_time, arrived_destination_time, call_cleared_time,
        master_incident_delay_reason_description, vehicle_assigned_delay_reason,
        cad_is_transport, queue_response_time, assigned_response_time, enroute_response_time,
        assigned_to_arrived_at_scene, call_in_queue_to_cleared_call_lag, compliance_time,
        parish_id, region_id, raw_row, is_excluded, exclusion_reason
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30,
        $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, false, null
      )
      ON CONFLICT (response_number) DO UPDATE SET
        response_date = EXCLUDED.response_date,
        response_date_time = EXCLUDED.response_date_time,
        raw_row = EXCLUDED.raw_row,
        updated_at = now()
      RETURNING id, (xmax = 0) as is_new
    `, [
      call.response_number, call.response_date, call.response_date_time,
      call.radio_name, call.response_area, call.origin_description, call.origin_address,
      call.origin_location_city, call.origin_zip, call.origin_latitude, call.origin_longitude,
      call.destination_description, call.destination_address, call.destination_location_city, call.destination_zip,
      call.caller_type, call.problem_description, call.priority, call.transport_mode,
      call.master_incident_cancel_reason, call.call_in_que_time, call.call_taking_complete_time,
      call.assigned_time_first_unit, call.assigned_time, call.enroute_time, call.staged_time,
      call.arrived_at_scene_time, call.depart_scene_time, call.arrived_destination_time, call.call_cleared_time,
      call.master_incident_delay_reason_description, call.vehicle_assigned_delay_reason,
      call.cad_is_transport, call.queue_response_time, call.assigned_response_time, call.enroute_response_time,
      call.assigned_to_arrived_at_scene, call.call_in_queue_to_cleared_call_lag, call.compliance_time,
      parishId, regionId, JSON.stringify(call.raw_row)
    ]);

    if (rows.length === 0) {
      return { status: 'skipped' };
    }

    return {
      status: rows[0].is_new ? 'created' : 'updated',
      call_id: rows[0].id
    };
  } catch (err: any) {
    return { status: 'skipped', error: err.message };
  }
}

// ============================================================================
// SQL Server Row Mapping
// ============================================================================

/**
 * Map a SQL Server CAD/Visinet row to a NormalizedCall
 * Customize this mapping based on your actual SQL Server schema
 */
export function mapSqlServerRowToNormalizedCall(
  row: Record<string, any>,
  sourceId: number
): NormalizedCall {
  // This mapping should be customized based on the actual CAD/Visinet schema
  // The column names below are examples - adjust to match your SQL Server table
  return {
    response_number: row.ResponseNumber || row.response_number || row.IncidentNumber || '',
    response_date: row.ResponseDate || row.response_date || row.CallDate || null,
    response_area: row.ResponseArea || row.response_area || null,
    origin_address: row.OriginAddress || row.origin_address || null,
    origin_location_city: row.OriginCity || row.origin_location_city || null,
    origin_latitude: row.OriginLatitude || row.origin_latitude || null,
    origin_longitude: row.OriginLongitude || row.origin_longitude || null,
    origin_zip: row.OriginZip || row.origin_zip || null,
    response_date_time: row.ResponseDateTime || row.response_date_time || null,
    call_in_que_time: row.CallInQueTime || row.call_in_que_time || null,
    call_taking_complete_time: row.CallTakingCompleteTime || row.call_taking_complete_time || null,
    assigned_time_first_unit: row.AssignedTimeFirstUnit || row.assigned_time_first_unit || null,
    assigned_time: row.AssignedTime || row.assigned_time || null,
    enroute_time: row.EnrouteTime || row.enroute_time || null,
    staged_time: row.StagedTime || row.staged_time || null,
    arrived_at_scene_time: row.ArrivedAtSceneTime || row.arrived_at_scene_time || null,
    depart_scene_time: row.DepartSceneTime || row.depart_scene_time || null,
    arrived_destination_time: row.ArrivedDestinationTime || row.arrived_destination_time || null,
    call_cleared_time: row.CallClearedTime || row.call_cleared_time || null,
    queue_response_time: row.QueueResponseTime || row.queue_response_time || null,
    assigned_response_time: row.AssignedResponseTime || row.assigned_response_time || null,
    enroute_response_time: row.EnrouteResponseTime || row.enroute_response_time || null,
    assigned_to_arrived_at_scene: row.AssignedToArrivedAtScene || row.assigned_to_arrived_at_scene || null,
    call_in_queue_to_cleared_call_lag: row.CallInQueueToClearedCallLag || row.call_in_queue_to_cleared_call_lag || null,
    compliance_time: row.ComplianceTime || row.compliance_time || null,
    radio_name: row.RadioName || row.radio_name || null,
    priority: row.Priority || row.priority || null,
    caller_type: row.CallerType || row.caller_type || null,
    problem_description: row.ProblemDescription || row.problem_description || null,
    transport_mode: row.TransportMode || row.transport_mode || null,
    cad_is_transport: row.CADIsTransport || row.cad_is_transport || null,
    master_incident_cancel_reason: row.MasterIncidentCancelReason || row.master_incident_cancel_reason || null,
    master_incident_delay_reason_description: row.MasterIncidentDelayReasonDescription || row.master_incident_delay_reason_description || null,
    vehicle_assigned_delay_reason: row.VehicleAssignedDelayReason || row.vehicle_assigned_delay_reason || null,
    destination_description: row.DestinationDescription || row.destination_description || null,
    destination_address: row.DestinationAddress || row.destination_address || null,
    destination_location_city: row.DestinationCity || row.destination_location_city || null,
    destination_zip: row.DestinationZip || row.destination_zip || null,
    origin_description: row.OriginDescription || row.origin_description || null,
    raw_row: row,
    source_type: 'sqlserver',
    source_id: sourceId,
  };
}

/**
 * Map a CSV row to a NormalizedCall
 * Uses the standard MicroStrategy column names
 */
export function mapCsvRowToNormalizedCall(
  row: Record<string, any>
): NormalizedCall {
  return {
    response_number: row['Response Number'] || '',
    response_date: row['Response Date'] || null,
    response_area: row['Response Area'] || null,
    origin_address: row['Origin Address'] || null,
    origin_location_city: row['Origin Location City'] || null,
    origin_latitude: row['Origin Latitude'] || null,
    origin_longitude: row['Origin Longitude'] || null,
    origin_zip: row['Origin Zip'] || null,
    response_date_time: row['Response Date Time'] || null,
    call_in_que_time: row['Call in Que Time'] || null,
    call_taking_complete_time: row['Call Taking Complete Time'] || null,
    assigned_time_first_unit: row['Assigned Time - First Unit'] || null,
    assigned_time: row['Assigned Time'] || null,
    enroute_time: row['Enroute Time'] || null,
    staged_time: row['Staged Time'] || null,
    arrived_at_scene_time: row['Arrived at Scene Time'] || null,
    depart_scene_time: row['Depart Scene Time'] || null,
    arrived_destination_time: row['Arrived Destination Time'] || null,
    call_cleared_time: row['Call Cleared Time'] || null,
    queue_response_time: row['Queue Response Time'] || null,
    assigned_response_time: row['Assigned Response Time'] || null,
    enroute_response_time: row['Enroute Response Time'] || null,
    assigned_to_arrived_at_scene: row['Assigned to Arrived At Scene'] || null,
    call_in_queue_to_cleared_call_lag: row['Call In Queue to Cleared Call Lag'] || null,
    compliance_time: row['Compliance Time'] || null,
    radio_name: row['Radio Name'] || null,
    priority: row['Priority'] || null,
    caller_type: row['Caller Type'] || null,
    problem_description: row['Problem Description'] || null,
    transport_mode: row['Transport Mode'] || null,
    cad_is_transport: row['CAD Is Transport'] || null,
    master_incident_cancel_reason: row['Master Incident Cancel Reason'] || null,
    master_incident_delay_reason_description: row['Master Incident Delay Reason Description'] || null,
    vehicle_assigned_delay_reason: row['Vehicle Assigned Delay Reason'] || null,
    destination_description: row['Destination Description'] || null,
    destination_address: row['Destination Address'] || null,
    destination_location_city: row['Destination Location City'] || null,
    destination_zip: row['Destination Zip'] || null,
    origin_description: row['Origin Description'] || null,
    raw_row: row,
    source_type: 'csv',
  };
}

