import { pool } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const parishIdStr = searchParams.get("parish_id");

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

    const client = await pool.connect();
    try {
      const result = await client.query(
        `
        select
          id,
          parish_id,
          filename,
          file_size_bytes,
          file_mime_type,
          uploaded_by_username,
          uploaded_at,
          status,
          rows_imported,
          data_month,
          data_year
        from parish_uploads
        where parish_id = $1
        order by uploaded_at desc;
        `,
        [parishId]
      );

      return new Response(
        JSON.stringify({
          ok: true,
          parishId,
          uploads: result.rows,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error("List uploads error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to list uploads",
        details: String(err?.message || err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
