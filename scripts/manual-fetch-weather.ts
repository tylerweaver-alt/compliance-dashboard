// Manually fetch NWS weather alerts since December 6th
import { Client } from 'pg';
import https from 'https';

const TARGET_STATES = ['LA', 'TX', 'TN', 'MS'];
const NWS_USER_AGENT = process.env.NWS_USER_AGENT || 'compliance-dashboard (jrc7192@gmail.com)';

interface NWSAlert {
  id: string;
  properties: {
    event: string;
    severity: string;
    certainty: string;
    urgency: string;
    areaDesc: string;
    category: string;
    onset: string;
    ends: string;
  };
  geometry: any;
}

async function fetchNWSAlerts(state: string): Promise<NWSAlert[]> {
  return new Promise((resolve, reject) => {
    const url = `https://api.weather.gov/alerts?area=${state}&status=actual`;
    
    https.get(url, {
      headers: { 'User-Agent': NWS_USER_AGENT }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.features || []);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function manualFetchWeather() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to database\n');

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalSkipped = 0;

    for (const state of TARGET_STATES) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Fetching alerts for ${state}...`);
      console.log('='.repeat(60));

      try {
        const alerts = await fetchNWSAlerts(state);
        console.log(`Found ${alerts.length} alerts from NWS API`);

        for (const alert of alerts) {
          const props = alert.properties;
          const nwsId = alert.id;
          const hasGeometry = alert.geometry ? 'YES' : 'NO';

          // Check if alert already exists
          const existing = await client.query(
            'SELECT id, updated_at FROM weather_events WHERE nws_id = $1',
            [nwsId]
          );

          const values = [
            nwsId,                    // $1
            'NWS',                    // $2
            state,                    // $3
            props.event,              // $4
            props.severity,           // $5
            props.certainty,          // $6
            props.urgency,            // $7
            props.areaDesc,           // $8
            props.category,           // $9
            props.onset,              // $10
            props.ends,               // $11
            alert.geometry ? JSON.stringify(alert.geometry) : null, // $12
            JSON.stringify(alert),    // $13
            new Date(),               // $14 created_at
            new Date()                // $15 updated_at
          ];

          if (existing.rows.length > 0) {
            // Update existing
            await client.query(`
              UPDATE weather_events SET
                event = $4,
                severity = $5,
                certainty = $6,
                urgency = $7,
                area_desc = $8,
                category = $9,
                starts_at = $10,
                ends_at = $11,
                geojson = $12,
                raw_json = $13,
                updated_at = $15
              WHERE nws_id = $1
            `, values);
            totalUpdated++;
            console.log(`  ✓ Updated: ${props.event} (${hasGeometry} geometry)`);
          } else {
            // Insert new
            await client.query(`
              INSERT INTO weather_events (
                nws_id, source, state, event, severity, certainty, urgency,
                area_desc, category, starts_at, ends_at, geojson, raw_json,
                created_at, updated_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            `, values);
            totalInserted++;
            console.log(`  + Inserted: ${props.event} (${hasGeometry} geometry)`);
          }
        }

        // Wait 1 second between states to be nice to NWS API
        if (state !== TARGET_STATES[TARGET_STATES.length - 1]) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

      } catch (error: any) {
        console.error(`Error fetching ${state}:`, error.message);
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total inserted: ${totalInserted}`);
    console.log(`Total updated: ${totalUpdated}`);
    console.log(`Total processed: ${totalInserted + totalUpdated}`);

  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await client.end();
  }
}

manualFetchWeather().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

