import { pool } from "@/lib/db";

export const runtime = "nodejs";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: RouteParams) {
  const { id } = await params;

  if (!id) {
    return new Response(
      JSON.stringify({ error: "Upload id is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      select
        filename,
        file_mime_type,
        file_data
      from parish_uploads
      where id = $1;
      `,
      [id]
    );

    if (result.rowCount === 0) {
      return new Response(
        JSON.stringify({ error: "Upload not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const row = result.rows[0];

    const filename: string = row.filename || "upload.bin";
    const mimeType: string = row.file_mime_type || "application/octet-stream";
    const fileData: Buffer = row.file_data; // pg returns Buffer for bytea in Node

    // Convert Buffer to Uint8Array for Response compatibility
    return new Response(new Uint8Array(fileData), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err: any) {
    console.error("Download upload error:", err);
    return new Response(
      JSON.stringify({
        error: "Failed to download upload",
        details: String(err?.message || err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  } finally {
    client.release();
  }
}
