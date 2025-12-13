/**
 * Revert all time edits back to original values
 * This safely reverts all changes made through the time edit feature
 */

import { pool } from '../lib/db';

async function revertTimeEdits() {
  const client = await pool.connect();
  
  try {
    console.log('\n🔄 Starting time edit revert process...\n');

    // Start transaction
    await client.query('BEGIN');

    // Get all time edits grouped by call and field
    const editsResult = await client.query(`
      SELECT
        tel.call_id,
        tel.field_name,
        tel.old_value,
        tel.new_value,
        c.response_number,
        MIN(tel.created_at) as first_edit_time
      FROM time_edit_logs tel
      LEFT JOIN calls c ON c.id = tel.call_id
      GROUP BY tel.call_id, tel.field_name, tel.old_value, tel.new_value, c.response_number
      ORDER BY tel.call_id, tel.field_name
    `);

    if (editsResult.rows.length === 0) {
      console.log('✅ No time edits found. Nothing to revert.\n');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`📊 Found ${editsResult.rows.length} field(s) to revert:\n`);

    // Group edits by call_id and field to find the original value
    const revertsMap = new Map<string, { callId: number; fieldName: string; originalValue: string; currentValue: string; responseNumber: string }>();

    for (const edit of editsResult.rows) {
      const key = `${edit.call_id}_${edit.field_name}`;
      
      if (!revertsMap.has(key)) {
        revertsMap.set(key, {
          callId: edit.call_id,
          fieldName: edit.field_name,
          originalValue: edit.old_value,
          currentValue: edit.new_value,
          responseNumber: edit.response_number
        });
      }
    }

    // Revert each field
    let revertCount = 0;
    for (const [key, revert] of revertsMap) {
      console.log(`\n🔄 Reverting Call #${revert.responseNumber || revert.callId}`);
      console.log(`   Field: ${revert.fieldName}`);
      console.log(`   Current: ${revert.currentValue || 'NULL'}`);
      console.log(`   Reverting to: ${revert.originalValue || 'NULL'}`);

      // Update the call record
      const updateQuery = `
        UPDATE calls 
        SET ${revert.fieldName} = $1
        WHERE id = $2
      `;
      
      await client.query(updateQuery, [revert.originalValue, revert.callId]);
      revertCount++;
    }

    // Delete all time edit logs (since we're reverting everything)
    const deleteResult = await client.query('DELETE FROM time_edit_logs');
    
    console.log('\n' + '─'.repeat(80));
    console.log(`\n✅ Successfully reverted ${revertCount} field(s)`);
    console.log(`🗑️  Deleted ${deleteResult.rowCount} edit log(s)\n`);

    // Commit transaction
    await client.query('COMMIT');
    console.log('✅ Transaction committed. All changes reverted!\n');

  } catch (error) {
    // Rollback on error
    await client.query('ROLLBACK');
    console.error('\n❌ Error during revert. Transaction rolled back:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Run the revert
revertTimeEdits()
  .then(() => {
    console.log('✅ Revert complete. All time values restored to original.\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Revert failed:', error);
    process.exit(1);
  });

