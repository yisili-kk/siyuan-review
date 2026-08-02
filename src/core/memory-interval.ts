import type { ReviewFeedback, ReviewItem } from "../types/review";
import type { ReviewIntervals, ReviewSchedulingSettings } from "../types/settings";

type CalculateNextIntervalInput = {
  item: ReviewItem;
  feedback: ReviewFeedback;
  intervals: ReviewIntervals;
  scheduling?: ReviewSchedulingSettings;
};

type CalculateNextIntervalResult = {
  intervalDays: number;
  memoryState: Pick<
    ReviewItem,
    "reviewCount" | "successStreak" | "lapseCount" | "currentIntervalDays" | "lastFeedback"
  >;
};

const NORMAL_SUCCESS_STEPS = [3, 7, 14];
const VALUABLE_SUCCESS_STEPS = [7, 14, 28];
const DEFAULT_MAX_INTERVAL_DAYS = 180;
const MIN_INTERVAL_DAYS = 1;

export function calculateNextInterval(input: CalculateNextIntervalInput): CalculateNextIntervalResult {
  const maxIntervalDays = clampMaxInterval(input.scheduling?.maxIntervalDays);
  const previousInterval = getPreviousInterval(input.item, input.intervals);

  if (input.feedback === "skipped") {
    const intervalDays = clamp(input.intervals.skipped, MIN_INTERVAL_DAYS, Math.min(maxIntervalDays, 7));
    return {
      intervalDays,
      memoryState: {
        reviewCount: input.item.reviewCount ?? 0,
        successStreak: input.item.successStreak ?? 0,
        lapseCount: input.item.lapseCount ?? 0,
        currentIntervalDays: input.item.currentIntervalDays,
        lastFeedback: input.feedback,
      },
    };
  }

  if (input.feedback === "needsSupplement") {
    const intervalDays = clamp(Math.min(input.intervals.needsSupplement, Math.ceil(previousInterval / 2)), 1, maxIntervalDays);
    return {
      intervalDays,
      memoryState: {
        reviewCount: increment(input.item.reviewCount),
        successStreak: 0,
        lapseCount: increment(input.item.lapseCount),
        currentIntervalDays: intervalDays,
        lastFeedback: input.feedback,
      },
    };
  }

  if (input.feedback === "needsRefactor") {
    const intervalDays = clamp(Math.min(input.intervals.needsRefactor, Math.ceil(previousInterval / 3)), 1, maxIntervalDays);
    return {
      intervalDays,
      memoryState: {
        reviewCount: increment(input.item.reviewCount),
        successStreak: 0,
        lapseCount: increment(input.item.lapseCount),
        currentIntervalDays: intervalDays,
        lastFeedback: input.feedback,
      },
    };
  }

  const nextSuccessStreak = increment(input.item.successStreak);
  const intervalDays = getSuccessInterval({
    feedback: input.feedback,
    successStreak: nextSuccessStreak,
    previousInterval,
    maxIntervalDays,
  });

  return {
    intervalDays,
    memoryState: {
      reviewCount: increment(input.item.reviewCount),
      successStreak: nextSuccessStreak,
      lapseCount: input.item.lapseCount ?? 0,
      currentIntervalDays: intervalDays,
      lastFeedback: input.feedback,
    },
  };
}

function getSuccessInterval(input: {
  feedback: ReviewFeedback;
  successStreak: number;
  previousInterval: number;
  maxIntervalDays: number;
}): number {
  const steps = input.feedback === "valuable" ? VALUABLE_SUCCESS_STEPS : NORMAL_SUCCESS_STEPS;
  const stepInterval = steps[input.successStreak - 1];
  if (stepInterval) {
    return clamp(stepInterval, MIN_INTERVAL_DAYS, input.maxIntervalDays);
  }

  const factor = input.feedback === "valuable" ? 2 : 1.8;
  return clamp(Math.round(input.previousInterval * factor), MIN_INTERVAL_DAYS, input.maxIntervalDays);
}

function getPreviousInterval(item: ReviewItem, intervals: ReviewIntervals): number {
  if (Number.isFinite(item.currentIntervalDays) && item.currentIntervalDays && item.currentIntervalDays > 0) {
    return item.currentIntervalDays;
  }

  return intervals.normal;
}

function clampMaxInterval(value: number | undefined): number {
  return clamp(value ?? DEFAULT_MAX_INTERVAL_DAYS, 7, 3650);
}

function increment(value: number | undefined): number {
  return (value ?? 0) + 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(Math.trunc(value), min), max);
}
