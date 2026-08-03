import type { DailyPlan, DailyPlanItem, ReviewCandidate } from "../types/review";
import { isDue } from "../utils/date";

export type ReviewCenterStatusKey =
  | "today"
  | "needsSupplement"
  | "needsRefactor"
  | "due"
  | "neverReviewed"
  | "notDue";

export function getActiveTodayItemIds(todayPlan?: DailyPlan): Set<string> {
  return new Set(
    todayPlan?.items.filter(isActiveTodayPlanItem).map((item) => item.itemId) ?? [],
  );
}

export function getReviewCenterStats(items: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): {
  total: number;
  today: number;
  due: number;
} {
  const activeTodayItemIds = getActiveTodayItemIds(todayPlan);
  const existingItems = items.filter((item) => item.exists);
  return {
    total: existingItems.length,
    today: existingItems.filter((item) => activeTodayItemIds.has(item.itemId)).length,
    due: existingItems.filter((item) => isDue(item.nextReviewAt, date)).length,
  };
}

export function getPoolCategories(item: ReviewCandidate, todayItemIds: Set<string>, date: string): string[] {
  const categories = ["all", item.itemType, `group:${item.groupId}`];
  if (todayItemIds.has(item.itemId)) {
    categories.push("today");
  }
  if (isDue(item.nextReviewAt, date)) {
    categories.push("due");
  }
  if (!item.lastReviewedAt) {
    categories.push("neverReviewed");
  }
  if (item.status === "needsSupplement") {
    categories.push("needsSupplement");
  }
  if (item.status === "needsRefactor") {
    categories.push("needsRefactor");
  }
  return categories;
}

export function getPoolStatusKey(item: ReviewCandidate, todayItemIds: Set<string>, date: string): ReviewCenterStatusKey {
  if (todayItemIds.has(item.itemId)) {
    return "today";
  }
  if (item.status === "needsSupplement") {
    return "needsSupplement";
  }
  if (item.status === "needsRefactor") {
    return "needsRefactor";
  }
  if (isDue(item.nextReviewAt, date)) {
    return "due";
  }
  if (!item.lastReviewedAt) {
    return "neverReviewed";
  }
  return "notDue";
}

function isActiveTodayPlanItem(item: DailyPlanItem): boolean {
  return item.status === "pending" || item.status === "reviewing";
}
