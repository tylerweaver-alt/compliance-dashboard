const { Pool } = require('pg');

(async () => {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Get all tables
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('Tables in database:');
    console.log(JSON.stringify(tablesResult.rows, null, 2));

    // Get column info for each table
    for (const row of tablesResult.rows) {
      const tableName = row.table_name;
      const columnsResult = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);

      console.log(`\n\n=== ${tableName} ===`);
      console.log(JSON.stringify(columnsResult.rows, null, 2));
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
})();

