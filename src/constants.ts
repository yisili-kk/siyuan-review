import type { TemplateQuestion } from "./types/review";
import type { ReviewSettings } from "./types/settings";

export const DATA_SCHEMA_VERSION = 2;
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

export const BLOCK_TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  "这个片段现在最值得保留的观点是什么？",
  "这个片段有没有需要补充、澄清或验证的地方？",
  "它可以和最近哪些文档、项目或问题建立连接？",
  "如果只保留一个结论，这个片段应该留下什么？",
  "下一步可以补充、拆分或重构哪里？",
];

export const LANGUAGE_TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  "这个词或短语的核心含义是什么？",
  "它最常出现在哪些语境或搭配里？",
  "能否用自己的话造一个自然的例句？",
  "它和相近表达有什么区别？",
  "哪一个例句最能帮助记住它？",
];

export const RESOURCE_TEMPLATE_QUESTIONS: TemplateQuestion[] = [
  "这份资源最值得保留的信息是什么？",
  "它适合解决哪一类问题或任务？",
  "后续使用它时最重要的入口在哪里？",
  "是否需要补充来源、摘要或使用场景？",
  "它可以和哪个项目或主题建立连接？",
];

export const DEFAULT_SETTINGS: ReviewSettings = {
  enabledNotebooks: [],
  reviewGroups: [
    {
      id: "default",
      name: "普通笔记",
      tag: "review",
      dailyLimit: 2,
      templateQuestions: TEMPLATE_QUESTIONS,
      enabled: true,
    },
    {
      id: "language",
      name: "语言点",
      tag: "review/language",
      dailyLimit: 3,
      templateQuestions: LANGUAGE_TEMPLATE_QUESTIONS,
      enabled: true,
    },
    {
      id: "resource",
      name: "资源笔记",
      tag: "review/resource",
      dailyLimit: 1,
      templateQuestions: RESOURCE_TEMPLATE_QUESTIONS,
      enabled: true,
    },
  ],
  intervals: {
    valuable: 14,
    normal: 7,
    needsSupplement: 3,
    needsRefactor: 3,
    skipped: 1,
  },
  scheduling: {
    maxIntervalDays: 180,
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
