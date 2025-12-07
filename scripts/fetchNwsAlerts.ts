// scripts/fetchNwsAlerts.ts
import { Client } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const NWS_BASE = "https://api.weather.gov/alerts";

// Only fetch alerts for these states
const TARGET_STATES = ["LA", "TX", "TN", "MS"];

interface NwsAlertFeature {
  id: string;
  type: string;
  geometry: any;
  properties: {
    id: string;
    event: string | null;
    severity: string | null;
    areaDesc: string | null;

    sent: string | null;
    onset: string | null;
    effective: string | null;
    ends: string | null;
    expires: string | null;
    updated: string | null;

    [key: string]: any;
  };
}

interface NwsAlertResponse {
  type: string;
  features: NwsAlertFeature[];
  pagination?: { next?: string | null };
  links?: { next?: string | null };
}

/**
 * Fetch a single page of NWS alerts.
 */
async function fetchAlertsPage(url: string): Promise<NwsAlertResponse> {
  const userAgent = process.env.NWS_USER_AGENT;
  if (!userAgent) {
    throw new Error("NWS_USER_AGENT env var is required");
  }

  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/geo+json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NWS API error ${res.status}: ${text}`);
  }

  return (await res.json()) as NwsAlertResponse;
}

/**
 * Async generator to stream all alerts from the last 7 days for target states.
 * /alerts by default returns last 7 days of historical data.
 * We filter by state using the area parameter.
 */
async function* fetchAllAlerts(): AsyncGenerator<NwsAlertFeature> {
  // Fetch alerts for each target state
  for (const state of TARGET_STATES) {
    console.log(`Fetching alerts for ${state}...`);
    let url = `${NWS_BASE}?status=actual&limit=500&area=${state}`;

    while (url) {
      const data = await fetchAlertsPage(url);

      for (const feature of data.features ?? []) {
        yield feature;
      }

      const next =
        data.pagination?.next ??
        data.links?.next ??
        null;

      url = next ?? "";
      if (!url) break;
    }
  }
}

/**
 * Insert alerts into weather_events.
 */
async function insertAlertsIntoDb() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  await client.connect();

  try {
    // Ensure unique index on nws_id for ON CONFLICT
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS weather_events_nws_id_idx ON weather_events (nws_id)
    `);

    await client.query("BEGIN");

    const insertSql = `
      INSERT INTO weather_events (
        nws_id,
        source,
        state,
        event,
        severity,
        certainty,
        urgency,
        area_desc,
        category,
        starts_at,
        ends_at,
        geojson,
        raw_json,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (nws_id) DO NOTHING
    `;

    let count = 0;
    let skipped = 0;

    for await (const feature of fetchAllAlerts()) {
      const p = feature.properties;

      const startsAt = p.onset || p.effective || p.sent || null;
      const endsAt = p.ends || p.expires || null;
      const nwsId = p.id || feature.id;

      if (!startsAt || !endsAt || !nwsId) {
        skipped++;
        continue;
      }

      // Extract state from areaDesc (e.g., "Allen Parish, LA" -> "LA")
      const stateMatch = p.areaDesc?.match(/,\s*([A-Z]{2})(?:\s|$|;)/);
      const state = stateMatch ? stateMatch[1] : null;

      const values = [
        nwsId,                                                    // nws_id
        'NWS',                                                    // source
        state,                                                    // state
        p.event,                                                  // event
        p.severity,                                               // severity
        p.certainty,                                              // certainty
        p.urgency,                                                // urgency
        p.areaDesc,                                               // area_desc
        p.category,                                               // category
        startsAt,                                                 // starts_at
        endsAt,                                                   // ends_at
        feature.geometry ? JSON.stringify(feature.geometry) : null, // geojson
        JSON.stringify(p),                                        // raw_json
        p.sent || new Date().toISOString(),                       // created_at
        new Date().toISOString()                                  // updated_at
      ];

      await client.query(insertSql, values);
      count++;
    }

    console.log(`Skipped ${skipped} alerts with missing data`);

    await client.query("COMMIT");
    console.log(`Inserted ${count} weather alerts into weather_events`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error inserting alerts:", err);
    throw err;
  } finally {
    await client.end();
  }
}

export async function main() {
  await insertAlertsIntoDb();
}

// Run immediately (ES module style)
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

