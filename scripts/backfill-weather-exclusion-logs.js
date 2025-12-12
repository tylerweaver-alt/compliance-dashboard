/**
 * Backfill exclusion_logs table with updated weather reasons
 * 
 * The exclusion_logs table is what the Audit Log displays, so we need to update
 * the reasons there to show the weather type.
 */

const { Pool } = require('pg');
require('dotenv').config({ path: '.env.local' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    console.log('=== Backfilling Exclusion Logs with Weather Types ===\n');
    
    // Step 1: Update existing exclusion_logs entries
    console.log('1. Updating existing exclusion_logs entries...');
    
    const updateResult = await client.query(`
      UPDATE exclusion_logs el
      SET reason = 
        'Severe Weather Alert: ' || COALESCE(a.weather_event_type, 'Unknown') ||
        CASE WHEN a.weather_severity IS NOT NULL AND a.weather_severity != ''
          THEN ' (' || a.weather_severity || ')'
          ELSE ''
        END
      FROM call_weather_exclusion_audit a
      WHERE el.call_id = a.call_id
        AND el.strategy_key IN ('NWS_WEATHER_ALERT', 'WEATHER')
        AND el.reverted_at IS NULL
        AND el.reason IN (
          'Out-of-compliance call excluded due to NWS weather alert active during response',
          'Call occurred during active NWS weather alert inside alert polygon'
        )
      RETURNING el.id, el.call_id, el.reason
    `);
    
    console.log(`   ✓ Updated ${updateResult.rowCount} exclusion log entries\n`);
    
    if (updateResult.rowCount > 0) {
      console.log('   Sample updated logs:');
      updateResult.rows.slice(0, 5).forEach(row => {
        console.log(`     - Log ${row.id} (Call ${row.call_id}): ${row.reason}`);
      });
      console.log('');
    }
    
    // Step 2: Create missing exclusion_logs entries for weather exclusions
    console.log('2. Creating missing exclusion_logs entries...');
    
    const insertResult = await client.query(`
      INSERT INTO exclusion_logs (
        call_id,
        exclusion_type,
        strategy_key,
        reason,
        engine_metadata
      )
      SELECT
        c.id,
        'AUTO',
        c.auto_exclusion_strategy,
        c.auto_exclusion_reason,
        c.auto_exclusion_metadata
      FROM calls c
      WHERE c.auto_exclusion_strategy IN ('NWS_WEATHER_ALERT', 'WEATHER')
        AND c.is_auto_excluded = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM exclusion_logs el
          WHERE el.call_id = c.id
            AND el.reverted_at IS NULL
        )
      RETURNING id, call_id, reason
    `);
    
    console.log(`   ✓ Created ${insertResult.rowCount} new exclusion log entries\n`);
    
    if (insertResult.rowCount > 0) {
      console.log('   Sample new logs:');
      insertResult.rows.slice(0, 5).forEach(row => {
        console.log(`     - Log ${row.id} (Call ${row.call_id}): ${row.reason}`);
      });
      console.log('');
    }
    
    // Step 3: Verify the changes
    console.log('3. Verifying exclusion logs...');
    const verifyResult = await client.query(`
      SELECT 
        el.id,
        el.call_id,
        el.reason,
        el.strategy_key,
        c.response_number
      FROM exclusion_logs el
      JOIN calls c ON el.call_id = c.id
      WHERE el.strategy_key IN ('NWS_WEATHER_ALERT', 'WEATHER')
        AND el.reverted_at IS NULL
      ORDER BY el.created_at DESC
      LIMIT 10
    `);
    
    console.log(`   Found ${verifyResult.rowCount} weather exclusion logs:`);
    verifyResult.rows.forEach(row => {
      console.log(`     - ${row.response_number}: ${row.reason}`);
    });
    
    console.log('\n=== Backfill Complete ===');
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);

