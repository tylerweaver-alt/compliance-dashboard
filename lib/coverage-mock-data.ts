// lib/coverage-mock-data.ts
// Mock data for Coverage Policy demo

import type { CoveragePost, CoverageLevel, CoverageRule, RegionPolicy } from './coverage-types';

// ============================================================================
// DEMO POSTS
// ============================================================================

export const jonesvillePost: CoveragePost = {
  id: 'jonesville_post',
  name: 'Jonesville Coverage Post',
  lat: 31.626,
  lng: -91.818,
  defaultUnits: 0, // Only used when rule triggers
};

export const concordiaPost: CoveragePost = {
  id: 'concordia_main',
  name: 'Concordia Main Post',
  lat: 31.569,
  lng: -91.503,
  defaultUnits: 2,
};

export const ferridayPost: CoveragePost = {
  id: 'ferriday_post',
  name: 'Ferriday Post',
  lat: 31.630,
  lng: -91.555,
  defaultUnits: 1,
};

export const marksvillePost: CoveragePost = {
  id: 'marksville_post',
  name: 'Marksville Post',
  lat: 31.127,
  lng: -92.066,
  defaultUnits: 2,
};

export const alexandriaPost: CoveragePost = {
  id: 'alexandria_main',
  name: 'Alexandria Main Post',
  lat: 31.311,
  lng: -92.445,
  defaultUnits: 3,
};

export const pinevilePost: CoveragePost = {
  id: 'pineville_post',
  name: 'Pineville Post',
  lat: 31.322,
  lng: -92.434,
  defaultUnits: 2,
};

// ============================================================================
// CONCORDIA BACKUP RULE (EXAMPLE)
// ============================================================================

export const concordiaBackupRule: CoverageRule = {
  id: 'concordia-no-units-backfill-jonesville',
  name: 'Concordia – Backfill from North to Jonesville',
  priority: 10,
  scope: 'region',

  conditions: [
    {
      type: 'AVAILABLE_UNITS_IN_PARISH',
      parishId: 'concordia',
      comparator: '==',
      value: 0,
    },
    {
      type: 'AVAILABLE_UNITS_IN_AREA',
      areaId: 'north_corridor', // Marksville/Jonesville corridor
      comparator: '>=',
      value: 1,
    },
  ],

  actions: [
    {
      type: 'MOVE_UNITS',
      fromPostId: 'nearest_northern_post', // Resolved in backend
      toPostId: 'jonesville_post',
      unitCount: 1,
    },
  ],
};

// ============================================================================
// CENLA COVERAGE LEVELS
// ============================================================================

export const cenlaLevels: CoverageLevel[] = [
  {
    level: 4,
    label: 'Full Coverage',
    posts: [alexandriaPost, pinevilePost, marksvillePost, concordiaPost, ferridayPost, jonesvillePost],
  },
  {
    level: 3,
    label: 'Standard Coverage',
    posts: [alexandriaPost, pinevilePost, marksvillePost, concordiaPost],
  },
  {
    level: 2,
    label: 'Reduced Coverage',
    posts: [alexandriaPost, marksvillePost, concordiaPost],
  },
  {
    level: 1,
    label: 'Minimal Coverage',
    posts: [alexandriaPost, concordiaPost],
  },
  {
    level: 0,
    label: 'Emergency Only',
    posts: [alexandriaPost],
  },
];

// ============================================================================
// CENLA REGION POLICY
// ============================================================================

export const cenlaPolicy: RegionPolicy = {
  regionId: 'CENLA',
  regionName: 'Central Louisiana',
  parishes: ['Rapides', 'Avoyelles', 'Concordia', 'Grant', 'LaSalle', 'Winn', 'Catahoula', 'Vernon'],
  posts: [alexandriaPost, pinevilePost, marksvillePost, concordiaPost, ferridayPost, jonesvillePost],
  areas: [
    { id: 'alexandria_metro', name: 'Alexandria Metro', type: 'urban' },
    { id: 'north_corridor', name: 'North Corridor (Marksville-Jonesville)', type: 'rural' },
    { id: 'concordia_zone', name: 'Concordia Zone', type: 'rural' },
    { id: 'pineville_area', name: 'Pineville Area', type: 'mixed' },
  ],
  levels: cenlaLevels,
  rules: [concordiaBackupRule],
  referenceText: 'Coverage Policy Reference Document - CENLA Region',
};

// ============================================================================
// ALL REGION POLICIES (for modal)
// ============================================================================

export const allRegionPolicies: RegionPolicy[] = [
  cenlaPolicy,
  {
    regionId: 'SWLA',
    regionName: 'Southwest Louisiana',
    parishes: ['Calcasieu', 'Cameron', 'Jeff Davis', 'Allen', 'Beauregard'],
    posts: [
      { id: 'lake_charles_main', name: 'Lake Charles Main', lat: 30.226, lng: -93.217, defaultUnits: 3 },
      { id: 'sulphur_post', name: 'Sulphur Post', lat: 30.236, lng: -93.377, defaultUnits: 2 },
      { id: 'deridder_post', name: 'DeRidder Post', lat: 30.846, lng: -93.289, defaultUnits: 1 },
    ],
    areas: [
      { id: 'lake_charles_metro', name: 'Lake Charles Metro', type: 'urban' },
      { id: 'cameron_parish', name: 'Cameron Parish', type: 'rural' },
    ],
    levels: [],
    rules: [],
    referenceText: 'Coverage Policy Reference Document - SWLA Region',
  },
  {
    regionId: 'ACADIANA',
    regionName: 'Acadiana',
    parishes: ['Lafayette', 'St. Landry', 'Evangeline', 'St. Martin', 'Iberia', 'Vermilion', 'Acadia'],
    posts: [
      { id: 'lafayette_main', name: 'Lafayette Main', lat: 30.224, lng: -92.019, defaultUnits: 3 },
      { id: 'new_iberia_post', name: 'New Iberia Post', lat: 30.003, lng: -91.818, defaultUnits: 2 },
    ],
    areas: [
      { id: 'lafayette_metro', name: 'Lafayette Metro', type: 'urban' },
    ],
    levels: [],
    rules: [],
    referenceText: 'Coverage Policy Reference Document - Acadiana Region',
  },
  {
    regionId: 'NELA',
    regionName: 'Northeast Louisiana',
    parishes: ['Ouachita', 'Morehouse', 'Richland', 'Madison', 'Franklin', 'Tensas'],
    posts: [
      { id: 'monroe_main', name: 'Monroe Main', lat: 32.509, lng: -92.119, defaultUnits: 3 },
      { id: 'west_monroe_post', name: 'West Monroe Post', lat: 32.518, lng: -92.147, defaultUnits: 2 },
    ],
    areas: [
      { id: 'monroe_metro', name: 'Monroe Metro', type: 'urban' },
    ],
    levels: [],
    rules: [],
    referenceText: 'Coverage Policy Reference Document - NELA Region',
  },
];

