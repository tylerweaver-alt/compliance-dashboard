// lib/coverage-types.ts
// Types for Coverage + Compliance simulator

// ============================================================================
// MODES
// ============================================================================

export type HeatmapMode = 'density' | 'compliance' | 'coverage' | 'strategy';

// ============================================================================
// COVERAGE POSTS AND LEVELS
// ============================================================================

export type CoveragePost = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  defaultUnits: number;
};

export type CoverageLevel = {
  level: number; // 0–4
  label: string;
  posts: CoveragePost[];
};

// ============================================================================
// DATABASE-ALIGNED TYPES (for API responses)
// ============================================================================

/** Post as returned from the database/API */
export interface DbCoveragePost {
  id: number;
  regionId: string;
  name: string;
  address: string | null;
  intersection: string | null;
  lat: number | null;
  lng: number | null;
  defaultUnits: number;
  isActive: boolean;
  coverageLevel?: number; // Legacy column, prefer junction table
}

/** Coverage level as returned from the database/API */
export interface DbCoverageLevel {
  id: number;
  regionId: string;
  levelNumber: number;
  name: string;
  description: string | null;
  color: string;
  posts: { id: number; name: string }[];
}

/** Junction table record for post-level assignments */
export interface DbCoverageLevelPost {
  id: number;
  levelId: number;
  postId: number;
}

// ============================================================================
// COVERAGE RULES (WHEN → THEN)
// ============================================================================

export type ConditionType =
  | 'ACTIVE_CALLS_IN_AREA'
  | 'ACTIVE_CALLS_IN_PARISH'
  | 'AVAILABLE_UNITS_IN_PARISH'
  | 'AVAILABLE_UNITS_IN_AREA'
  | 'ACTIVE_LEVEL'
  | 'TIME_OF_DAY'
  | 'DAY_OF_WEEK';

export type Condition = {
  type: ConditionType;
  areaId?: string;
  parishId?: string;
  comparator: '>=' | '<=' | '==' | '>';
  value: number | string;
};

export type ActionType =
  | 'SET_LEVEL'
  | 'MOVE_UNITS'
  | 'SET_POST_FOR_SINGLE_UNIT'
  | 'LOCK_POST';

export type Action = {
  type: ActionType;
  newLevel?: number;
  fromPostId?: string;
  toPostId?: string;
  unitCount?: number;
  targetParishId?: string;
  newPostId?: string;
};

export type CoverageRule = {
  id: string;
  name: string;
  priority: number;
  scope: 'region' | 'parish' | 'area';
  conditions: Condition[];
  actions: Action[];
};

// ============================================================================
// REGION POLICY
// ============================================================================

export type RegionPolicy = {
  regionId: string;
  regionName: string;
  parishes: string[];
  posts: CoveragePost[];
  areas: { id: string; name: string; type: 'urban' | 'rural' | 'mixed' }[];
  levels: CoverageLevel[];
  rules: CoverageRule[];
  referenceText?: string; // For PDF/text reference
};

// ============================================================================
// TIME BANDS FOR COVERAGE VEINS
// ============================================================================

export type TimeBand = '0-8' | '8-12' | '12-20' | '20-25' | '25-30' | 'beyond';

export const TIME_BAND_COLORS: Record<TimeBand, string> = {
  '0-8': '#22c55e',    // Green
  '8-12': '#eab308',   // Yellow
  '12-20': '#f97316',  // Orange
  '20-25': '#ef4444',  // Red
  '25-30': '#a855f7',  // Purple
  'beyond': '#6b7280', // Gray
};

// ============================================================================
// LEVEL TIME SHARE (for concurrency model)
// ============================================================================

export type LevelTimeShare = {
  level: number;
  label: string;
  fractionOfTime: number; // 0..1
};

// ============================================================================
// COMPLIANCE GRAPH STATE
// ============================================================================

export type CurveKey = 'raw' | 'contractHistorical' | 'contractCustom' | 'juryTarget';

export type ComplianceGraphState = {
  showGraph: boolean;
  selectedCurves: CurveKey[];
  exclusionMode: 'none' | 'historical' | 'custom';
  historicalExclusionRate: number;
  customExclusionRate: number;
};

// ============================================================================
// PANEL PROPS
// ============================================================================

export type PanelProps = {
  parishId: number | null;
  parishName: string;
  regionId: string;
  onClose: () => void;
};

