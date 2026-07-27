import type { DailyPlan, ReviewData, ReviewDocState, ReviewEvent } from "../types/review";
import type { DataRetentionSettings } from "../types/settings";
import { addDays } from "../utils/date";

export type DataRetentionResult = {
  data: ReviewData;
  changed: boolean;
  removedDailyPlans: number;
  removedHistoryEvents: number;
  removedDocs: number;
};

export function pruneReviewData(
  data: ReviewData,
  settings: DataRetentionSettings,
  todayKey: string,
  protectedDocIds: Iterable<string> = [],
): DataRetentionResult {
  if (!settings.enabled) {
    return {
      data,
      changed: false,
      removedDailyPlans: 0,
      removedHistoryEvents: 0,
      removedDocs: 0,
    };
  }

  const dailyPlans = pruneDailyPlans(data.dailyPlans, todayKey, settings.keepDailyPlansDays);
  const history = pruneHistory(data.history, settings.keepHistoryLimit);
  const docs = pruneDocs({
    docs: data.docs,
    dailyPlans: dailyPlans.value,
    history: history.value,
    todayKey,
    pruneMissingDocsDays: settings.pruneMissingDocsDays,
    protectedDocIds,
  });
  const changed = dailyPlans.removed > 0 || history.removed > 0 || docs.removed > 0;

  return {
    data: changed
      ? {
          ...data,
          dailyPlans: dailyPlans.value,
          history: history.value,
          docs: docs.value,
        }
      : data,
    changed,
    removedDailyPlans: dailyPlans.removed,
    removedHistoryEvents: history.removed,
    removedDocs: docs.removed,
  };
}

function pruneDailyPlans(
  dailyPlans: Record<string, DailyPlan>,
  todayKey: string,
  keepDays: number,
): { value: Record<string, DailyPlan>; removed: number } {
  const cutoffKey = addDays(todayKey, -Math.max(Math.trunc(keepDays), 0));
  const entries = Object.entries(dailyPlans);
  const kept = entries.filter(([date]) => date >= cutoffKey || date >= todayKey);
  return {
    value: Object.fromEntries(kept),
    removed: entries.length - kept.length,
  };
}

function pruneHistory(history: ReviewEvent[], keepLimit: number): { value: ReviewEvent[]; removed: number } {
  const limit = Math.max(Math.trunc(keepLimit), 0);
  if (history.length <= limit) {
    return { value: history, removed: 0 };
  }

  return {
    value: history.slice(history.length - limit),
    removed: history.length - limit,
  };
}

function pruneDocs(input: {
  docs: Record<string, ReviewDocState>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
  todayKey: string;
  pruneMissingDocsDays: number;
  protectedDocIds: Iterable<string>;
}): { value: Record<string, ReviewDocState>; removed: number } {
  const referencedDocIds = new Set<string>(input.protectedDocIds);
  for (const plan of Object.values(input.dailyPlans)) {
    for (const item of plan.items) {
      referencedDocIds.add(item.docId);
    }
  }
  for (const event of input.history) {
    referencedDocIds.add(event.docId);
  }

  const cutoffKey = addDays(input.todayKey, -Math.max(Math.trunc(input.pruneMissingDocsDays), 0));
  const entries = Object.entries(input.docs);
  const kept = entries.filter(([docId, doc]) => {
    if (referencedDocIds.has(docId)) {
      return true;
    }

    const lastKnownDate = getLastKnownDate(doc);
    return lastKnownDate === undefined || lastKnownDate >= cutoffKey;
  });

  return {
    value: Object.fromEntries(kept),
    removed: entries.length - kept.length,
  };
}

function getLastKnownDate(doc: ReviewDocState): string | undefined {
  if (doc.lastReviewedAt) {
    return doc.lastReviewedAt;
  }

  return doc.questionCache?.generatedAt.slice(0, 10);
}
