/**
 * API Route: /api/cron/fetch-weather
 * 
 * Fetches latest NWS weather alerts and inserts them into weather_events table.
 * Designed to be called by Vercel Cron or other scheduling service.
 * 
 * Schedule: Hourly
 * 
 * Security: Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max execution time

const NWS_BASE = 'https://api.weather.gov/alerts';
const TARGET_STATES = ['LA', 'TX', 'TN', 'MS'];

interface NwsAlertFeature {
  id?: string;
  type: string;
  geometry?: any;
  properties: {
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
    [key: string]: any;
  };
}

interface NwsAlertResponse {
  type: string;
  features: NwsAlertFeature[];
  pagination?: { next?: string | null };
  links?: { next?: string | null };
}

async function fetchAlertsPage(url: string, userAgent: string): Promise<NwsAlertResponse> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': userAgent,
      'Accept': 'application/geo+json'
    }
  });

  if (!res.ok) {
    if (res.status === 503) {
      console.log('NWS API returned 503, waiting 5 seconds...');
      await new Promise(r => setTimeout(r, 5000));
      return fetchAlertsPage(url, userAgent);
    }
    throw new Error(`NWS API error: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<NwsAlertResponse>;
}

async function* fetchAllAlerts(userAgent: string): AsyncGenerator<NwsAlertFeature> {
  for (const state of TARGET_STATES) {
    console.log(`Fetching alerts for ${state}...`);
    let url = `${NWS_BASE}?status=actual&limit=500&area=${state}`;

    while (url) {
      const data = await fetchAlertsPage(url, userAgent);

      for (const feature of data.features ?? []) {
        yield feature;
      }

      const next = data.pagination?.next ?? data.links?.next ?? null;
      url = next ?? '';
      if (!url) break;
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Security: Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userAgent = process.env.NWS_USER_AGENT;
    if (!userAgent) {
      return NextResponse.json(
        { error: 'NWS_USER_AGENT environment variable not set' },
        { status: 500 }
      );
    }

    const client = new Client({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    console.log('Connected to database');

    try {
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

      let count = 0;
      let skipped = 0;

      for await (const feature of fetchAllAlerts(userAgent)) {
        const p = feature.properties;

        const startsAt = p.onset || p.effective || p.sent || null;
        const endsAt = p.ends || p.expires || null;
        const nwsId = p.id || feature.id;

        if (!startsAt || !endsAt || !nwsId) {
          skipped++;
          continue;
        }

        // Extract state from areaDesc
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

      console.log(`Inserted/updated ${count} weather alerts`);
      console.log(`Skipped ${skipped} alerts with missing data`);

      return NextResponse.json({
        success: true,
        inserted: count,
        skipped: skipped,
        timestamp: new Date().toISOString()
      });

    } finally {
      await client.end();
    }

  } catch (error: any) {
    console.error('Error fetching weather alerts:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

