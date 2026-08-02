import type {
  DailyPlan,
  ReviewDocState,
  ReviewEvent,
  ReviewFeedback,
  StartReviewResult,
} from "../types/review";
import type { ReviewIntervals, ReviewSchedulingSettings } from "../types/settings";
import { addDays, secondsBetween, toDateKey } from "../utils/date";
import { createReviewEventId } from "../utils/id";
import { calculateNextInterval } from "./memory-interval";

export function startReview(plan: DailyPlan, docId: string, nowIso = new Date().toISOString()): StartReviewResult {
  const item = plan.items.find((planItem) => planItem.docId === docId);
  if (!item) {
    throw new Error(`Document ${docId} is not in today's review plan.`);
  }

  if (item.status === "done" || item.status === "skipped" || item.status === "missing") {
    throw new Error(`Document ${docId} cannot be started from status ${item.status}.`);
  }

  item.status = "reviewing";
  item.startedAt = item.startedAt ?? nowIso;
  plan.updatedAt = nowIso;

  return { plan, item };
}

export function completeReview(input: {
  doc: ReviewDocState;
  plan: DailyPlan;
  feedback: ReviewFeedback;
  intervals: ReviewIntervals;
  scheduling?: ReviewSchedulingSettings;
  completedAt?: string;
}): { doc: ReviewDocState; plan: DailyPlan; event: ReviewEvent } {
  const completedAt = input.completedAt ?? new Date().toISOString();
  const completedDate = toDateKey(new Date(completedAt));
  const item = input.plan.items.find((planItem) => planItem.docId === input.doc.docId);

  if (!item) {
    throw new Error(`Document ${input.doc.docId} is not in today's review plan.`);
  }

  if (item.status === "done" || item.status === "skipped" || item.status === "missing") {
    throw new Error(`Document ${input.doc.docId} cannot be completed from status ${item.status}.`);
  }

  const nextInterval = calculateNextInterval({
    doc: input.doc,
    feedback: input.feedback,
    intervals: input.intervals,
    scheduling: input.scheduling,
  });
  const nextReviewAt = addDays(completedDate, nextInterval.intervalDays);
  const durationSeconds = secondsBetween(item.startedAt, completedAt);

  item.status = input.feedback === "skipped" ? "skipped" : "done";
  item.completedAt = completedAt;
  input.plan.updatedAt = completedAt;

  const doc = {
    ...input.doc,
    lastReviewedAt: completedDate,
    nextReviewAt,
    status: nextStatus(input.feedback, input.doc.status),
    priorityBoost: nextPriorityBoost(input.feedback, input.doc.priorityBoost),
    ...nextInterval.memoryState,
  };

  const event: ReviewEvent = {
    id: createReviewEventId(input.doc.docId, completedAt),
    docId: input.doc.docId,
    feedback: input.feedback,
    startedAt: item.startedAt,
    completedAt,
    durationSeconds,
    nextReviewAt,
    intervalDays: nextInterval.intervalDays,
  };

  return { doc, plan: input.plan, event };
}

export function recordClozeCheck(doc: ReviewDocState): ReviewDocState {
  return {
    ...doc,
    clozeCheckCount: (doc.clozeCheckCount ?? 0) + 1,
  };
}

function nextStatus(feedback: ReviewFeedback, current: ReviewDocState["status"]): ReviewDocState["status"] {
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
