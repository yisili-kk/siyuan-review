import { DATA_SCHEMA_VERSION, REVIEW_DATA_BACKUP_FILE, REVIEW_DATA_FILE } from "../constants";
import type { DailyPlan, ReviewData, ReviewEvent, ReviewItem } from "../types/review";
import type { PersistAdapter } from "./persist-adapter";
import { migrateReviewData } from "./migrations";

export class ReviewStore {
  private data: ReviewData | undefined;

  constructor(private readonly adapter: PersistAdapter) {}

  async load(): Promise<ReviewData> {
    const saved = await this.adapter.loadData<unknown>(REVIEW_DATA_FILE);
    this.data = migrateReviewData(saved);
    return this.data;
  }

  getData(): ReviewData {
    if (!this.data) {
      this.data = createEmptyReviewData();
    }

    return this.data;
  }

  async save(): Promise<void> {
    await this.adapter.saveData(REVIEW_DATA_FILE, this.getData());
  }

  async saveBackup(): Promise<void> {
    await this.adapter.saveData(REVIEW_DATA_BACKUP_FILE, this.getData());
  }

  replaceData(data: ReviewData): void {
    this.data = data;
  }

  upsertItems(items: ReviewItem[]): void {
    const data = this.getData();
    for (const item of items) {
      data.items[item.itemId] = {
        ...data.items[item.itemId],
        ...item,
      };
    }
  }

  setDailyPlan(plan: DailyPlan): void {
    this.getData().dailyPlans[plan.date] = plan;
  }

  addHistory(event: ReviewEvent): void {
    this.getData().history.push(event);
  }
}

export function createEmptyReviewData(): ReviewData {
  return {
    schemaVersion: DATA_SCHEMA_VERSION,
    items: {},
    dailyPlans: {},
    history: [],
  };
}
