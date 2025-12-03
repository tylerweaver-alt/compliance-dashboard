// lib/coverage-policy-service.ts
// Shared service layer for coverage policy operations
// Used by both CoveragePolicyPanel and CoveragePolicyModal

import type { DbCoverageLevel, DbCoveragePost } from './coverage-types';

// ============================================================================
// API RESPONSE TYPES
// ============================================================================

export interface PostsApiResponse {
  ok: boolean;
  posts: DbCoveragePost[];
  error?: string;
}

export interface LevelsApiResponse {
  ok: boolean;
  levels: DbCoverageLevel[];
  error?: string;
}

export interface CoveragePolicyData {
  posts: DbCoveragePost[];
  levels: DbCoverageLevel[];
}

// ============================================================================
// FETCH FUNCTIONS
// ============================================================================

/**
 * Fetch all posts for a region
 */
export async function fetchPosts(regionId: string): Promise<PostsApiResponse> {
  try {
    const res = await fetch(`/api/posts?region_id=${regionId}`);
    const data = await res.json();
    return {
      ok: data.ok ?? false,
      posts: data.posts ?? [],
      error: data.error,
    };
  } catch (err: any) {
    console.error('Error fetching posts:', err);
    return { ok: false, posts: [], error: err.message || 'Failed to fetch posts' };
  }
}

/**
 * Fetch all coverage levels for a region (includes posts via junction table)
 */
export async function fetchLevels(regionId: string): Promise<LevelsApiResponse> {
  try {
    const res = await fetch(`/api/coverage-levels?region_id=${regionId}`);
    const data = await res.json();
    return {
      ok: data.ok ?? false,
      levels: data.levels ?? [],
      error: data.error,
    };
  } catch (err: any) {
    console.error('Error fetching levels:', err);
    return { ok: false, levels: [], error: err.message || 'Failed to fetch levels' };
  }
}

/**
 * Fetch both posts and levels for a region in parallel
 * This is the main entry point for components that need both
 */
export async function fetchCoveragePolicyData(regionId: string): Promise<CoveragePolicyData & { error?: string }> {
  const [postsResult, levelsResult] = await Promise.all([
    fetchPosts(regionId),
    fetchLevels(regionId),
  ]);

  // Combine errors if any
  const errors: string[] = [];
  if (!postsResult.ok && postsResult.error) errors.push(postsResult.error);
  if (!levelsResult.ok && levelsResult.error) errors.push(levelsResult.error);

  return {
    posts: postsResult.posts,
    levels: levelsResult.levels,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get posts assigned to a specific level from the level's posts array
 * The levels API already joins the junction table
 */
export function getPostsForLevel(
  level: DbCoverageLevel | undefined,
  allPosts: DbCoveragePost[]
): DbCoveragePost[] {
  if (!level || !level.posts) return [];
  
  const postIds = new Set(level.posts.map(p => p.id));
  return allPosts.filter(p => postIds.has(p.id));
}

/**
 * Build a map of level number to level for quick lookup
 */
export function buildLevelMap(levels: DbCoverageLevel[]): Record<number, DbCoverageLevel> {
  const map: Record<number, DbCoverageLevel> = {};
  levels.forEach(lvl => { map[lvl.levelNumber] = lvl; });
  return map;
}

/**
 * Get posts that are NOT assigned to any level
 */
export function getUnassignedPosts(
  allPosts: DbCoveragePost[],
  levels: DbCoverageLevel[]
): DbCoveragePost[] {
  const assignedPostIds = new Set<number>();
  levels.forEach(level => {
    level.posts?.forEach(p => assignedPostIds.add(p.id));
  });
  return allPosts.filter(p => !assignedPostIds.has(p.id));
}

/**
 * Count posts missing coordinates
 */
export function countPostsNeedingGeocode(posts: DbCoveragePost[]): number {
  return posts.filter(
    p => (p.lat === null || p.lng === null) && (p.address || p.intersection)
  ).length;
}

/**
 * Default level labels as fallback when DB levels don't exist
 */
export const DEFAULT_LEVEL_LABELS: Record<number, string> = {
  4: 'Full Coverage',
  3: 'Standard Coverage',
  2: 'Reduced Coverage',
  1: 'Minimal Coverage',
  0: 'Emergency Only',
};

/**
 * Get label for a level, with fallback to defaults
 */
export function getLevelLabel(
  levelNumber: number,
  levelMap: Record<number, DbCoverageLevel>
): string {
  const level = levelMap[levelNumber];
  if (level) return level.name;
  return DEFAULT_LEVEL_LABELS[levelNumber] || `Level ${levelNumber}`;
}

