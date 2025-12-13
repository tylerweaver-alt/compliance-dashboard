# Text-Based Weather Auto-Exclusion System

## Overview

This is a **SECONDARY** weather auto-exclusion strategy that works when NWS weather alerts don't have polygon (geojson) data. It uses text-based area matching and temporal overlap instead of spatial (point-in-polygon) matching.

## Problem It Solves

The NWS API has stopped providing polygon geometry for most weather alerts. As of December 2025:
- **0 out of 47 recent alerts** have polygon data
- Without polygons, the primary spatial matching system cannot work
- This text-based system provides a fallback matching method

## How It Works

### Matching Criteria

The system matches calls to weather alerts based on THREE criteria:

1. **Text-Based Area Matching**
   - Parses the weather alert's `area_desc` field (e.g., "Tyler; Hardin; Northern Jasper...")
   - Compares with the call's `origin_location_city`
   - Requires EXACT match (case-insensitive) to avoid false positives
   - Minimum 4 characters required to prevent matches like "Lee" → "Leesville"

2. **Temporal Overlap**
   - Call's `response_date_time` must fall within the alert's time period
   - Alert period: `starts_at` to `ends_at` (or +24 hours if no end time)

3. **State Filtering**
   - Currently limited to Louisiana (LA) alerts only
   - Can be expanded to other states as needed

### Exclusion Process

When a match is found:

1. **Audit Record Created** in `call_weather_exclusion_audit`:
   - `exclusion_strategy`: `'NWS_WEATHER_TEXT_MATCH'`
   - `exclusion_reason`: Detailed description with event type, severity, and matched location
   - `extra`: JSON metadata with matching details

2. **Exclusion Log Created** in `exclusion_logs`:
   - `exclusion_type`: `'AUTO'`
   - `strategy_key`: `'WEATHER_TEXT_MATCH'`
   - Full audit trail

3. **Call Updated** in `calls` table:
   - `exclusion_type`: `'AUTO'`
   - `exclusion_reason`: Human-readable reason
   - `excluded_at`: Timestamp

### Example Exclusion Reason

```
Severe Weather Alert (Text-Based Match): Dense Fog Advisory (Moderate) - Call location (Alexandria) matched alert area
```

## Database Function

### Function Name
```sql
apply_weather_text_based_exclusions()
```

### Returns
- Integer: Number of calls excluded

### Usage
```sql
-- Run manually
SELECT apply_weather_text_based_exclusions();

-- Check results
SELECT COUNT(*) FROM call_weather_exclusion_audit 
WHERE exclusion_strategy = 'NWS_WEATHER_TEXT_MATCH';
```

## Installation

```bash
# Install the function
npx tsx scripts/install-text-based-weather-exclusions.ts

# Clear text-based exclusions (if needed)
npx tsx scripts/clear-text-exclusions.ts
```

## Integration with Auto-Exclusion Engine

This function should be called:
1. **AFTER** polygon-based weather matching
2. **During** CSV upload processing
3. **Periodically** when new weather alerts are fetched

## Limitations

### Current Limitations
1. **Only matches Louisiana (LA) alerts** - can be expanded
2. **Requires exact city name match** - won't match variations
3. **No county-to-city mapping** - relies on exact text matches
4. **Minimum 4-character city names** - prevents some valid short names

### Why No Recent Matches?
- Recent weather alerts (Dec 10+) are in TX and TN, not LA
- Call data is from Oct-Nov 2025
- No temporal overlap between calls and recent alerts

## Future Enhancements

### Possible Improvements
1. **Add county-to-city mapping database**
   - Map NWS county names to cities within those counties
   - Enable more accurate matching

2. **Expand to other states**
   - Remove LA-only filter
   - Add state matching based on parish/region

3. **Fuzzy matching**
   - Handle variations like "St. Mary" vs "Saint Mary"
   - Match partial county names

4. **Integration with geocoding API**
   - Reverse geocode call lat/lon to get county
   - Match against NWS county names

## Comparison: Polygon vs Text-Based Matching

| Feature | Polygon-Based | Text-Based |
|---------|--------------|------------|
| **Accuracy** | Very High (spatial) | Medium (text match) |
| **Precision** | Exact point-in-polygon | County/city level |
| **Data Required** | GeoJSON polygons | Area descriptions |
| **NWS Coverage** | ~3% of alerts | ~100% of alerts |
| **False Positives** | Very Low | Low (with filters) |
| **Performance** | Slower (spatial ops) | Faster (text match) |

## Monitoring

### Check Text-Based Exclusions
```sql
SELECT 
  COUNT(*) as total_exclusions,
  COUNT(DISTINCT call_id) as unique_calls,
  COUNT(DISTINCT weather_event_id) as unique_alerts
FROM call_weather_exclusion_audit
WHERE exclusion_strategy = 'NWS_WEATHER_TEXT_MATCH';
```

### View Recent Exclusions
```sql
SELECT 
  c.response_number,
  c.response_date,
  c.origin_location_city,
  a.weather_event_type,
  a.weather_severity,
  a.exclusion_reason
FROM calls c
JOIN call_weather_exclusion_audit a ON a.call_id = c.id
WHERE a.exclusion_strategy = 'NWS_WEATHER_TEXT_MATCH'
ORDER BY c.response_date DESC
LIMIT 10;
```

## Files

- `scripts/setup-text-based-weather-exclusions.sql` - SQL function definition
- `scripts/install-text-based-weather-exclusions.ts` - Installation script
- `scripts/clear-text-exclusions.ts` - Cleanup script
- `docs/TEXT_BASED_WEATHER_EXCLUSIONS.md` - This documentation

## Summary

✅ **Installed and ready to use**  
✅ **Handles alerts without polygon data**  
✅ **Full audit trail**  
✅ **Prevents false positives**  
⚠️ **Currently no matches** (no temporal overlap with recent alerts)  
🔄 **Will activate when LA weather alerts occur during call times**

