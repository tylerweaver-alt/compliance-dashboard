/**
 * lib/autoExclusions/types.ts
 * 
 * Type definitions for the Auto-Exclusion Engine.
 * 
 * DESIGN GOALS:
 * - Audit-friendly: Every field supports future Audit Log display and reporting
 * - Legally defensible: Metadata enables reproducibility of exclusion decisions
 * - Modular: Strategies can be added without changing core types
 */

// ============================================================================
// STRATEGY KEYS
// ============================================================================
export type AutoExclusionStrategyKey =
  | 'PEAK_CALL_LOAD' // 3+ calls in same parish within 45-min window
  | 'WEATHER'        // Severe weather events affecting response times
  | 'PEAK_LOAD';     // Legacy - multiple calls in same area

// ============================================================================
// CONTEXT: Input to the Auto-Exclusion Engine
// ============================================================================
export interface AutoExclusionContext {
  // Call identification
  callId?: number;
  responseNumber: string;

  // Timing data
  responseDateTime: Date;
  complianceTimeSeconds: number | null;

  // Location data
  responseArea: string;
  parishId: number | null;
  regionId: number | null;
  originLatitude?: number | null;
  originLongitude?: number | null;

  // Additional context
  priority?: string | null;
  problemDescription?: string | null;

  // Configuration context
  strategyConfigs?: Map<AutoExclusionStrategyKey, StrategyConfig>;
}

// ============================================================================
// STRATEGY CONFIG
// ============================================================================
export interface StrategyConfig {
  strategyKey: AutoExclusionStrategyKey;
  isEnabled: boolean;
  config: Record<string, any>;
}

export interface PeakCallLoadConfig {
  window_minutes: number;
  min_calls_threshold: number;
}

// ============================================================================
// STRATEGY RESULT
// ============================================================================
export interface AutoExclusionStrategyResult {
  strategyKey: AutoExclusionStrategyKey;
  shouldExclude: boolean;
  reason: string;
  confidence: number;
  metadata: {
    evaluatedAt: string;
    [key: string]: any;
  };
}

// ============================================================================
// ENGINE RESULT
// ============================================================================
export interface AutoExclusionDecision {
  isExcluded: boolean;
  primaryStrategy: AutoExclusionStrategyKey | null;
  reason: string | null;
  strategyResults: AutoExclusionStrategyResult[];
  metadata: {
    engineVersion: string;
    evaluatedAt: string;
    totalStrategiesEvaluated: number;
    strategiesExcluding: AutoExclusionStrategyKey[];
  } | null;
}

// ============================================================================
// STRATEGY INTERFACE
// ============================================================================
export interface AutoExclusionStrategy {
  key: AutoExclusionStrategyKey;
  displayName: string;
  evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null>;
}

// ============================================================================
// DB RECORD TYPES
// ============================================================================
export interface ExclusionLogInsert {
  callId: number;
  exclusionType: 'AUTO' | 'MANUAL';
  strategyKey: AutoExclusionStrategyKey | null;
  reason: string;
  createdByUserId: string | null;
  createdByEmail: string | null;
  engineMetadata: Record<string, any> | null;
}

export type ExclusionType = 'AUTO' | 'MANUAL';

