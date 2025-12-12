/**
 * Backfill weather alerts for the full date range of calls.
 * Fetches historical NWS alerts and inserts them into weather_events.
 */

import { Client } from "pg";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// Load .env.local
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const USER_AGENT = process.env.NWS_USER_AGENT || "compliance-dashboard (contact@example.com)";

// Target states for alerts
const TARGET_STATES = ["LA", "TX", "TN", "MS"];

// NWS API base URL
const NWS_BASE = "https://api.weather.gov/alerts";

interface NwsAlertProperties {
  id?: string;
  event?: string;
  severity?: string;
  certainty?: string;
  urgency?: string;
  areaDesc?: string;
  category?: string;
  onset?: string;
  effective?: string;
  ends?: string;
  expires?: string;
  sent?: string;
  [key: string]: unknown;
}

interface NwsAlertFeature {
  id?: string;
  properties: NwsAlertProperties;
  geometry?: object | null;
}

interface NwsAlertsResponse {
  features?: NwsAlertFeature[];
  pagination?: { next?: string };
  links?: { next?: string };
}

async function fetchAlertsPage(url: string): Promise<NwsAlertsResponse> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    },
  });

  if (!res.ok) {
    if (res.status === 503) {
      console.log("  NWS API returned 503, waiting 5 seconds...");
      await new Promise((r) => setTimeout(r, 5000));
      return fetchAlertsPage(url);
    }
    throw new Error(`NWS API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<NwsAlertsResponse>;
}

async function* fetchAlertsForWindow(
  startDate: Date,
  endDate: Date,
  state: string
): AsyncGenerator<NwsAlertFeature> {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  
  let url = `${NWS_BASE}?start=${startIso}&end=${endIso}&status=actual&message_type=alert,update&limit=500&area=${state}`;

  while (url) {
    const data = await fetchAlertsPage(url);

    for (const feature of data.features ?? []) {
      yield feature;
    }

    const next = data.pagination?.next ?? data.links?.next ?? null;
    url = next ?? "";
    if (!url) break;
  }
}

async function getCallDateRange(client: Client): Promise<{ firstCall: Date; lastCall: Date }> {
  const result = await client.query(`
    SELECT
      MIN(safe_timestamptz(call_start_time)) AS first_call,
      MAX(safe_timestamptz(call_end_time)) AS last_call
    FROM calls_with_times
    WHERE safe_timestamptz(call_start_time) IS NOT NULL
      AND safe_timestamptz(call_end_time) IS NOT NULL
  `);

  const row = result.rows[0];
  if (!row.first_call || !row.last_call) {
    throw new Error("No calls with valid timestamps found");
  }

  return {
    firstCall: new Date(row.first_call),
    lastCall: new Date(row.last_call),
  };
}

export async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log("Connected to database");

  try {
    // Get call date range
    const { firstCall, lastCall } = await getCallDateRange(client);
    console.log(`Call date range: ${firstCall.toISOString()} to ${lastCall.toISOString()}`);

    // Ensure unique index exists
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS weather_events_nws_id_idx ON weather_events (nws_id)
    `);

    const insertSql = `
      INSERT INTO weather_events (
        nws_id, source, state, event, severity, certainty, urgency,
        area_desc, category, starts_at, ends_at, geojson, raw_json,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (nws_id) DO UPDATE SET
        event = EXCLUDED.event,
        severity = EXCLUDED.severity,
        certainty = EXCLUDED.certainty,
        urgency = EXCLUDED.urgency,
        area_desc = EXCLUDED.area_desc,
        category = EXCLUDED.category,
        starts_at = EXCLUDED.starts_at,
        ends_at = EXCLUDED.ends_at,
        geojson = EXCLUDED.geojson,
        raw_json = EXCLUDED.raw_json,
        updated_at = EXCLUDED.updated_at
    `;

    let totalInserted = 0;
    let totalSkipped = 0;

    // Loop through 3-day windows from firstCall to lastCall
    const windowDays = 3;
    let windowStart = new Date(firstCall);

    while (windowStart <= lastCall) {
      const windowEnd = new Date(windowStart);
      windowEnd.setDate(windowEnd.getDate() + windowDays);

      // Cap at lastCall
      if (windowEnd > lastCall) {
        windowEnd.setTime(lastCall.getTime());
      }

      console.log(`\nFetching alerts: ${windowStart.toISOString().split('T')[0]} to ${windowEnd.toISOString().split('T')[0]}`);

      for (const state of TARGET_STATES) {
        let stateCount = 0;
        let stateSkipped = 0;

        for await (const feature of fetchAlertsForWindow(windowStart, windowEnd, state)) {
          const p = feature.properties;
          const nwsId = p.id || feature.id;
          const startsAt = p.onset || p.effective || p.sent || null;
          const endsAt = p.ends || p.expires || null;

          if (!nwsId || !startsAt || !endsAt) {
            stateSkipped++;
            continue;
          }

          const values = [
            nwsId,
            "NWS",
            state,
            p.event,
            p.severity,
            p.certainty,
            p.urgency,
            p.areaDesc,
            p.category,
            startsAt,
            endsAt,
            feature.geometry ? JSON.stringify(feature.geometry) : null,
            JSON.stringify(p),
            p.sent || new Date().toISOString(),
            new Date().toISOString(),
          ];

          await client.query(insertSql, values);
          stateCount++;
        }

        if (stateCount > 0 || stateSkipped > 0) {
          console.log(`  ${state}: ${stateCount} alerts, ${stateSkipped} skipped`);
        }
        totalInserted += stateCount;
        totalSkipped += stateSkipped;
      }

      // Move to next window
      windowStart.setDate(windowStart.getDate() + windowDays);

      // Rate limiting - wait 500ms between windows
      await new Promise((r) => setTimeout(r, 500));
    }

    console.log(`\n✅ Backfill complete!`);
    console.log(`Total alerts inserted/updated: ${totalInserted}`);
    console.log(`Total alerts skipped: ${totalSkipped}`);

    // Check how many matches we have now
    const matchCount = await client.query(`SELECT COUNT(*) FROM call_weather_matches`);
    console.log(`\nCall-weather matches found: ${matchCount.rows[0].count}`);

  } finally {
    await client.end();
  }
}

// Run immediately (ES module style)
main().catch((err) => {
  console.error(err);
  process.exit(1);
});

