export type AiContentStrategy = "full";

export type ReviewIntervals = {
  valuable: number;
  normal: number;
  needsSupplement: number;
  needsRefactor: number;
  skipped: number;
};

export type ReviewSchedulingSettings = {
  maxIntervalDays: number;
};

export type AiSettings = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  contentStrategy: AiContentStrategy;
  maxChars: number;
};

export type DataRetentionSettings = {
  enabled: boolean;
  keepDailyPlansDays: number;
  keepHistoryLimit: number;
  pruneMissingDocsDays: number;
};

export type ReviewGroupSettings = {
  id: string;
  name: string;
  tag: string;
  dailyLimit: number;
  templateQuestions: string[];
  enabled: boolean;
};

export type ReviewSettings = {
  enabledNotebooks: string[];
  reviewGroups: ReviewGroupSettings[];
  intervals: ReviewIntervals;
  scheduling: ReviewSchedulingSettings;
  ai: AiSettings;
  dataRetention: DataRetentionSettings;
};
