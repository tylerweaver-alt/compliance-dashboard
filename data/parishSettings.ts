// data/parishSettings.ts

/**
 * All parish IDs we support in the app.
 * These should match keys in mockParishData and your DB.
 */
export type ParishId =
  | "allen"
  | "avoyelles"
  | "beauregard"
  | "concordia"
  | "evangeline"
  | "rapides"
  | "sabine";

export const ALL_PARISH_IDS: ParishId[] = [
  "allen",
  "avoyelles",
  "beauregard",
  "concordia",
  "evangeline",
  "rapides",
  "sabine",
];

/**
 * Settings specific to COMPLIANCE for a single parish.
 */
export type ParishComplianceSettings = {
  parishId: ParishId;
  /**
   * These are *MasterField.id* values from data/masterFields.ts
   */
  complianceFieldIds: string[];
};

/**
 * Convenience type for "all parishes and their settings".
 */
export type ParishSettingsMap = Record<ParishId, ParishComplianceSettings>;

/**
 * Initial settings for every parish.
 * Used when DB has no row yet.
 */
export const INITIAL_PARISH_SETTINGS: ParishSettingsMap = {
  allen: {
    parishId: "allen",
    complianceFieldIds: [],
  },
  avoyelles: {
    parishId: "avoyelles",
    complianceFieldIds: [],
  },
  beauregard: {
    parishId: "beauregard",
    complianceFieldIds: [],
  },
  concordia: {
    parishId: "concordia",
    complianceFieldIds: [],
  },
  evangeline: {
    parishId: "evangeline",
    complianceFieldIds: [],
  },
  rapides: {
    parishId: "rapides",
    complianceFieldIds: [],
  },
  sabine: {
    parishId: "sabine",
    complianceFieldIds: [],
  },
};

export type ParishSettings = ParishComplianceSettings;