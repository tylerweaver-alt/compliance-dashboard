// app/lib/constants.ts
// Shared constants used across the application

export const PLACE_TYPES = ['parish', 'county', 'district'] as const;
export type PlaceType = typeof PLACE_TYPES[number];

export const ADMIN_ROLES = ['OM', 'Director', 'VP', 'Admin'] as const;
export type AdminRole = typeof ADMIN_ROLES[number];

export const ALL_ROLES = ['PFS', 'OS', 'OM', 'Director', 'VP', 'Admin', 'OC', 'Risk Assessment', 'QICM'] as const;
export type UserRole = typeof ALL_ROLES[number];

// Default report columns for View All Calls
export const DEFAULT_REPORT_COLUMNS = [
  'date', 'call_number', 'unit', 'address', 'received', 'dispatched',
  'enroute', 'staged', 'on_scene', 'depart', 'arrived',
  'available', 'response', 'status'
];

