import { Pool } from "pg";

export const runtime = "nodejs";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parishIdStr = searchParams.get("parish_id");
    const start = searchParams.get("start"); // YYYY-MM-DD
    const end = searchParams.get("end");     // YYYY-MM-DD

    if (!parishIdStr) {
      return new Response(
        JSON.stringify({ error: "parish_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const parishId = parseInt(parishIdStr, 10);
    if (Number.isNaN(parishId)) {
      return new Response(
        JSON.stringify({ error: "Invalid parish_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!start || !end) {
      return new Response(
        JSON.stringify({
          error: "start and end (YYYY-MM-DD) are required",
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        select
          unit_name,
          incident_number,
          call_date,
          origin_address,
          origin_city,
          start_time,
          at_scene_time,
          response_seconds,
          zone_name,
          uploaded_by_user_id,
          uploaded_from_id
        from calls
        where parish_id = $1
          and call_date >= $2::date
          and call_date <= $3::date
        order by call_date, incident_number;
        `,
        [parishId, start, end]
      );

      const rows = result.rows;

      // CSV header
      const header = [
        "unit_name",
        "incident_number",
        "call_date",
        "origin_address",
        "origin_city",
        "start_time",
        "at_scene_time",
        "response_seconds",
        "zone_name",
        "uploaded_by_user_id",
        "uploaded_from_id",
      ];

      const csvLines: string[] = [];
      csvLines.push(header.join(","));

      const escape = (val: any): string => {
        if (val === null || val === undefined) return "";
        const s = String(val);
        if (s.includes('"') || s.includes(",") || s.includes("\n")) {
          return `"${s.replace(/"/g, '""')}"`;
        }
        return s;
      };

      const fmtTS = (val: any): string => {
        if (!val) return "";
        // pg timestamptz comes as string or Date; both work here
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) return String(val);
        // Local ISO-like without Z
        return d.toISOString().replace("T", " ").replace("Z", "");
      };

      for (const r of rows) {
        const line = [
          escape(r.unit_name),
          escape(r.incident_number),
          escape(r.call_date), // date → default to YYYY-MM-DD
          escape(r.origin_address),
          escape(r.origin_city),
          escape(fmtTS(r.start_time)),
          escape(fmtTS(r.at_scene_time)),
          escape(r.response_seconds),
          escape(r.zone_name),
          escape(r.uploaded_by_user_id),
          escape(r.uploaded_from_id),
        ].join(",");
        csvLines.push(line);
      }

      const csv = csvLines.join("\n");

      const filename = `calls_parish_${parishId}_${start}_to_${end}.csv`;

      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("Export calls error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to export calls",
        details: String(err?.message || err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
