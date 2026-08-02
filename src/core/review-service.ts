import type {
  DailyPlan,
  ReviewEvent,
  ReviewFeedback,
  ReviewItem,
  StartReviewResult,
} from "../types/review";
import type { ReviewIntervals, ReviewSchedulingSettings } from "../types/settings";
import { addDays, secondsBetween, toDateKey } from "../utils/date";
import { createReviewEventId } from "../utils/id";
import { calculateNextInterval } from "./memory-interval";

export function startReview(plan: DailyPlan, itemId: string, nowIso = new Date().toISOString()): StartReviewResult {
  const item = plan.items.find((planItem) => planItem.itemId === itemId);
  if (!item) {
    throw new Error(`Review item ${itemId} is not in today's review plan.`);
  }

  if (item.status === "done" || item.status === "skipped" || item.status === "missing") {
    throw new Error(`Review item ${itemId} cannot be started from status ${item.status}.`);
  }

  item.status = "reviewing";
  item.startedAt = item.startedAt ?? nowIso;
  plan.updatedAt = nowIso;

  return { plan, item };
}

export function completeReview(input: {
  item: ReviewItem;
  plan: DailyPlan;
  feedback: ReviewFeedback;
  intervals: ReviewIntervals;
  scheduling?: ReviewSchedulingSettings;
  note?: string;
  completedAt?: string;
}): { item: ReviewItem; plan: DailyPlan; event: ReviewEvent } {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const completedDate = toDateKey(new Date(completedAt));
  const planItem = input.plan.items.find((item) => item.itemId === input.item.itemId);
  const note = input.note?.trim();

  if (!planItem) {
    throw new Error(`Review item ${input.item.itemId} is not in today's review plan.`);
  }

  if (planItem.status === "done" || planItem.status === "skipped" || planItem.status === "missing") {
    throw new Error(`Review item ${input.item.itemId} cannot be completed from status ${planItem.status}.`);
  }

  const nextInterval = calculateNextInterval({
    item: input.item,
    feedback: input.feedback,
    intervals: input.intervals,
    scheduling: input.scheduling,
  });
  const nextReviewAt = addDays(completedDate, nextInterval.intervalDays);
  const durationSeconds = secondsBetween(planItem.startedAt, completedAt);

  planItem.status = input.feedback === "skipped" ? "skipped" : "done";
  planItem.completedAt = completedAt;
  input.plan.updatedAt = completedAt;

  const item = {
    ...input.item,
    lastReviewedAt: completedDate,
    nextReviewAt,
    status: nextStatus(input.feedback, input.item.status),
    priorityBoost: nextPriorityBoost(input.feedback, input.item.priorityBoost),
    ...nextInterval.memoryState,
  };

  const event: ReviewEvent = {
    id: createReviewEventId(input.item.itemId, completedAt),
    itemId: input.item.itemId,
    feedback: input.feedback,
    note: note || undefined,
    startedAt: planItem.startedAt,
    completedAt,
    durationSeconds,
    nextReviewAt,
    intervalDays: nextInterval.intervalDays,
  };

  return { item, plan: input.plan, event };
}

export function recordClozeCheck(item: ReviewItem): ReviewItem {
  return {
    ...item,
    clozeCheckCount: (item.clozeCheckCount ?? 0) + 1,
  };
}

function nextStatus(feedback: ReviewFeedback, current: ReviewItem["status"]): ReviewItem["status"] {
  if (feedback === "needsSupplement") {
    return "needsSupplement";
  }

  if (feedback === "needsRefactor") {
    return "needsRefactor";
  }

  if (feedback === "valuable" || feedback === "normal") {
    return "normal";
  }

  return current;
}

function nextPriorityBoost(feedback: ReviewFeedback, current = 0): number {
  if (feedback === "needsRefactor") {
    return current + 50;
  }

  if (feedback === "needsSupplement") {
    return current + 20;
  }

  if (feedback === "valuable" || feedback === "normal") {
    return Math.max(current - 10, 0);
  }

  return current;
}
