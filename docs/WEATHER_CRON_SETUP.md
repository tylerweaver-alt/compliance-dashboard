# Automated Weather Alert Fetching

## Overview

The system automatically fetches NWS (National Weather Service) weather alerts **every hour** and stores them in the `weather_events` table. This ensures the weather auto-exclusion system always has up-to-date weather data.

## How It Works

### 1. Vercel Cron Job
- **Schedule:** Every hour (at minute 0)
- **Cron Expression:** `0 * * * *`
- **Endpoint:** `/api/cron/fetch-weather`
- **Configuration:** `vercel.json`

### 2. API Endpoint
- **File:** `app/api/cron/fetch-weather/route.ts`
- **Method:** GET
- **Security:** Protected by `CRON_SECRET` environment variable
- **Max Duration:** 5 minutes
- **Target States:** LA, TX, TN, MS

### 3. Data Flow
1. Vercel Cron triggers the endpoint every hour
2. Endpoint fetches latest alerts from NWS API for each state
3. Alerts are inserted/updated in `weather_events` table
4. Duplicate alerts are handled via `ON CONFLICT` (upsert)
5. Response includes count of inserted/updated alerts

## Environment Variables Required

### `NWS_USER_AGENT` (Required)
Your contact information for NWS API requests.

**Format:** `"application-name (contact-email)"`

**Example:** `"compliance-dashboard (jrc7192@gmail.com)"`

**Where to set:**
- Vercel Dashboard → Project Settings → Environment Variables
- Add to `.env.local` for local development

### `CRON_SECRET` (Optional but Recommended)
Secret token to protect the cron endpoint from unauthorized access.

**How to generate:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Where to set:**
- Vercel Dashboard → Project Settings → Environment Variables
- Add to `.env.local` for local development

**How Vercel uses it:**
Vercel automatically includes `Authorization: Bearer <CRON_SECRET>` header when calling cron endpoints.

## Deployment

### Initial Setup
1. Add environment variables to Vercel:
   - `NWS_USER_AGENT`
   - `CRON_SECRET` (optional)

2. Deploy the application:
   ```bash
   git add vercel.json app/api/cron/fetch-weather/route.ts
   git commit -m "Add automated weather alert fetching"
   git push
   ```

3. Verify cron is registered:
   - Go to Vercel Dashboard → Project → Settings → Cron Jobs
   - You should see: `/api/cron/fetch-weather` scheduled for `0 * * * *`

### Testing

#### Test Locally
```bash
# Set environment variables in .env.local
NWS_USER_AGENT="compliance-dashboard (your-email@example.com)"
CRON_SECRET="your-secret-here"

# Run the endpoint manually
curl http://localhost:3000/api/cron/fetch-weather \
  -H "Authorization: Bearer your-secret-here"
```

#### Test on Vercel
```bash
# Call the production endpoint
curl https://your-app.vercel.app/api/cron/fetch-weather \
  -H "Authorization: Bearer your-secret-here"
```

#### Check Logs
- Vercel Dashboard → Project → Deployments → [Latest] → Functions
- Look for `/api/cron/fetch-weather` logs
- Should show: "Inserted/updated X weather alerts"

## Monitoring

### Check Last Run
Query the database to see when alerts were last updated:

```sql
SELECT 
  MAX(updated_at) as last_update,
  COUNT(*) as total_alerts,
  COUNT(CASE WHEN updated_at > NOW() - INTERVAL '2 hours' THEN 1 END) as recent_updates
FROM weather_events
WHERE source = 'NWS';
```

### Verify Hourly Updates
```sql
SELECT 
  DATE_TRUNC('hour', updated_at) as hour,
  COUNT(*) as alerts_updated
FROM weather_events
WHERE source = 'NWS'
  AND updated_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;
```

## Troubleshooting

### Cron Not Running
1. Check Vercel Dashboard → Cron Jobs to verify it's registered
2. Check deployment logs for errors
3. Verify `vercel.json` is in the root directory
4. Redeploy the application

### No Alerts Being Inserted
1. Check NWS API status: https://api.weather.gov/alerts?area=LA
2. Verify `NWS_USER_AGENT` is set correctly
3. Check function logs for API errors
4. NWS API may return 503 during maintenance (script retries automatically)

### Authentication Errors
1. Verify `CRON_SECRET` matches in both:
   - Vercel environment variables
   - Your test requests
2. Vercel automatically adds the header for scheduled cron jobs

## Manual Fetch

If you need to manually fetch alerts outside the hourly schedule:

```bash
# Using the cron endpoint
curl https://your-app.vercel.app/api/cron/fetch-weather \
  -H "Authorization: Bearer your-cron-secret"

# Or run the script directly
npx tsx scripts/fetchNwsAlerts.ts
```

## Data Retention

- Alerts are **upserted** (insert or update) based on `nws_id`
- Old alerts are NOT automatically deleted
- Consider adding a cleanup job if storage becomes an issue:

```sql
-- Delete alerts older than 90 days
DELETE FROM weather_events
WHERE source = 'NWS'
  AND ends_at < NOW() - INTERVAL '90 days';
```

## Related Files

- `app/api/cron/fetch-weather/route.ts` - Cron endpoint
- `vercel.json` - Cron schedule configuration
- `scripts/fetchNwsAlerts.ts` - Manual fetch script
- `lib/autoExclusions/strategies/weather.ts` - Weather exclusion strategy

