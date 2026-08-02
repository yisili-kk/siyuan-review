import type { ReviewSettings } from "./settings";

export type ReviewFeedback =
  | "valuable"
  | "normal"
  | "needsSupplement"
  | "needsRefactor"
  | "skipped";

export type ReviewItemType = "document" | "block";

export type ReviewItemStatus = "normal" | "needsSupplement" | "needsRefactor";

export type DailyPlanReason =
  | "due"
  | "neverReviewed"
  | "oldestReviewed"
  | "priority";

export type DailyPlanItemStatus =
  | "pending"
  | "reviewing"
  | "done"
  | "skipped"
  | "missing";

export type TemplateQuestion = string;

export type QuestionSource = "template" | "ai";

export type QuestionCache = {
  source: QuestionSource;
  questions: string[];
  generatedAt: string;
  contentHash?: string;
};

export type ReviewItem = {
  itemId: string;
  itemType: ReviewItemType;
  docId: string;
  notebookId: string;
  blockType: string;
  title: string;
  sourceTitle: string;
  path: string;
  contentPreview: string;
  contentHash?: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  status?: ReviewItemStatus;
  priorityBoost?: number;
  reviewCount?: number;
  successStreak?: number;
  lapseCount?: number;
  currentIntervalDays?: number;
  lastFeedback?: ReviewFeedback;
  questionCache?: QuestionCache;
  missingSince?: string;
  clozeCheckCount?: number;
};

export type ReviewCandidate = ReviewItem & {
  exists: boolean;
};

export type DailyPlanItem = {
  itemId: string;
  reason: DailyPlanReason;
  status: DailyPlanItemStatus;
  startedAt?: string;
  completedAt?: string;
};

export type DailyPlan = {
  date: string;
  items: DailyPlanItem[];
  generatedAt: string;
  updatedAt: string;
};

export type ReviewEvent = {
  id: string;
  itemId: string;
  feedback: ReviewFeedback;
  note?: string;
  startedAt?: string;
  completedAt: string;
  durationSeconds?: number;
  nextReviewAt: string;
  intervalDays?: number;
};

export type ReviewData = {
  schemaVersion: 2;
  items: Record<string, ReviewItem>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
  lastNotifiedDate?: string;
};

export type ReviewExport = {
  schemaVersion: 2;
  exportedAt: string;
  settings: ReviewSettings;
  items: Record<string, ReviewItem>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
};

export type StartReviewResult = {
  plan: DailyPlan;
  item: DailyPlanItem;
};
