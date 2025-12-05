import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { parse } from "csv-parse/sync";
import { authOptions } from "../auth/[...nextauth]/route";
import { pool } from "@/lib/db";

export const runtime = "nodejs";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ["text/csv", "application/vnd.ms-excel"];
const ADMIN_ROLES = ["OM", "Director", "VP", "Admin"];

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

  if (Number.isNaN(month) || Number.isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return { callDate: null, callSequence: seqPart || null };
  }

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
    const [h, m, s] = parts;
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
    const hh = h.toString().padStart(2, "0");
    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  if (parts.length === 2) {
    const [m, s] = parts;
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

// Build timestamp "YYYY-MM-DDTHH:MM:SS" from ISO date + time string
function buildTimestamp(dateIso: string | null, timeStr: string | null): string | null {
  if (!dateIso || !timeStr) return null;
  const normalized = parseClockString(timeStr);
  if (!normalized) return null;
  return `${dateIso}T${normalized}`;
}

interface ParsedCallRow {
  incident_number: string;
  call_date: string;
  origin_address: string | null;
  origin_city: string | null;
  start_time: string | null;
  at_scene_time: string | null;
  response_seconds: number | null;
}

// Parse CSV rows matching previous XLSX structure
function parseCallsFromCsv(buffer: Buffer): ParsedCallRow[] {
  const rows: any[][] = parse(buffer, {
    skip_empty_lines: true,
    trim: true,
  }) as any[][];

  const parsed: ParsedCallRow[] = [];

  for (const row of rows) {
    if (!row) continue;

    // Columns:
    // 0: "Evangeline 20" or "Ville Platte 8" (label - ignore)
    // 1: "09012025-1377"   incident key
    // 2: "1428 Walnut St"  address
    // 3: "Pine Prairie"    city
    // 4: "18:12:57"        start
    // 5: "18:31:15"        on scene
    // 6: "0:00:28"         response
    const incidentKey = String(row[1] ?? "").trim();
    const addr = String(row[2] ?? "").trim();
    const city = String(row[3] ?? "").trim();
    const startStr = String(row[4] ?? "").trim();
    const sceneStr = String(row[5] ?? "").trim();
    const responseStr = String(row[6] ?? "").trim();

    if (!incidentKey || incidentKey.toLowerCase().includes("date/response")) {
      continue;
    }

    if (!incidentKey.match(/^\d{8}-\d+$/)) {
      continue;
    }

    const { callDate, callSequence } = parseIncidentParts(incidentKey);
    if (!callDate) continue;

    const startTs = startStr ? buildTimestamp(callDate, startStr) : null;
    const sceneTs = sceneStr ? buildTimestamp(callDate, sceneStr) : null;

    let responseSeconds: number | null = null;
    if (responseStr) {
      const normalized = parseClockString(responseStr);
      if (normalized) {
        const [h, m, s] = normalized.split(":").map((n) => parseInt(n, 10));
        responseSeconds = h * 3600 + m * 60 + s;
      }
    }

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

function requireAdmin(session: any): { ok: true; user: any } | { ok: false; status: number; error: string } {
  if (!session || !session.user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const user = session.user as any;
  const role = user.role as string | undefined;
  const isAdmin = user.is_admin === true || (role && ADMIN_ROLES.includes(role));

  if (!isAdmin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, user };
}

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return NextResponse.json({ error: "Content-Type must be multipart/form-data" }, { status: 415 });
  }

  const session = await getServerSession(authOptions);
  const adminCheck = requireAdmin(session);
  if (!adminCheck.ok) {
    return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const parishIdStr = formData.get("parish_id") as string | null;
  const dataMonthStr = formData.get("data_month") as string | null;
  const dataYearStr = formData.get("data_year") as string | null;

  if (!file) {
    return NextResponse.json({ error: "No file found in 'file' field" }, { status: 400 });
  }

  const parishId = parishIdStr ? parseInt(parishIdStr, 10) : NaN;
  if (Number.isNaN(parishId)) {
    return NextResponse.json({ error: "Valid parish_id is required" }, { status: 400 });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "File too large", max_bytes: MAX_UPLOAD_BYTES }, { status: 413 });
  }

  const filename = file.name || "upload.csv";
  const fileExt = filename.toLowerCase();
  const isCsvMime = ALLOWED_MIME_TYPES.includes(file.type);
  const isCsvExt = fileExt.endsWith(".csv");
  if (!isCsvMime && !isCsvExt) {
    return NextResponse.json({ error: "Only CSV uploads are allowed" }, { status: 415 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const calls = parseCallsFromCsv(buffer);
  if (calls.length === 0) {
    return NextResponse.json({ error: "No valid call rows found in CSV" }, { status: 400 });
  }

  const dataMonth = dataMonthStr ? parseInt(dataMonthStr, 10) : null;
  const dataYear = dataYearStr ? parseInt(dataYearStr, 10) : null;

  const client = await pool.connect();
  let uploadId: string | null = null;

  try {
    await client.query("BEGIN");

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
      values ($1,$2,$3,$4,$5,$6,$7,'processed',$8,$9)
      returning id;
      `,
      [
        parishId,
        filename,
        buffer.length,
        file.type || null,
        null, // do not store raw blob
        adminCheck.user.id ?? null,
        adminCheck.user.email ?? adminCheck.user.name ?? null,
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
          c.incident_number,
          c.incident_number,
          c.call_date,
          callSequence,
          c.origin_address,
          c.origin_city,
          c.start_time,
          c.at_scene_time,
          c.response_seconds,
          uploadId,
          adminCheck.user.id ?? null,
        ]
      );
      rowsInserted++;
    }

    await client.query(
      `
      update parish_uploads
      set rows_imported = $1
      where id = $2;
      `,
      [rowsInserted, uploadId]
    );

    await client.query("COMMIT");

    return NextResponse.json(
      {
        ok: true,
        uploadId,
        rowsInserted,
        rowsParsed: calls.length,
        filename,
      },
      { status: 201 }
    );
  } catch (err: any) {
    await client.query("ROLLBACK");
    console.error("Upload error:", err);
    return NextResponse.json(
      {
        error: "Upload failed",
        details: err?.message ?? String(err),
        uploadId,
      },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
