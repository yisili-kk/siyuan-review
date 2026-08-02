import { Plugin, showMessage } from "siyuan";
import { DEFAULT_SETTINGS } from "./constants";
import { buildDailyPlan, getIncompleteCount, syncDailyPlanAvailability } from "./core/scheduler";
import { scanReviewCandidates, mergeCandidatesWithStoredState } from "./core/document-indexer";
import { completeReview, recordClozeCheck, startReview } from "./core/review-service";
import { canUseAiQuestionGeneration, getReviewQuestions } from "./core/question-service";
import { SettingsStore } from "./storage/settings-store";
import { ReviewStore } from "./storage/review-store";
import type { PersistAdapter } from "./storage/persist-adapter";
import { markMissingItems, pruneReviewData } from "./storage/data-retention";
import { toDateKey } from "./utils/date";
import { createTopbarController, type TopbarController } from "./ui/topbar";
import { createDockController, type DockController, type ProcessingFeedbackDraft } from "./ui/dock";
import { getBlockMarkdown, openReviewItem } from "./siyuan/document";
import { openClozeDialog } from "./ui/cloze-dialog";
import { openReviewCenterDialog } from "./ui/review-center-dialog";
import { openSettingsDialog } from "./ui/settings-dialog";
import { REVIEW_ICONS } from "./ui/icons";
import type { DailyPlan, ReviewCandidate, ReviewFeedback, ReviewItem } from "./types/review";
import { listNotebooks } from "./siyuan/notebook";
import { generateAiQuestions } from "./ai/question-generator";
import "./ui/styles.css";

export default class SiyuanReviewPlugin extends Plugin {
  private settingsStore?: SettingsStore;
  private reviewStore?: ReviewStore;
  private topbar?: TopbarController;
  private dock?: DockController;
  private selectedItemId?: string;
  private enhancingQuestionItemIds = new Set<string>();
  private submittingFeedbackItemIds = new Set<string>();
  private openingClozeItemIds = new Set<string>();
  private processingFeedbackDrafts = new Map<string, ProcessingFeedbackDraft>();
  private startupRefreshTimer?: ReturnType<typeof globalThis.setTimeout>;
  private unloaded = false;

  async onload(): Promise<void> {
    console.info("[siyuan-review] plugin loading");
    this.unloaded = false;
    this.addIcons(REVIEW_ICONS);
    const adapter = createPluginPersistAdapter(this);
    this.settingsStore = new SettingsStore(adapter);
    this.reviewStore = new ReviewStore(adapter);

    this.topbar = createTopbarController(this, () => {
      void this.openReviewCenter();
    });

    this.dock = createDockController(this, {
      onRefresh: async () => {
        this.selectedItemId = undefined;
        await this.refreshTodayPlan();
      },
      onRegenerate: async () => {
        this.selectedItemId = undefined;
        await this.regenerateTodayPlan();
      },
      onRegenerateQuestions: async (itemId) => {
        await this.enhanceQuestions(itemId);
      },
      onOpenCloze: async (itemId) => {
        await this.openCloze(itemId);
      },
      onSelectItem: async (itemId) => {
        await this.selectItem(itemId);
      },
      onFeedback: async (itemId, feedback, note) => {
        return this.submitFeedback(itemId, feedback, note);
      },
      onOpenProcessingFeedback: (itemId) => {
        if (!this.processingFeedbackDrafts.has(itemId)) {
          this.processingFeedbackDrafts.set(itemId, {});
        }
        this.renderCurrentDock();
      },
      onCancelProcessingFeedback: (itemId) => {
        this.processingFeedbackDrafts.delete(itemId);
        this.renderCurrentDock();
      },
      onUpdateProcessingFeedbackDraft: (itemId, draft) => {
        this.processingFeedbackDrafts.set(itemId, draft);
      },
      onOpenSettings: () => {
        void this.openSettings();
      },
      onBack: () => {
        this.selectedItemId = undefined;
        this.renderCurrentDock();
      },
    });
    this.dock.register();

    try {
      const settings = await this.settingsStore.load();
      await this.settingsStore.save(settings);
    } catch (error) {
      console.warn("[siyuan-review] failed to load settings, using defaults for this session", error);
      showMessage("文档回顾设置读取失败，本次将使用默认设置。", 3000, "error");
    }

    try {
      await this.reviewStore.load();
    } catch (error) {
      console.warn("[siyuan-review] failed to load review data, using empty state for this session", error);
      showMessage("文档回顾数据读取失败，本次将使用空状态。", 3000, "error");
    }

    this.renderCurrentDock();
    this.scheduleStartupRefresh();
    console.info("[siyuan-review] plugin loaded");
  }

  onunload(): void {
    this.unloaded = true;
    if (this.startupRefreshTimer) {
      globalThis.clearTimeout(this.startupRefreshTimer);
      this.startupRefreshTimer = undefined;
    }
    this.topbar?.dispose();
    this.dock?.dispose();
  }

  private scheduleStartupRefresh(): void {
    if (this.startupRefreshTimer) {
      globalThis.clearTimeout(this.startupRefreshTimer);
    }

    this.startupRefreshTimer = globalThis.setTimeout(() => {
      this.startupRefreshTimer = undefined;
      if (!this.unloaded) {
        void this.refreshTodayPlan();
      }
    }, 300);
  }

  private async refreshTodayPlan(): Promise<boolean> {
    return this.createOrRefreshTodayPlan(false);
  }

  private async regenerateTodayPlan(): Promise<boolean> {
    return this.createOrRefreshTodayPlan(true);
  }

  private async createOrRefreshTodayPlan(forceRegenerate: boolean): Promise<boolean> {
    if (this.unloaded) {
      return false;
    }

    const store = this.reviewStore;
    if (!store) {
      return false;
    }

    const data = store.getData();
    const date = toDateKey();

    try {
      const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
      const candidates = mergeCandidatesWithStoredState(await scanReviewCandidates(settings), data.items);
      if (this.unloaded) {
        return false;
      }

      store.upsertItems(candidates);
      store.upsertItems(markMissingItems(data.items, candidates.map((candidate) => candidate.itemId), date));

      const existingPlan = data.dailyPlans[date];
      const plan =
        existingPlan && !forceRegenerate
          ? syncDailyPlanAvailability(existingPlan, candidates)
          : buildDailyPlan({
              date,
              dailyLimit: settings.dailyLimit,
              candidates,
              existingPlan,
            });

      store.setDailyPlan(plan);
      await this.pruneStoredData(settings, candidates.map((candidate) => candidate.itemId));
      await store.save();
      if (this.unloaded) {
        return false;
      }

      this.topbar?.setBadge(getIncompleteCount(plan));
      this.renderCurrentDock();
      await this.notifyTodayPlanOnce(date, plan.items.length);
      return true;
    } catch (error) {
      console.error("[siyuan-review] failed to refresh today plan", error);
      showMessage("文档回顾列表刷新失败，请稍后重试。", 3000, "error");
      return false;
    }
  }

  private async selectItem(itemId: string): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    const plan = data.dailyPlans[toDateKey()];
    const item = data.items[itemId];
    const planItem = plan?.items.find((planItem) => planItem.itemId === itemId);

    if (!plan || !item || !planItem) {
      showMessage("这个回顾项暂时不可用。", 3000, "error");
      return;
    }

    if (planItem.status === "missing") {
      showMessage("这个回顾项已不在当前回顾池中。", 3000, "error");
      return;
    }

    try {
      await openReviewItem(this.app, item.itemId);
      if (planItem.status !== "done" && planItem.status !== "skipped") {
        startReview(plan, itemId);
        store.setDailyPlan(plan);
        await store.save();
      }
      this.selectedItemId = itemId;
      this.renderCurrentDock();
      this.topbar?.setBadge(getIncompleteCount(plan));
    } catch (error) {
      console.error("[siyuan-review] failed to open document", error);
      showMessage("打开文档失败。", 3000, "error");
    }
  }

  private async submitFeedback(itemId: string, feedback: ReviewFeedback, note?: string): Promise<boolean> {
    if (this.submittingFeedbackItemIds.has(itemId)) {
      showMessage("本次反馈正在记录中，请稍候。", 2000);
      return false;
    }

    const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
    const store = this.reviewStore;
    if (!store) {
      return false;
    }

    const data = store.getData();
    const plan = data.dailyPlans[toDateKey()];
    const item = data.items[itemId];

    if (!plan || !item) {
      showMessage("无法提交反馈，今日列表或回顾项状态不存在。", 3000, "error");
      return false;
    }

    this.submittingFeedbackItemIds.add(itemId);
    this.renderCurrentDock();

    try {
      const result = completeReview({
        item,
        plan,
        feedback,
        intervals: settings.intervals,
        scheduling: settings.scheduling,
        note,
      });

      store.upsertItems([result.item]);
      store.setDailyPlan(result.plan);
      store.addHistory(result.event);
      await store.save();

      this.processingFeedbackDrafts.delete(itemId);
      this.selectedItemId = undefined;
      this.renderCurrentDock();
      this.topbar?.setBadge(getIncompleteCount(result.plan));
      showMessage("已记录本次回顾。", 2000);
      return true;
    } catch (error) {
      console.error("[siyuan-review] failed to submit feedback", error);
      showMessage("提交反馈失败。", 3000, "error");
      return false;
    } finally {
      this.submittingFeedbackItemIds.delete(itemId);
      this.renderCurrentDock();
    }
  }

  private async openReviewCenter(): Promise<void> {
    const settingsStore = this.settingsStore;
    const store = this.reviewStore;
    if (!settingsStore || !store) {
      return;
    }

    try {
      const settings = await settingsStore.load();
      const candidates = await this.getReviewCenterCandidates(settings);
      const data = store.getData();
      openReviewCenterDialog({
        date: toDateKey(),
        items: candidates,
        todayPlan: data.dailyPlans[toDateKey()],
        onRefresh: async () => {
          return this.refreshReviewCenterItems();
        },
        onOpenItem: async (itemId) => {
          const item = store.getData().items[itemId];
          if (!item) {
            throw new Error(`Review item ${itemId} does not exist.`);
          }
          await openReviewItem(this.app, item.itemId);
        },
        onOpenCloze: async (itemId) => {
          await this.openCloze(itemId);
        },
        onOpenSettings: () => {
          void this.openSettings();
        },
      });
    } catch (error) {
      console.error("[siyuan-review] failed to open review center", error);
      showMessage("打开文档回顾中心失败。", 3000, "error");
    }
  }

  private async openSettings(): Promise<void> {
    const settingsStore = this.settingsStore;
    if (!settingsStore) {
      return;
    }

    try {
      const settings = await settingsStore.load();
      const notebooks = await listNotebooks();
      openSettingsDialog({
        settings,
        notebooks,
        onSave: async (nextSettings) => {
          await settingsStore.save(nextSettings);
          return { refreshed: await this.regenerateTodayPlan() };
        },
      });
    } catch (error) {
      console.error("[siyuan-review] failed to open settings", error);
      showMessage("打开设置失败。", 3000, "error");
    }
  }

  private async getReviewCenterCandidates(settings = DEFAULT_SETTINGS): Promise<ReviewCandidate[]> {
    const store = this.reviewStore;
    if (!store) {
      return [];
    }

    const data = store.getData();
    const date = toDateKey();
    try {
      const candidates = mergeCandidatesWithStoredState(await scanReviewCandidates(settings), data.items);
      store.upsertItems(candidates);
      store.upsertItems(markMissingItems(data.items, candidates.map((candidate) => candidate.itemId), date));
      await store.save();
      return candidates;
    } catch (error) {
      console.warn("[siyuan-review] failed to scan review pool, using stored data", error);
      showMessage("回顾池扫描失败，已展示本地已有数据。", 3000, "error");
      return Object.values(data.items)
        .filter((item) => !item.missingSince)
        .map((item) => ({
          ...item,
          exists: true,
        }));
    }
  }

  private async refreshReviewCenterItems(): Promise<{ items: ReviewCandidate[]; todayPlan?: DailyPlan }> {
    const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
    const store = this.reviewStore;
    if (!store) {
      return { items: [] };
    }

    const candidates = await this.getReviewCenterCandidates(settings);
    const data = store.getData();
    const date = toDateKey();
    const existingPlan = data.dailyPlans[date];
    if (existingPlan) {
      store.setDailyPlan(syncDailyPlanAvailability(existingPlan, candidates));
      await store.save();
      this.topbar?.setBadge(getIncompleteCount(store.getData().dailyPlans[date]));
      this.renderCurrentDock();
    }
    return {
      items: candidates,
      todayPlan: store.getData().dailyPlans[date],
    };
  }

  private async enhanceQuestions(itemId: string): Promise<void> {
    if (this.enhancingQuestionItemIds.has(itemId)) {
      showMessage("问题正在生成中，请稍候。", 2000);
      return;
    }

    const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    const item = data.items[itemId];
    const plan = data.dailyPlans[toDateKey()];
    if (!item || !plan) {
      return;
    }

    if (!canUseAiQuestionGeneration(settings.ai)) {
      showMessage("请先在设置中配置 AI 后再生成问题。", 3000, "error");
      return;
    }

    this.enhancingQuestionItemIds.add(itemId);
    this.renderCurrentDock();

    try {
      const content = await getBlockMarkdown(item.itemId);
      const questionCache = await getReviewQuestions({
        item,
        content,
        ai: settings.ai,
        generateAiQuestions,
      });

      store.upsertItems([{ ...item, questionCache }]);
      await store.save();

      if (this.selectedItemId === itemId) {
        this.renderCurrentDock();
      }
    } catch (error) {
      console.warn("[siyuan-review] failed to enhance questions", error);
      if (this.selectedItemId === itemId) {
        showMessage("问题生成失败，已保留当前问题。", 3000, "error");
      }
    } finally {
      this.enhancingQuestionItemIds.delete(itemId);
      this.renderCurrentDock();
    }
  }

  private async openCloze(itemId: string): Promise<void> {
    if (this.openingClozeItemIds.has(itemId)) {
      showMessage("检验界面正在打开中，请稍候。", 2000);
      return;
    }

    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const item = store.getData().items[itemId];
    if (!item) {
      showMessage("无法打开检验，回顾项状态不存在。", 3000, "error");
      return;
    }

    this.openingClozeItemIds.add(itemId);
    this.renderCurrentDock();

    try {
      openClozeDialog({
        docTitle: item.title,
        markdown: await getBlockMarkdown(item.itemId),
        onFinish: async () => {
          await this.saveClozeCheck(itemId);
        },
      });
    } catch (error) {
      console.error("[siyuan-review] failed to open cloze check", error);
      showMessage("打开检验失败。", 3000, "error");
    } finally {
      this.openingClozeItemIds.delete(itemId);
      this.renderCurrentDock();
    }
  }

  private async saveClozeCheck(itemId: string): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const item = store.getData().items[itemId];
    if (!item) {
      throw new Error(`Review item ${itemId} does not exist.`);
    }

    store.upsertItems([recordClozeCheck(item)]);
    await store.save();
    this.renderCurrentDock();
  }

  private renderCurrentDock(): void {
    if (this.unloaded) {
      return;
    }

    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    this.dock?.render({
      plan: data.dailyPlans[toDateKey()],
      items: data.items,
      history: data.history,
      processingFeedbackDrafts: Object.fromEntries(this.processingFeedbackDrafts),
      selectedItemId: this.selectedItemId,
      generatingQuestionItemIds: Array.from(this.enhancingQuestionItemIds),
      submittingFeedbackItemIds: Array.from(this.submittingFeedbackItemIds),
      openingClozeItemIds: Array.from(this.openingClozeItemIds),
    });
  }

  private async pruneStoredData(settings = DEFAULT_SETTINGS, protectedItemIds: string[] = []): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const result = pruneReviewData(store.getData(), settings.dataRetention, toDateKey(), protectedItemIds);
    if (!result.changed) {
      return;
    }

    await store.saveBackup();
    store.replaceData(result.data);
    console.info("[siyuan-review] pruned review data", {
      removedDailyPlans: result.removedDailyPlans,
      removedHistoryEvents: result.removedHistoryEvents,
      removedItems: result.removedItems,
    });
  }

  private async notifyTodayPlanOnce(date: string, total: number): Promise<void> {
    const store = this.reviewStore;
    if (!store || total === 0 || this.unloaded) {
      return;
    }

    const data = store.getData();
    if (data.lastNotifiedDate === date) {
      return;
    }

    data.lastNotifiedDate = date;
    await store.save();
    if (this.unloaded) {
      return;
    }
    showMessage(`今天有 ${total} 个回顾项待回顾。`, 3000);
  }
}

function createPluginPersistAdapter(plugin: Plugin): PersistAdapter {
  return {
    async loadData<T>(name: string): Promise<T | undefined> {
      return plugin.loadData(name) as Promise<T | undefined>;
    },
    async saveData<T>(name: string, data: T): Promise<void> {
      await plugin.saveData(name, data);
    },
  };
}
