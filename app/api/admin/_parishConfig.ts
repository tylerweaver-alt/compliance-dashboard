// app/api/admin/_parishConfig.ts
// Helper to seed default parish_settings + zones for new areas

import { query } from '@/lib/db';
import { DEFAULT_REPORT_COLUMNS } from '@/app/lib/constants';

export type EvaluationMode = 'parish_average' | 'zone_based';

export interface ZoneConfig {
  name: string;
  threshold_minutes: number;
  display_order?: number;
  locations?: string[];
}

export interface ParishConfigInput {
  parishId: number;
  mode: EvaluationMode;
  defaultThresholdMinutes?: number | null;
  targetAverageMinutes?: number | null;
  zones?: ZoneConfig[];
  viewColumns?: string[];
  responseStartTime?: 'dispatched' | 'received' | 'enroute';
}

/**
 * Seeds default parish_settings + zones for a newly created area.
 * This is called by the Add Area API when config is provided.
 * Parish Settings modal can then edit this config later.
 */
export async function seedDefaultParishConfig({
  parishId,
  mode,
  defaultThresholdMinutes,
  targetAverageMinutes,
  zones,
  viewColumns,
  responseStartTime = 'dispatched',
}: ParishConfigInput): Promise<void> {
  // Convert minutes to seconds for DB storage
  const thresholdSeconds = defaultThresholdMinutes != null
    ? Math.round(defaultThresholdMinutes * 60)
    : null;
  const targetSeconds = targetAverageMinutes != null
    ? Math.round(targetAverageMinutes * 60)
    : null;

  // Determine use_zones based on mode
  const useZones = mode === 'zone_based';

  // Use default columns if not provided
  const columnsToStore = viewColumns && viewColumns.length > 0
    ? viewColumns
    : DEFAULT_REPORT_COLUMNS;

  // 1. Upsert parish_settings
  await query(
    `INSERT INTO parish_settings (
      parish_id,
      global_response_threshold_seconds,
      target_average_response_seconds,
      use_zones,
      report_columns,
      response_start_time,
      exception_keywords
    ) VALUES ($1, $2, $3, $4, $5, $6, '{}')
    ON CONFLICT (parish_id)
    DO UPDATE SET
      global_response_threshold_seconds = EXCLUDED.global_response_threshold_seconds,
      target_average_response_seconds = EXCLUDED.target_average_response_seconds,
      use_zones = EXCLUDED.use_zones,
      report_columns = EXCLUDED.report_columns,
      response_start_time = EXCLUDED.response_start_time`,
    [
      parishId,
      thresholdSeconds,
      targetSeconds,
      useZones,
      columnsToStore,
      responseStartTime,
    ]
  );

  // 2. Handle zones if mode is zone_based and zones are provided
  if (useZones && zones && zones.length > 0) {
    // Delete existing zones for this parish (clean reset)
    await query(
      'DELETE FROM response_area_mappings WHERE parish_id = $1',
      [parishId]
    );

    // Insert new zones
    for (let i = 0; i < zones.length; i++) {
      const zone = zones[i];
      await query(
        `INSERT INTO response_area_mappings (parish_id, response_area, threshold_minutes, locations)
         VALUES ($1, $2, $3, $4)`,
        [
          parishId,
          zone.name.trim(),
          zone.threshold_minutes,
          zone.locations || [],
        ]
      );
    }
  }
}

/**
 * Get simplified config summary for audit logging
 */
export function getConfigSummary(config: ParishConfigInput): Record<string, any> {
  return {
    mode: config.mode,
    threshold_minutes: config.defaultThresholdMinutes,
    target_avg_minutes: config.targetAverageMinutes,
    zones_count: config.zones?.length || 0,
    columns_count: config.viewColumns?.length || 0,
    response_start_time: config.responseStartTime || 'dispatched',
  };
}

