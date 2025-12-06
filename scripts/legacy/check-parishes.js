// Legacy script: moved here because it appears unused; kept for reference.
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Manual env loading
const envFile = fs.readFileSync(path.join(__dirname, '.env.local'), 'utf8');
envFile.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) {
    process.env[key.trim()] = vals.join('=').trim();
  }
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    // Check parishes columns
    const cols = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'parishes' 
      ORDER BY ordinal_position
    `);
    console.log('Parishes columns:', cols.rows.map(r => r.column_name).join(', '));
    
    // Check a sample parish
    const sample = await client.query('SELECT * FROM parishes LIMIT 1');
    console.log('Sample parish:', sample.rows[0]);
    
    // Check regions columns
    const regionCols = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'regions'
      ORDER BY ordinal_position
    `);
    console.log('Regions columns:', regionCols.rows.map(r => r.column_name).join(', '));

    // Check regions
    const regions = await client.query('SELECT * FROM regions LIMIT 3');
    console.log('Sample regions:', regions.rows);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    client.release();
    pool.end();
  }
}

main();
