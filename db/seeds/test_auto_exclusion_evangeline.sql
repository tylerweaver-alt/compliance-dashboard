-- Test Auto-Exclusion for Evangeline Parish (November 2025)
-- Run this in Neon SQL Editor

-- First, get Evangeline parish ID
-- SELECT id, name FROM parishes WHERE name ILIKE '%evangeline%';

-- Assuming Evangeline parish_id (update if different after running above query)
DO $$
DECLARE
  v_parish_id UUID;
  v_call_id_1 UUID;
  v_call_id_2 UUID;
  v_call_id_3 UUID;
  v_excluded_call_id UUID;
BEGIN
  -- Get Evangeline parish ID
  SELECT id INTO v_parish_id FROM parishes WHERE name ILIKE '%evangeline%' LIMIT 1;
  
  IF v_parish_id IS NULL THEN
    RAISE EXCEPTION 'Evangeline parish not found';
  END IF;

  -- Find 3 existing calls in November in Evangeline to use as "window calls"
  SELECT id INTO v_call_id_1 FROM calls 
  WHERE parish_id = v_parish_id 
    AND response_date LIKE '%11/%/2025%'
  ORDER BY id LIMIT 1 OFFSET 0;

  SELECT id INTO v_call_id_2 FROM calls 
  WHERE parish_id = v_parish_id 
    AND response_date LIKE '%11/%/2025%'
  ORDER BY id LIMIT 1 OFFSET 1;

  SELECT id INTO v_call_id_3 FROM calls 
  WHERE parish_id = v_parish_id 
    AND response_date LIKE '%11/%/2025%'
  ORDER BY id LIMIT 1 OFFSET 2;

  -- Pick a 4th call to be the one that gets auto-excluded
  SELECT id INTO v_excluded_call_id FROM calls 
  WHERE parish_id = v_parish_id 
    AND response_date LIKE '%11/%/2025%'
    AND is_excluded IS NOT TRUE
  ORDER BY id LIMIT 1 OFFSET 3;

  IF v_excluded_call_id IS NULL THEN
    RAISE EXCEPTION 'No available calls found in Evangeline for November';
  END IF;

  -- Update the call to be auto-excluded
  UPDATE calls SET
    is_excluded = TRUE,
    exclusion_type = 'AUTO',
    exclusion_reason = 'Peak Call Load: Calls 1234, 5678, and 9012 all occurred within a 45-minute window',
    excluded_at = '2025-11-15 14:30:00'::timestamptz,
    is_auto_excluded = TRUE,
    auto_exclusion_strategy = 'PEAK_CALL_LOAD',
    auto_exclusion_reason = 'Peak Call Load: Calls 1234, 5678, and 9012 all occurred within a 45-minute window',
    auto_excluded_at = '2025-11-15 14:30:00'::timestamptz,
    auto_exclusion_evaluated = TRUE,
    auto_exclusion_evaluated_at = '2025-11-15 14:30:00'::timestamptz,
    auto_exclusion_metadata = jsonb_build_object(
      'windowMinutes', 45,
      'callsInWindow', 4,
      'callPosition', 4,
      'parishName', 'Evangeline',
      'windowCalls', jsonb_build_array(
        jsonb_build_object('callId', v_call_id_1::text, 'responseNumber', '2025-1234', 'queueTime', '14:05', 'isCompliant', false, 'wasExcluded', false),
        jsonb_build_object('callId', v_call_id_2::text, 'responseNumber', '2025-5678', 'queueTime', '14:18', 'isCompliant', false, 'wasExcluded', false),
        jsonb_build_object('callId', v_call_id_3::text, 'responseNumber', '2025-9012', 'queueTime', '14:32', 'isCompliant', false, 'wasExcluded', false),
        jsonb_build_object('callId', v_excluded_call_id::text, 'responseNumber', '2025-TEST', 'queueTime', '14:45', 'isCompliant', false, 'wasExcluded', true)
      )
    )
  WHERE id = v_excluded_call_id;

  -- Also insert into exclusion_logs for audit trail
  INSERT INTO exclusion_logs (
    call_id,
    exclusion_type,
    strategy_key,
    reason,
    engine_metadata,
    created_by_email
  ) VALUES (
    v_excluded_call_id,
    'AUTO',
    'PEAK_CALL_LOAD',
    'Peak Call Load: Calls 1234, 5678, and 9012 all occurred within a 45-minute window',
    jsonb_build_object(
      'windowMinutes', 45,
      'callsInWindow', 4,
      'callPosition', 4,
      'parishName', 'Evangeline',
      'windowCalls', jsonb_build_array(
        jsonb_build_object('callId', v_call_id_1::text, 'responseNumber', '2025-1234', 'queueTime', '14:05', 'isCompliant', false),
        jsonb_build_object('callId', v_call_id_2::text, 'responseNumber', '2025-5678', 'queueTime', '14:18', 'isCompliant', false),
        jsonb_build_object('callId', v_call_id_3::text, 'responseNumber', '2025-9012', 'queueTime', '14:32', 'isCompliant', false),
        jsonb_build_object('callId', v_excluded_call_id::text, 'responseNumber', '2025-TEST', 'queueTime', '14:45', 'isCompliant', false)
      )
    ),
    'system@auto-exclusion-engine'
  );

  RAISE NOTICE 'Auto-exclusion created for call ID: %', v_excluded_call_id;
END $$;

-- Verify the result
SELECT 
  c.id,
  c.response_number,
  c.response_date,
  c.exclusion_type,
  c.exclusion_reason,
  c.excluded_at,
  c.auto_exclusion_strategy,
  c.auto_exclusion_metadata
FROM calls c
WHERE c.is_excluded = TRUE 
  AND c.exclusion_type = 'AUTO'
  AND c.parish_id = (SELECT id FROM parishes WHERE name ILIKE '%evangeline%' LIMIT 1)
ORDER BY c.excluded_at DESC
LIMIT 5;

