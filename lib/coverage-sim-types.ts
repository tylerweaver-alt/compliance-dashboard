/**
 * Types for Coverage Simulation API
 * 
 * These types are used by the /api/coverage/simulate endpoint
 * to define the request/response shapes for baseline compliance curve computation.
 */

/**
 * A single point on the compliance curve.
 * Represents the compliance percentage at a specific threshold (in minutes).
 */
export interface CompliancePoint {
  minutes: number;
  compliance: number;
}

/**
 * Request body for the coverage simulation endpoint.
 */
export interface CoverageSimulationRequest {
  regionId: string;           // e.g. "CENLA"
  parishId?: number;          // optional single parish filter
  thresholds: number[];       // e.g. [6, 8, 10, 12] in minutes
}

/**
 * Response from the coverage simulation endpoint.
 * Contains baseline compliance curve data computed from the calls table.
 */
export interface CoverageSimulationResult {
  regionId: string;
  parishId: number | null;
  thresholds: number[];
  baseline: {
    overallComplianceByThreshold: CompliancePoint[];
    totalCalls: number;
    dateRange: {
      start: string;
      end: string;
    };
  };
  error?: string;
  details?: string;
}

