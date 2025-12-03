import { Pool } from "pg";
import * as XLSX from "xlsx";

export const runtime = "nodejs"; // use Node runtime (needed for pg, xlsx)

// ---------- Postgres / Neon pool ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ---------- Helpers for parsing ----------

// incident_key: "09012025-1377" -> { callDate: "2025-09-01", callSequence: "1377" }
function parseIncidentParts(incidentKey: string): { callDate: string | null; callSequence: string | null } {
  if (!incidentKey) return { callDate: null, callSequence: null };

  const [datePart, seqPart] = incidentKey.split("-");
  if (!datePart || datePart.length !== 8) {
    return { callDate: null, callSequence: seqPart || null };
  }

  const mm = datePart.slice(0, 2);
  const dd = datePart.slice(2, 4);
  const yyyy = datePart.slice(4, 8);

  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);

  if (
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 || month > 12 ||
    day < 1 || day > 31
  ) {
    return { callDate: null, callSequence: seqPart || null };
  }

  // 🔐 DB-safe ISO date
  return {
    callDate: `${yyyy}-${mm}-${dd}`,
    callSequence: seqPart || null,
  };
}

// Normalize "H:MM:SS" / "HH:MM:SS" / "H:MM" into "HH:MM:SS"
function parseClockString(str: string): string | null {
  const trimmed = str.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;

  if (parts.length === 3) {
    let [h, m, s] = parts;
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  if (parts.length === 2) {
    let [m, s] = parts;
    if (m < 0 || m > 59 || s < 0 || s > 59) return null;
    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");
    return `00:${mm}:${ss}`;
  }

  if (parts.length === 1) {
    const s = parts[0];
    if (s < 0 || s > 59) return null;
    const ss = s.toString().padStart(2, "0");
    return `00:00:${ss}`;
  }

  return null;
}

// "0:29:55" -> 1795 seconds, etc.
function parseDurationToSeconds(str: string): number | null {
  const normalized = parseClockString(str);
  if (!normalized) return null;

  const [h, m, s] = normalized.split(":").map((n) => parseInt(n, 10));
  if ([h, m, s].some((n) => Number.isNaN(n))) return null;

  return h * 3600 + m * 60 + s;
}

// Build timestamp "YYYY-MM-DDTHH:MM:SS" from ISO date + time string
function buildTimestamp(dateIso: string | null, timeStr: string | null): string | null {
  if (!dateIso || !timeStr) return null;
  const normalized = parseClockString(timeStr);
  if (!normalized) return null;
  return `${dateIso}T${normalized}`;
}

interface ParsedCallRow {
  incident_number: string;
  call_date: string;             // ISO "YYYY-MM-DD" for DB
  origin_address: string | null;
  origin_city: string | null;
  start_time: string | null;     // "YYYY-MM-DDTHH:MM:SS"
  at_scene_time: string | null;  // same
  response_seconds: number | null;
}

// Use XLSX to parse your Evangeline/Ville Platte sheets
function parseCallsFromBuffer(buffer: Buffer): ParsedCallRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const rows: any[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false, // 🔴 give us formatted strings (like the CSV)
  }) as any[][];

  const parsed: ParsedCallRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Columns:
    // 0: "Evangeline 20" or "Ville Platte 8" (label - ignore for parsing, only first occurrence matters)
    // 1: "09012025-1377"   incident key
    // 2: "1428 Walnut St"  address
    // 3: "Pine Prairie"    city / "Parish"
    // 4: "18:12:57"        start
    // 5: "18:31:15"        on scene
    // 6: "0:00:28"         response
    const label = String(row[0] ?? "").trim();
    const incidentKey = String(row[1] ?? "").trim();
    const addr = String(row[2] ?? "").trim();
    const city = String(row[3] ?? "").trim();
    const startStr = String(row[4] ?? "").trim();
    const sceneStr = String(row[5] ?? "").trim();
    const responseStr = String(row[6] ?? "").trim();

    // Skip header rows (where column 1 contains "Date/Response" or similar)
    if (!incidentKey || incidentKey.toLowerCase().includes("date/response")) {
      continue;
    }

    // Skip rows where the incident key is actually a label/header being repeated
    // (Some exports repeat the label in column 0 for every row, we only care about incident data)
    if (!incidentKey.match(/^\d{8}-\d+$/)) {
      continue;
    }

    const { callDate, callSequence } = parseIncidentParts(incidentKey);
    if (!callDate) continue;

    const startTs = startStr ? buildTimestamp(callDate, startStr) : null;
    const sceneTs = sceneStr ? buildTimestamp(callDate, sceneStr) : null;

    let responseSeconds: number | null = null;
    if (responseStr) {
      responseSeconds = parseDurationToSeconds(responseStr);
    }

    // Fallback: derive responseSeconds from start/scene if needed
    if ((responseSeconds === null || responseSeconds === 0) && startTs && sceneTs) {
      const [, startTimePart] = startTs.split("T");
      const [, sceneTimePart] = sceneTs.split("T");
      const [sh, sm, ss] = startTimePart.split(":").map((n) => parseInt(n, 10));
      const [ah, am, as] = sceneTimePart.split(":").map((n) => parseInt(n, 10));

      const startTotal = sh * 3600 + sm * 60 + ss;
      const sceneTotal = ah * 3600 + am * 60 + as;
      const diff = sceneTotal - startTotal;

      if (!Number.isNaN(diff) && diff >= 0) {
        responseSeconds = diff;
      }
    }

    parsed.push({
      incident_number: incidentKey,
      call_date: callDate,
      origin_address: addr || null,
      origin_city: city || null,
      start_time: startTs,
      at_scene_time: sceneTs,
      response_seconds: responseSeconds,
    });
  }

  return parsed;
}

// ---------- Main HTTP handler ----------
export async function POST(req: Request) {
  const client = await pool.connect();
  let uploadId: string | null = null;

  try {
    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const parishIdStr = formData.get("parish_id") as string | null;
    const userIdStr = formData.get("user_id") as string | null; // UUID string
    const username = formData.get("username") as string | null;
    const dataMonthStr = formData.get("data_month") as string | null;
    const dataYearStr = formData.get("data_year") as string | null;
    const sourceLabel = formData.get("source_label") as string | null; // e.g. "Evangeline 20"

    if (!file) {
      return new Response(
        JSON.stringify({ error: "No file found in 'file' field" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!parishIdStr || !userIdStr || !username) {
      return new Response(
        JSON.stringify({
          error: "parish_id, user_id, and username are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parishId = parseInt(parishIdStr, 10);
    const userId = userIdStr;
    const dataMonth = dataMonthStr ? parseInt(dataMonthStr, 10) : null;
    const dataYear = dataYearStr ? parseInt(dataYearStr, 10) : null;

    if (Number.isNaN(parishId)) {
      return new Response(
        JSON.stringify({ error: "Invalid parish_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = file.name || "upload";
    const mimeType = file.type || null;
    const fileSize = buffer.length;

    const calls = parseCallsFromBuffer(buffer);
    console.log("Parsed calls count:", calls.length);

    await client.query("BEGIN");

    // Store the raw file and metadata
    const uploadRes = await client.query(
      `
      insert into parish_uploads (
        parish_id,
        filename,
        file_size_bytes,
        file_mime_type,
        file_data,
        uploaded_by_user_id,
        uploaded_by_username,
        status,
        data_month,
        data_year
      )
      values ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$9)
      returning id;
      `,
      [
        parishId,
        filename,
        fileSize,
        mimeType,
        buffer,
        userId,
        username,
        dataMonth,
        dataYear,
      ]
    );

    uploadId = uploadRes.rows[0].id as string;

    let rowsInserted = 0;

    for (const c of calls) {
      const { callSequence } = parseIncidentParts(c.incident_number);
      
      await client.query(
        `
        insert into calls (
          parish_id,
          incident_number,
          incident_key,
          call_date,
          call_sequence,
          origin_address,
          origin_city,
          start_time,
          at_scene_time,
          response_seconds,
          uploaded_from_id,
          uploaded_by_user_id
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12);
        `,
        [
          parishId,
          c.incident_number,        // legacy / original
          c.incident_number,        // incident_key
          c.call_date,
          callSequence,
          c.origin_address,
          c.origin_city,
          c.start_time,
          c.at_scene_time,
          c.response_seconds,
          uploadId,
          userId,
        ]
      );
      rowsInserted++;
    }

    await client.query(
      `
      update parish_uploads
      set status = 'processed',
          rows_imported = $1
      where id = $2;
      `,
      [rowsInserted, uploadId]
    );

    await client.query("COMMIT");

    return new Response(
      JSON.stringify({
        ok: true,
        message: "Upload processed",
        uploadId,
        rowsInserted,
        rowsParsedFromXlsx: calls.length,
        sampleParsedRows: calls.slice(0, 5),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Upload error:", err);

    if (uploadId) {
      try {
        await client.query(
          `
          update parish_uploads
          set status = 'failed',
              error_message = $1
          where id = $2;
          `,
          [String(err?.message || err), uploadId]
        );
      } catch (e) {
        console.error("Failed to update parish_uploads status:", e);
      }
    }

    await client.query("ROLLBACK");

    return new Response(
      JSON.stringify({
        error: "Upload failed",
        details: String(err?.message || err),
        uploadId,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    client.release();
  }
}
