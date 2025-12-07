/**
 * lib/autoExclusions/strategies/index.ts
 * 
 * Central registry of all auto-exclusion strategies.
 * Add new strategies here to include them in the engine.
 */

import type { AutoExclusionStrategy, AutoExclusionStrategyKey } from '../types';
import { peakLoadStrategy } from './peakLoad';
import { peakCallLoadStrategy } from './peakCallLoad';
import { weatherStrategy } from './weather';
import { cadOutageStrategy } from './cadOutage';

// All registered strategies
export const strategies: AutoExclusionStrategy[] = [
  peakLoadStrategy,
  peakCallLoadStrategy,
  weatherStrategy,
  cadOutageStrategy,
];

// Map for quick lookup by key
export const strategyMap: Map<AutoExclusionStrategyKey, AutoExclusionStrategy> = new Map(
  strategies.map(s => [s.key, s])
);

// Get a specific strategy by key
export function getStrategy(key: AutoExclusionStrategyKey): AutoExclusionStrategy | undefined {
  return strategyMap.get(key);
}

// Get all strategy keys
export function getStrategyKeys(): AutoExclusionStrategyKey[] {
  return strategies.map(s => s.key);
}

// Re-export individual strategies for direct import
export { peakLoadStrategy } from './peakLoad';
export { peakCallLoadStrategy } from './peakCallLoad';
export { weatherStrategy } from './weather';
export { cadOutageStrategy } from './cadOutage';

