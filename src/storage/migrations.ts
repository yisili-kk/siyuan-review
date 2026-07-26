import { DATA_SCHEMA_VERSION } from "../constants";
import type { ReviewData } from "../types/review";

export function migrateReviewData(raw: unknown): ReviewData {
  if (!isRecord(raw)) {
    return createEmptyReviewData();
  }

  if (raw.schemaVersion === DATA_SCHEMA_VERSION) {
    return {
      schemaVersion: DATA_SCHEMA_VERSION,
      docs: isRecord(raw.docs) ? raw.docs : {},
      dailyPlans: isRecord(raw.dailyPlans) ? raw.dailyPlans : {},
      history: Array.isArray(raw.history) ? raw.history : [],
      lastNotifiedDate: typeof raw.lastNotifiedDate === "string" ? raw.lastNotifiedDate : undefined,
    } as ReviewData;
  }

  return createEmptyReviewData();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createEmptyReviewData(): ReviewData {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    docs: {},
    dailyPlans: {},
    history: [],
  };
}
