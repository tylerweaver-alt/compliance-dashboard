-- ============================================================================
-- TEXT-BASED WEATHER AUTO-EXCLUSION FUNCTION
-- ============================================================================
-- This is a SECONDARY weather exclusion strategy that works when polygon data
-- is not available. It matches calls to weather alerts based on:
-- 1. Text-based area matching (county/city names)
-- 2. Temporal overlap (call time vs alert time)
-- 3. State matching
--
-- This runs AFTER polygon-based matching and only processes alerts without geojson.
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_weather_text_based_exclusions()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER := 0;
BEGIN
  -- Find calls that match weather alerts based on text area descriptions
  -- Only process alerts WITHOUT geojson (since polygon-based matching handles those)
  WITH text_matches AS (
    SELECT DISTINCT
      c.id as call_id,
      w.id as weather_event_id,
      w.event as weather_event_type,
      w.severity as weather_severity,
      w.area_desc as weather_area_desc,
      w.state as weather_state,
      GREATEST(
        c.response_date_time::timestamptz,
        w.starts_at
      ) AS overlap_start,
      LEAST(
        c.response_date_time::timestamptz + INTERVAL '2 hours',
        COALESCE(w.ends_at, w.starts_at + INTERVAL '24 hours')
      ) AS overlap_end,
      c.origin_location_city,
      c.response_area
    FROM calls c
    CROSS JOIN weather_events w
    WHERE 
      -- Only process weather alerts WITHOUT polygon data
      w.geojson IS NULL
      AND w.source = 'NWS'
      AND w.area_desc IS NOT NULL
      
      -- Temporal overlap: call time falls within alert period
      AND c.response_date_time::timestamptz >= w.starts_at
      AND c.response_date_time::timestamptz <= COALESCE(w.ends_at, w.starts_at + INTERVAL '24 hours')
      
      -- Text-based area matching: check if call location matches any area in alert
      -- Parse area_desc (semicolon-separated list) and check for exact matches
      -- Require minimum 4 characters to avoid false positives like "Lee" matching "Leesville"
      AND (
        -- Match against origin_location_city (exact match only, case-insensitive)
        (c.origin_location_city IS NOT NULL
         AND LENGTH(TRIM(c.origin_location_city)) >= 4
         AND EXISTS (
          SELECT 1 FROM unnest(string_to_array(w.area_desc, ';')) AS area_name
          WHERE TRIM(LOWER(area_name)) = LOWER(TRIM(c.origin_location_city))
        ))
      )
      -- Only match Louisiana alerts for now (since most calls are in LA)
      AND w.state = 'LA'
      
      -- Call must not already be excluded
      AND c.exclusion_type IS NULL
  ),
  
  -- Insert audit records for text-based matches
  inserted_audit AS (
    INSERT INTO call_weather_exclusion_audit (
      call_id,
      weather_event_id,
      exclusion_strategy,
      exclusion_reason,
      overlap_start,
      overlap_end,
      weather_event_type,
      weather_severity,
      weather_area_desc,
      extra
    )
    SELECT
      tm.call_id,
      tm.weather_event_id,
      'NWS_WEATHER_TEXT_MATCH',
      'Severe Weather Alert (Text-Based Match): ' || 
        COALESCE(tm.weather_event_type, 'Unknown Event') ||
        CASE WHEN tm.weather_severity IS NOT NULL 
          THEN ' (' || tm.weather_severity || ')' 
          ELSE '' 
        END ||
        ' - Call location (' || COALESCE(tm.origin_location_city, tm.response_area, 'Unknown') || 
        ') matched alert area',
      tm.overlap_start,
      tm.overlap_end,
      tm.weather_event_type,
      tm.weather_severity,
      tm.weather_area_desc,
      jsonb_build_object(
        'matching_method', 'text_based',
        'call_city', tm.origin_location_city,
        'call_zone', tm.response_area,
        'alert_areas', tm.weather_area_desc,
        'alert_state', tm.weather_state,
        'matched_at', now()
      )
    FROM text_matches tm
    ON CONFLICT (call_id, weather_event_id, exclusion_strategy) DO NOTHING
    RETURNING call_id, exclusion_reason
  ),
  
  -- Insert into exclusion_logs for unified audit trail
  inserted_logs AS (
    INSERT INTO exclusion_logs (
      call_id,
      exclusion_type,
      strategy_key,
      reason,
      engine_metadata
    )
    SELECT
      ia.call_id,
      'AUTO',
      'WEATHER_TEXT_MATCH',
      ia.exclusion_reason,
      jsonb_build_object(
        'matching_method', 'text_based',
        'applied_at', now()
      )
    FROM inserted_audit ia
    ON CONFLICT DO NOTHING
    RETURNING call_id
  )
  
  -- Update calls table to mark as excluded
  UPDATE calls c
  SET
    exclusion_type = 'AUTO',
    exclusion_reason = ia.exclusion_reason,
    excluded_at = now(),
    excluded_by_user_id = NULL
  FROM inserted_audit ia
  WHERE c.id = ia.call_id;
  
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Add comment explaining the function
COMMENT ON FUNCTION apply_weather_text_based_exclusions() IS 
'Secondary weather auto-exclusion function that uses text-based area matching when polygon data is not available. Matches calls to weather alerts based on city/county name matching and temporal overlap.';

