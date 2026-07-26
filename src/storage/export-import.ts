import { DATA_SCHEMA_VERSION } from "../constants";
import type { ReviewData, ReviewExport } from "../types/review";
import type { ReviewSettings } from "../types/settings";

export function createReviewExport(settings: ReviewSettings, data: ReviewData): ReviewExport {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    settings,
    docs: data.docs,
    dailyPlans: data.dailyPlans,
    history: data.history,
  };
}

export function parseReviewExport(raw: string): ReviewExport {
  const parsed = JSON.parse(raw) as unknown;
  if (!isReviewExport(parsed)) {
    throw new Error("导入文件不是有效的文档回顾数据。");
  }

  return parsed;
}

function isReviewExport(value: unknown): value is ReviewExport {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === DATA_SCHEMA_VERSION &&
    typeof record.exportedAt === "string" &&
    typeof record.settings === "object" &&
    typeof record.docs === "object" &&
    typeof record.dailyPlans === "object" &&
    Array.isArray(record.history)
  );
}
