import { Client } from 'pg';

async function checkSchema() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name='time_edit_logs' 
      ORDER BY ordinal_position
    `);
    
    console.log('time_edit_logs table schema:');
    console.log(JSON.stringify(result.rows, null, 2));
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      console.log('❌ time_edit_logs table does NOT exist');
    } else {
      console.error('Error:', error);
    }
  } finally {
    await client.end();
  }
}

checkSchema().catch(console.error);

