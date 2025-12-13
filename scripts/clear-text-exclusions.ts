import { Client } from 'pg';

async function clearTextExclusions() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    await client.query(`DELETE FROM call_weather_exclusion_audit WHERE exclusion_strategy='NWS_WEATHER_TEXT_MATCH'`);
    await client.query(`DELETE FROM exclusion_logs WHERE strategy_key='WEATHER_TEXT_MATCH'`);
    await client.query(`UPDATE calls SET exclusion_type=NULL, exclusion_reason=NULL, excluded_at=NULL WHERE exclusion_reason LIKE '%Text-Based Match%'`);
    
    console.log('✅ Cleared all text-based weather exclusions');
  } finally {
    await client.end();
  }
}

clearTextExclusions().catch(console.error);

