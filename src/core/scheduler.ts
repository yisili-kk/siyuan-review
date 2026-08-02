import type {
  DailyPlan,
  DailyPlanItem,
  DailyPlanItemStatus,
  DailyPlanReason,
  ReviewCandidate,
} from "../types/review";
import { isDue } from "../utils/date";

type BuildDailyPlanInput = {
  date: string;
  dailyLimit: number;
  candidates: ReviewCandidate[];
  existingPlan?: DailyPlan;
  nowIso?: string;
};

type ScoredCandidate = {
  candidate: ReviewCandidate;
  reason: DailyPlanReason;
  score: number;
};

const TERMINAL_STATUSES = new Set(["done", "skipped"]);
const OVERDUE_DAY_WEIGHT = 20;
const LAPSE_WEIGHT = 25;
const MAX_LAPSE_PRIORITY = 200;

export function buildDailyPlan(input: BuildDailyPlanInput): DailyPlan {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const preservedItems = getPreservedItems(input.existingPlan);
  const preservedDocIds = new Set(preservedItems.map((item) => item.docId));
  const remainingSlots = Math.max(input.dailyLimit - preservedItems.length, 0);

  const selectedItems = rankCandidates(input.candidates, input.date)
    .filter(({ candidate }) => candidate.exists)
    .filter(({ candidate }) => !preservedDocIds.has(candidate.docId))
    .slice(0, remainingSlots)
    .map<DailyPlanItem>(({ candidate, reason }) => ({
      docId: candidate.docId,
      reason,
      status: "pending",
    }));

  return {
    date: input.date,
    items: [...preservedItems, ...selectedItems],
    generatedAt: input.existingPlan?.generatedAt ?? nowIso,
    updatedAt: nowIso,
  };
}

export function rankCandidates(candidates: ReviewCandidate[], date: string): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreCandidate(candidate, date))
    .sort((a, b) => b.score - a.score);
}

export function getIncompleteCount(plan: DailyPlan | undefined): number {
  if (!plan) {
    return 0;
  }

  return plan.items.filter((item) => item.status === "pending" || item.status === "reviewing").length;
}

export function syncDailyPlanAvailability(
  plan: DailyPlan,
  candidates: ReviewCandidate[],
  nowIso = new Date().toISOString(),
): DailyPlan {
  const availableDocIds = new Set(candidates.filter((candidate) => candidate.exists).map((candidate) => candidate.docId));
  let changed = false;

  const items = plan.items.map((item) => {
    const nextStatus = getAvailabilitySyncedStatus(item.status, availableDocIds.has(item.docId));
    if (nextStatus === item.status) {
      return item;
    }

    changed = true;
    return {
      ...item,
      status: nextStatus,
    };
  });

  return changed
    ? {
        ...plan,
        items,
        updatedAt: nowIso,
      }
    : plan;
}

function getPreservedItems(plan: DailyPlan | undefined): DailyPlanItem[] {
  if (!plan) {
    return [];
  }

  return plan.items.filter((item) => TERMINAL_STATUSES.has(item.status));
}

function getAvailabilitySyncedStatus(status: DailyPlanItemStatus, isAvailable: boolean): DailyPlanItemStatus {
  if (TERMINAL_STATUSES.has(status)) {
    return status;
  }

  if (!isAvailable) {
    return "missing";
  }

  return status === "missing" ? "pending" : status;
}

function scoreCandidate(candidate: ReviewCandidate, date: string): ScoredCandidate {
  const due = isDue(candidate.nextReviewAt, date);
  const priorityBoost = candidate.priorityBoost ?? 0;
  const statusPriority = candidate.status === "needsRefactor" ? 300 : candidate.status === "needsSupplement" ? 250 : 0;
  const neverReviewedPriority = candidate.lastReviewedAt ? 0 : 200;
  const oldestReviewedPriority = candidate.lastReviewedAt ? daysSince(candidate.lastReviewedAt, date) : 0;
  const overduePriority = getOverduePriority(candidate.nextReviewAt, date);
  const lapsePriority = Math.min((candidate.lapseCount ?? 0) * LAPSE_WEIGHT, MAX_LAPSE_PRIORITY);
  const randomJitter = Math.random();

  const reason = getReason(candidate, date);

  return {
    candidate,
    reason,
    score:
      overduePriority +
      statusPriority +
      neverReviewedPriority +
      oldestReviewedPriority +
      priorityBoost +
      lapsePriority +
      randomJitter,
  };
}

function getOverduePriority(nextReviewAt: string | undefined, date: string): number {
  return isDue(nextReviewAt, date) && nextReviewAt
    ? 1000 + daysSince(nextReviewAt, date) * OVERDUE_DAY_WEIGHT
    : 0;
}

function getReason(candidate: ReviewCandidate, date: string): DailyPlanReason {
  if (isDue(candidate.nextReviewAt, date)) {
    return "due";
  }

  if (candidate.status === "needsSupplement" || candidate.status === "needsRefactor") {
    return "priority";
  }

  if (!candidate.lastReviewedAt) {
    return "neverReviewed";
  }

  return "oldestReviewed";
}

function daysSince(dateKey: string, todayKey: string): number {
  const from = Date.parse(`${dateKey}T00:00:00`);
  const to = Date.parse(`${todayKey}T00:00:00`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return 0;
  }

  return Math.max(Math.floor((to - from) / 86400000), 0);
}
