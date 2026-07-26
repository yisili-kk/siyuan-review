import type { ReviewSettings } from "./settings";

export type ReviewFeedback =
  | "valuable"
  | "normal"
  | "needsSupplement"
  | "needsRefactor"
  | "skipped";

export type ReviewDocStatus = "normal" | "needsSupplement" | "needsRefactor";

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

export type ReviewDocState = {
  docId: string;
  notebookId: string;
  title: string;
  path: string;
  lastReviewedAt?: string;
  nextReviewAt?: string;
  status?: ReviewDocStatus;
  priorityBoost?: number;
  questionCache?: QuestionCache;
};

export type ReviewCandidate = ReviewDocState & {
  exists: boolean;
};

export type DailyPlanItem = {
  docId: string;
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
  docId: string;
  feedback: ReviewFeedback;
  startedAt?: string;
  completedAt: string;
  durationSeconds?: number;
  nextReviewAt: string;
};

export type ReviewData = {
  schemaVersion: 1;
  docs: Record<string, ReviewDocState>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
  lastNotifiedDate?: string;
};

export type ReviewExport = {
  schemaVersion: 1;
  exportedAt: string;
  settings: ReviewSettings;
  docs: Record<string, ReviewDocState>;
  dailyPlans: Record<string, DailyPlan>;
  history: ReviewEvent[];
};

export type StartReviewResult = {
  plan: DailyPlan;
  item: DailyPlanItem;
};
