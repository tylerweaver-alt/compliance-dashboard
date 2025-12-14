// Schema verification script
const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    // 1) Tables exist?
    console.log('\n=== TABLES CHECK ===');
    const tablesResult = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('ingestion_sources','ingestion_source_secrets','ingestion_worker_status','ingestion_sqlserver_logs')
      ORDER BY tablename
    `);
    console.log('Tables found:', tablesResult.rows.map(r => r.tablename));

    // 2) Columns
    console.log('\n=== COLUMNS CHECK ===');
    const columnsResult = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema='public'
        AND table_name IN ('ingestion_sources','ingestion_source_secrets','ingestion_worker_status','ingestion_sqlserver_logs')
      ORDER BY table_name, ordinal_position
    `);
    console.log('Columns:');
    columnsResult.rows.forEach(r => console.log(`  ${r.table_name}.${r.column_name} (${r.data_type})`));

    // 3) Default sqlserver row
    console.log('\n=== SQLSERVER SOURCE ROW ===');
    const sourceResult = await client.query(`SELECT * FROM ingestion_sources WHERE type = 'sqlserver'`);
    console.log('Source row:', sourceResult.rows[0] || 'NOT FOUND');

    // 4) Worker status
    console.log('\n=== WORKER STATUS ===');
    const statusResult = await client.query(`SELECT * FROM ingestion_worker_status WHERE source_id = (SELECT id FROM ingestion_sources WHERE type='sqlserver' LIMIT 1)`);
    console.log('Worker status:', statusResult.rows[0] || 'NOT FOUND');

    // 5) Secrets row (no password shown)
    console.log('\n=== SECRETS ROW (password hidden) ===');
    const secretsResult = await client.query(`SELECT source_id, host, port, database, username, password_encrypted IS NOT NULL as has_password, encrypt_connection, trust_server_cert FROM ingestion_source_secrets WHERE source_id = (SELECT id FROM ingestion_sources WHERE type='sqlserver' LIMIT 1)`);
    console.log('Secrets row:', secretsResult.rows[0] || 'NOT FOUND');

  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error(e); process.exit(1); });

