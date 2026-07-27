import { DEFAULT_SETTINGS, SETTINGS_FILE } from "../constants";
import type { ReviewSettings } from "../types/settings";
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
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    intervals: {
      ...DEFAULT_SETTINGS.intervals,
      ...saved?.intervals,
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
