/**
 * Health component type definitions and metadata.
 * 
 * Defines all monitored system components, their status types,
 * and groupings for the Sysadmin dashboard.
 */

// ============================================================================
// TYPES
// ============================================================================

export type HealthComponentId =
  | 'CAD_APP'
  | 'CAD_SQL'
  | 'NEON_DB'
  | 'VERCEL'
  | 'GITHUB'
  | 'INTERNET'
  | 'AUTH'
  | 'CALL_INGEST';

export type HealthStatus = 'UP' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export type HealthGroup = 'CORE' | 'EXTERNAL';

export interface HealthCheckResult {
  id: HealthComponentId;
  status: HealthStatus;
  checkedAt: string;  // ISO string
  message?: string;
  latencyMs?: number;
  details?: Record<string, unknown>;
}

export interface HealthComponentMeta {
  id: HealthComponentId;
  name: string;
  group: HealthGroup;
  description: string;
}

// ============================================================================
// COMPONENT METADATA
// ============================================================================

/**
 * Static metadata for all health components.
 * Used to derive display name and group for UI.
 */
export const HEALTH_COMPONENTS: Record<HealthComponentId, HealthComponentMeta> = {
  NEON_DB: {
    id: 'NEON_DB',
    name: 'Neon Database',
    group: 'CORE',
    description: 'PostgreSQL database for all application data',
  },
  AUTH: {
    id: 'AUTH',
    name: 'Authentication',
    group: 'CORE',
    description: 'NextAuth / Google OAuth authentication service',
  },
  CALL_INGEST: {
    id: 'CALL_INGEST',
    name: 'Call Ingestion',
    group: 'CORE',
    description: 'Call data ingestion pipeline status',
  },
  CAD_SQL: {
    id: 'CAD_SQL',
    name: 'CAD SQL Server',
    group: 'CORE',
    description: 'CAD dispatch SQL Server connection (future)',
  },
  CAD_APP: {
    id: 'CAD_APP',
    name: 'CAD Application',
    group: 'CORE',
    description: 'CAD backend application (future)',
  },
  VERCEL: {
    id: 'VERCEL',
    name: 'Vercel',
    group: 'EXTERNAL',
    description: 'Hosting and deployment platform',
  },
  GITHUB: {
    id: 'GITHUB',
    name: 'GitHub',
    group: 'EXTERNAL',
    description: 'Source control and CI/CD',
  },
  INTERNET: {
    id: 'INTERNET',
    name: 'Internet',
    group: 'EXTERNAL',
    description: 'External network connectivity',
  },
};

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map internal status to human-readable text.
 */
export function mapStatusToText(status: HealthStatus): string {
  switch (status) {
    case 'UP':
      return 'Online';
    case 'DEGRADED':
      return 'Degraded / Issues Found';
    case 'DOWN':
      return 'Offline';
    case 'UNKNOWN':
    default:
      return 'Unknown';
  }
}

/**
 * Get component metadata by ID.
 */
export function getComponentMeta(id: HealthComponentId): HealthComponentMeta {
  return HEALTH_COMPONENTS[id];
}

/**
 * Get all component IDs.
 */
export function getAllComponentIds(): HealthComponentId[] {
  return Object.keys(HEALTH_COMPONENTS) as HealthComponentId[];
}

/**
 * Get component IDs by group.
 */
export function getComponentIdsByGroup(group: HealthGroup): HealthComponentId[] {
  return Object.values(HEALTH_COMPONENTS)
    .filter((c) => c.group === group)
    .map((c) => c.id);
}

