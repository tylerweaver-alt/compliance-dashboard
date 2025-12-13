/**
 * Check what time edits exist in the database
 * This shows all edits that have been made to call times
 */

import { pool } from '../lib/db';

async function checkTimeEdits() {
  const client = await pool.connect();
  
  try {
    console.log('\n🔍 Checking for time edits in the database...\n');

    // Get all time edits
    const result = await client.query(`
      SELECT
        tel.id,
        tel.call_id,
        tel.field_name,
        tel.old_value,
        tel.new_value,
        tel.reason,
        tel.edited_by_email,
        tel.edited_by_name,
        tel.created_at,
        c.response_number
      FROM time_edit_logs tel
      LEFT JOIN calls c ON c.id = tel.call_id
      ORDER BY tel.created_at DESC
    `);

    if (result.rows.length === 0) {
      console.log('✅ No time edits found. All data is original.\n');
      return;
    }

    console.log(`📊 Found ${result.rows.length} time edit(s):\n`);
    console.log('─'.repeat(120));
    
    result.rows.forEach((edit, index) => {
      console.log(`\n${index + 1}. Call #${edit.response_number || edit.call_id}`);
      console.log(`   Field: ${edit.field_name}`);
      console.log(`   Old Value: ${edit.old_value || 'NULL'}`);
      console.log(`   New Value: ${edit.new_value || 'NULL'}`);
      console.log(`   Reason: ${edit.reason}`);
      console.log(`   Edited By: ${edit.edited_by_name || edit.edited_by_email}`);
      console.log(`   Edited At: ${edit.created_at}`);
    });

    console.log('\n' + '─'.repeat(120));
    console.log(`\n📝 Summary: ${result.rows.length} edit(s) can be reverted\n`);

  } catch (error) {
    console.error('❌ Error checking time edits:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the check
checkTimeEdits()
  .then(() => {
    console.log('✅ Check complete\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed:', error);
    process.exit(1);
  });

