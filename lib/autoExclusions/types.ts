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
// Each strategy has a unique key for identification and configuration lookup

export type AutoExclusionStrategyKey = 
  | 'PEAK_LOAD'      // Multiple calls in same area within time window
  | 'WEATHER'        // Severe weather events affecting response times
  | 'CAD_OUTAGE';    // CAD system outages affecting dispatch accuracy

// ============================================================================
// CONTEXT: Input to the Auto-Exclusion Engine
// ============================================================================
// Contains all data needed for strategies to make exclusion decisions

export interface AutoExclusionContext {
  // Call identification
  callId?: number;                    // DB id if already inserted, undefined for new calls
  responseNumber: string;             // Unique response identifier from CAD
  
  // Timing data
  responseDateTime: Date;             // When the call occurred
  complianceTimeSeconds: number | null; // Response time in seconds (null = missing data)
  
  // Location data
  responseArea: string;               // Zone/area name for the call
  parishId: number | null;            // Parish ID (0 = Other/non-contracted)
  regionId: number | null;            // Region ID
  originLatitude?: number | null;     // GPS coordinates if available
  originLongitude?: number | null;
  
  // Additional context for strategies
  priority?: string | null;           // Call priority (Emergency, Urgent, etc.)
  problemDescription?: string | null; // Type of call
  
  // Configuration context
  strategyConfigs?: Map<AutoExclusionStrategyKey, StrategyConfig>;
}

// ============================================================================
// STRATEGY CONFIG: Per-strategy settings from DB or defaults
// ============================================================================

export interface StrategyConfig {
  strategyKey: AutoExclusionStrategyKey;
  isEnabled: boolean;
  config: Record<string, any>;  // Strategy-specific settings (thresholds, etc.)
}

// ============================================================================
// STRATEGY RESULT: Output from a single strategy evaluation
// ============================================================================

export interface AutoExclusionStrategyResult {
  // Which strategy produced this result
  strategyKey: AutoExclusionStrategyKey;
  
  // Did this strategy determine the call should be excluded?
  shouldExclude: boolean;
  
  // Human-readable reason for the decision
  // Should be suitable for display in Audit Log and reports
  reason: string;
  
  // Confidence score (0-1) for prioritization when multiple strategies match
  confidence: number;
  
  // Strategy-specific metadata for audit trail and reproducibility
  // Include thresholds, measurements, and context used for the decision
  metadata: {
    // Common fields
    evaluatedAt: string;  // ISO timestamp
    
    // Strategy-specific fields (examples)
    [key: string]: any;
    // PEAK_LOAD: { callsInWindow: number, threshold: number, windowMinutes: number }
    // WEATHER: { severity: string, eventType: string, source: string }
    // CAD_OUTAGE: { outageStart: string, outageEnd: string, affectedSystems: string[] }
  };
}

// ============================================================================
// ENGINE RESULT: Final output from runAutoExclusionsForCall
// ============================================================================

export interface AutoExclusionDecision {
  // Final decision: should this call be auto-excluded?
  isExcluded: boolean;
  
  // If excluded, which strategy was the primary reason?
  primaryStrategy: AutoExclusionStrategyKey | null;
  
  // Human-readable reason for audit log
  reason: string | null;
  
  // All strategy results (for transparency and debugging)
  strategyResults: AutoExclusionStrategyResult[];
  
  // Combined metadata for the exclusion_logs table
  metadata: {
    engineVersion: string;
    evaluatedAt: string;
    totalStrategiesEvaluated: number;
    strategiesExcluding: AutoExclusionStrategyKey[];
  } | null;
}

// ============================================================================
// STRATEGY INTERFACE: Contract for pluggable strategies
// ============================================================================

export interface AutoExclusionStrategy {
  // Unique key for this strategy
  key: AutoExclusionStrategyKey;
  
  // Human-readable name for UI/reports
  displayName: string;
  
  // Evaluate whether this strategy should exclude the call
  // Returns null if strategy cannot evaluate (missing data, not applicable)
  evaluate(context: AutoExclusionContext): Promise<AutoExclusionStrategyResult | null>;
}

// ============================================================================
// DB RECORD TYPES: For inserting/reading exclusion data
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

export interface CallAutoExclusionUpdate {
  isAutoExcluded: boolean;
  autoExclusionStrategy: AutoExclusionStrategyKey | null;
  autoExclusionReason: string | null;
  autoExcludedAt: Date | null;
  autoExclusionMetadata: Record<string, any> | null;
}

