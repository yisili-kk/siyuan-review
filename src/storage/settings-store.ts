import { DEFAULT_SETTINGS, SETTINGS_FILE } from "../constants";
import type { ReviewGroupSettings, ReviewSettings } from "../types/settings";
import type { PersistAdapter } from "./persist-adapter";

export class SettingsStore {
  constructor(private readonly adapter: PersistAdapter) {}

  async load(): Promise<ReviewSettings> {
    const saved = await this.adapter.loadData<Partial<ReviewSettings>>(SETTINGS_FILE);
    return mergeSettings(saved);
  }

  async save(settings: ReviewSettings): Promise<void> {
    await this.adapter.saveData(SETTINGS_FILE, settings);
  }
}

export function mergeSettings(saved: Partial<ReviewSettings> | undefined): ReviewSettings {
  const reviewGroups = normalizeReviewGroups(saved?.reviewGroups);
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    reviewGroups,
    intervals: {
      ...DEFAULT_SETTINGS.intervals,
      ...saved?.intervals,
    },
    scheduling: {
      ...DEFAULT_SETTINGS.scheduling,
      ...saved?.scheduling,
    },
    ai: {
      ...DEFAULT_SETTINGS.ai,
      ...saved?.ai,
    },
    dataRetention: {
      ...DEFAULT_SETTINGS.dataRetention,
      ...saved?.dataRetention,
    },
  };
}

function normalizeReviewGroups(groups: ReviewGroupSettings[] | undefined): ReviewGroupSettings[] {
  const defaultQuestionsById = new Map(DEFAULT_SETTINGS.reviewGroups.map((group) => [group.id, group.templateQuestions]));
  const normalized =
    groups
      ?.map((group, index) => ({
        id: group.id.trim() || `group-${index + 1}`,
        name: group.name.trim() || `分组 ${index + 1}`,
        tag: group.tag.trim(),
        dailyLimit: clampDailyLimit(group.dailyLimit),
        templateQuestions: normalizeTemplateQuestions(group.templateQuestions, defaultQuestionsById.get(group.id)),
        enabled: Boolean(group.enabled),
      }))
      .filter((group) => group.tag) ?? [];

  return normalized.length > 0 ? normalized : DEFAULT_SETTINGS.reviewGroups;
}

function normalizeTemplateQuestions(questions: string[] | undefined, fallback?: string[]): string[] {
  const normalized = questions?.map((question) => question.trim()).filter(Boolean).slice(0, 10) ?? [];
  return normalized.length > 0 ? normalized : [...(fallback ?? DEFAULT_SETTINGS.reviewGroups[0]?.templateQuestions ?? [])];
}

function clampDailyLimit(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }

  return Math.min(Math.max(Math.trunc(value), 0), 50);
}
