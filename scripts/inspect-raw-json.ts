// Inspect raw_json from weather_events to see if polygon data exists there
import { Client } from 'pg';

async function inspectRawJson() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    // Get a recent alert with raw_json
    const result = await client.query(`
      SELECT 
        id,
        nws_id,
        event,
        state,
        starts_at,
        geojson,
        raw_json
      FROM weather_events
      WHERE source = 'NWS'
        AND starts_at >= '2025-12-10'
        AND raw_json IS NOT NULL
      ORDER BY starts_at DESC
      LIMIT 3
    `);

    console.log(`Found ${result.rows.length} recent alerts with raw_json\n`);

    for (const row of result.rows) {
      console.log('='.repeat(80));
      console.log(`Alert ID: ${row.id}`);
      console.log(`NWS ID: ${row.nws_id}`);
      console.log(`Event: ${row.event}`);
      console.log(`State: ${row.state}`);
      console.log(`Starts: ${row.starts_at}`);
      console.log(`Has geojson column: ${row.geojson ? 'YES' : 'NO'}`);
      console.log('='.repeat(80));

      if (row.raw_json) {
        const rawData = typeof row.raw_json === 'string' 
          ? JSON.parse(row.raw_json) 
          : row.raw_json;

        console.log('\n📦 RAW JSON STRUCTURE:');
        console.log('  - id:', rawData.id ? 'Present' : 'Missing');
        console.log('  - type:', rawData.type);
        console.log('  - geometry:', rawData.geometry ? 'Present' : 'Missing');
        console.log('  - properties:', rawData.properties ? 'Present' : 'Missing');

        if (rawData.geometry) {
          console.log('\n🗺️  GEOMETRY DATA FOUND IN RAW_JSON:');
          console.log('  - Type:', rawData.geometry.type);
          
          if (rawData.geometry.type === 'Polygon') {
            const coords = rawData.geometry.coordinates;
            console.log('  - Polygon rings:', coords.length);
            console.log('  - Points in first ring:', coords[0]?.length || 0);
            console.log('  - Sample coordinates (first 3 points):');
            coords[0]?.slice(0, 3).forEach((point: number[], idx: number) => {
              console.log(`    ${idx + 1}. [${point[0]}, ${point[1]}]`);
            });
          } else if (rawData.geometry.type === 'MultiPolygon') {
            const coords = rawData.geometry.coordinates;
            console.log('  - Number of polygons:', coords.length);
            console.log('  - Points in first polygon:', coords[0]?.[0]?.length || 0);
          } else if (rawData.geometry.type === 'GeometryCollection') {
            console.log('  - Geometries in collection:', rawData.geometry.geometries?.length || 0);
            rawData.geometry.geometries?.forEach((geom: any, idx: number) => {
              console.log(`    ${idx + 1}. ${geom.type}`);
            });
          }

          console.log('\n✅ POLYGON DATA IS AVAILABLE IN RAW_JSON!');
          console.log('   This can be extracted and used for spatial matching.');
        } else {
          console.log('\n❌ NO GEOMETRY IN RAW_JSON');
        }

        if (rawData.properties) {
          console.log('\n📋 PROPERTIES:');
          console.log('  - Event:', rawData.properties.event);
          console.log('  - Severity:', rawData.properties.severity);
          console.log('  - Certainty:', rawData.properties.certainty);
          console.log('  - Urgency:', rawData.properties.urgency);
          console.log('  - Area Description:', rawData.properties.areaDesc?.substring(0, 60) + '...');
          console.log('  - Onset:', rawData.properties.onset);
          console.log('  - Ends:', rawData.properties.ends);
        }

        // Compare geojson column vs raw_json.geometry
        console.log('\n🔍 COMPARISON:');
        console.log('  - geojson column:', row.geojson ? 'HAS DATA' : 'NULL');
        console.log('  - raw_json.geometry:', rawData.geometry ? 'HAS DATA' : 'NULL');
        
        if (!row.geojson && rawData.geometry) {
          console.log('\n⚠️  MISMATCH DETECTED!');
          console.log('   The geojson column is NULL but raw_json contains geometry!');
          console.log('   This geometry data could be extracted and used.');
        }
      }

      console.log('\n');
    }

    // Check how many alerts have geometry in raw_json but not in geojson column
    const mismatchResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE geojson IS NULL AND raw_json->>'geometry' IS NOT NULL) as has_raw_geometry_only,
        COUNT(*) FILTER (WHERE geojson IS NOT NULL) as has_geojson_column,
        COUNT(*) FILTER (WHERE geojson IS NULL AND raw_json->>'geometry' IS NULL) as no_geometry_anywhere,
        COUNT(*) as total
      FROM weather_events
      WHERE source = 'NWS'
        AND starts_at >= '2025-12-10'
    `);

    console.log('='.repeat(80));
    console.log('GEOMETRY DATA ANALYSIS (Alerts since Dec 10):');
    console.log('='.repeat(80));
    console.log(`Total alerts: ${mismatchResult.rows[0].total}`);
    console.log(`Has geometry in geojson column: ${mismatchResult.rows[0].has_geojson_column}`);
    console.log(`Has geometry in raw_json only: ${mismatchResult.rows[0].has_raw_geometry_only}`);
    console.log(`No geometry anywhere: ${mismatchResult.rows[0].no_geometry_anywhere}`);

    if (parseInt(mismatchResult.rows[0].has_raw_geometry_only) > 0) {
      console.log('\n✅ GOOD NEWS: Geometry data exists in raw_json!');
      console.log('   We can extract it and populate the geojson column.');
    } else {
      console.log('\n❌ BAD NEWS: No geometry data in raw_json either.');
      console.log('   The NWS API is not providing polygon data for these alerts.');
    }

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

inspectRawJson().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

