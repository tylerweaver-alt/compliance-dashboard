// Run the ingestion_source_secrets migration
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    const migrationPath = path.join(__dirname, '../db/migrations/ingestion_source_secrets.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('Running ingestion_source_secrets migration...');
    await client.query(sql);
    console.log('Migration completed successfully!');
    
    // Verify table exists
    const result = await client.query(`
      SELECT source_id, host, port, database, username, 
             password_encrypted IS NOT NULL as has_password, 
             encrypt_connection, trust_server_cert 
      FROM ingestion_source_secrets 
      WHERE source_id = (SELECT id FROM ingestion_sources WHERE type='sqlserver' LIMIT 1)
    `);
    console.log('Secrets row created:', result.rows[0] || 'NOT FOUND');
    
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(e => { console.error('Migration failed:', e.message); process.exit(1); });

