import type { TemplateQuestion } from "./types/review";
import type { ReviewSettings } from "./types/settings";

export const DATA_SCHEMA_VERSION = 1;
export const SETTINGS_FILE = "settings.json";
export const REVIEW_DATA_FILE = "review-data.json";
export const REVIEW_DATA_BACKUP_FILE = "review-data.backup.json";

export const TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  "这篇文档现在最有价值的部分是什么？",
  "这篇文档有没有已经过时、模糊或缺证据的地方？",
  "它可以和最近哪些文档、项目或问题建立连接？",
  "如果只能保留一个结论，这篇文档应该留下什么？",
  "下一步可以补充、拆分或重构哪里？",
];

export const DEFAULT_SETTINGS: ReviewSettings = {
  enabledNotebooks: [],
  dailyLimit: 5,
  reviewTag: "review",
  intervals: {
    valuable: 14,
    normal: 7,
    needsSupplement: 3,
    needsRefactor: 3,
    skipped: 1,
  },
  ai: {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    contentStrategy: "full",
    maxChars: 16000,
  },
  dataRetention: {
    enabled: true,
    keepDailyPlansDays: 180,
    keepHistoryLimit: 1000,
    pruneMissingDocsDays: 90,
  },
};
