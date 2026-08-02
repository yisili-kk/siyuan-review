import type { DailyPlan, ReviewData, ReviewEvent, ReviewItem } from "../types/review";
import type { DataRetentionSettings } from "../types/settings";
import { addDays } from "../utils/date";

export type DataRetentionResult = {
  data: ReviewData;
  changed: boolean;
  removedDailyPlans: number;
  removedHistoryEvents: number;
  removedItems: number;
};

export function markMissingItems(
  items: Record<string, ReviewItem>,
  availableItemIds: Iterable<string>,
  todayKey: string,
): ReviewItem[] {
  const available = new Set(availableItemIds);
  return Object.values(items)
    .filter((item) => !available.has(item.itemId) && !item.missingSince)
    .map((item) => ({
      ...item,
      missingSince: todayKey,
    }));
}

export function pruneReviewData(
  data: ReviewData,
  settings: DataRetentionSettings,
  todayKey: string,
  protectedItemIds: Iterable<string> = [],
): DataRetentionResult {
  if (!settings.enabled) {
    return {
      data,
      changed: false,
      removedDailyPlans: 0,
      removedHistoryEvents: 0,
      removedItems: 0,
    };
  }

  const dailyPlans = pruneDailyPlans(data.dailyPlans, todayKey, settings.keepDailyPlansDays);
  const history = pruneHistory(data.history, settings.keepHistoryLimit);
  const items = pruneItems({
    items: data.items,
    dailyPlans: dailyPlans.value,
    history: history.value,
    todayKey,
    pruneMissingItemsDays: settings.pruneMissingDocsDays,
    protectedItemIds,
  });
  const changed = dailyPlans.removed > 0 || history.removed > 0 || items.removed > 0;

  return {
    data: changed
      ? {
          ...data,
          dailyPlans: dailyPlans.value,
          history: history.value,
          items: items.value,
        }
      : data,
    changed,
    removedDailyPlans: dailyPlans.removed,
    removedHistoryEvents: history.removed,
    removedItems: items.removed,
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

function pruneItems(input: {
  items: Record<string, ReviewItem>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
  todayKey: string;
  pruneMissingItemsDays: number;
  protectedItemIds: Iterable<string>;
}): { value: Record<string, ReviewItem>; removed: number } {
  const referencedItemIds = new Set<string>(input.protectedItemIds);
  for (const plan of Object.values(input.dailyPlans)) {
    for (const item of plan.items) {
      referencedItemIds.add(item.itemId);
    }
  }
  for (const event of input.history) {
    referencedItemIds.add(event.itemId);
  }

  const cutoffKey = addDays(input.todayKey, -Math.max(Math.trunc(input.pruneMissingItemsDays), 0));
  const entries = Object.entries(input.items);
  const kept = entries.filter(([itemId, item]) => {
    if (referencedItemIds.has(itemId)) {
      return true;
    }

    return item.missingSince === undefined || item.missingSince >= cutoffKey;
  });

  return {
    value: Object.fromEntries(kept),
    removed: entries.length - kept.length,
  };
}
