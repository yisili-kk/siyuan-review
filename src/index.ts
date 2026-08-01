import { Plugin, showMessage } from "siyuan";
import { DEFAULT_SETTINGS } from "./constants";
import { buildDailyPlan, getIncompleteCount, syncDailyPlanAvailability } from "./core/scheduler";
import { scanReviewCandidates, mergeCandidatesWithStoredState } from "./core/document-indexer";
import { completeReview, recordClozeCheck, startReview } from "./core/review-service";
import { canUseAiQuestionGeneration, getReviewQuestions, shouldAutoGenerateQuestions } from "./core/question-service";
import { SettingsStore } from "./storage/settings-store";
import { ReviewStore } from "./storage/review-store";
import type { PersistAdapter } from "./storage/persist-adapter";
import { markMissingDocs, pruneReviewData } from "./storage/data-retention";
import { toDateKey } from "./utils/date";
import { createTopbarController, type TopbarController } from "./ui/topbar";
import { createDockController, type DockController } from "./ui/dock";
import { getDocumentMarkdown, openDocument } from "./siyuan/document";
import { openClozeDialog } from "./ui/cloze-dialog";
import { openReviewCenterDialog } from "./ui/review-center-dialog";
import { openSettingsDialog } from "./ui/settings-dialog";
import { REVIEW_ICONS } from "./ui/icons";
import type { ReviewCandidate, ReviewFeedback, ReviewDocState } from "./types/review";
import { listNotebooks } from "./siyuan/notebook";
import { generateAiQuestions } from "./ai/question-generator";
import "./ui/styles.css";

export default class SiyuanReviewPlugin extends Plugin {
  private settingsStore?: SettingsStore;
  private reviewStore?: ReviewStore;
  private topbar?: TopbarController;
  private dock?: DockController;
  private selectedDocId?: string;
  private enhancingQuestionDocIds = new Set<string>();
  private submittingFeedbackDocIds = new Set<string>();
  private openingClozeDocIds = new Set<string>();
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
        this.selectedDocId = undefined;
        await this.refreshTodayPlan();
      },
      onRegenerate: async () => {
        this.selectedDocId = undefined;
        await this.regenerateTodayPlan();
      },
      onRegenerateQuestions: async (docId) => {
        await this.enhanceQuestions(docId);
      },
      onOpenCloze: async (docId) => {
        await this.openCloze(docId);
      },
      onSelectDoc: async (docId) => {
        await this.selectDoc(docId);
      },
      onFeedback: async (docId, feedback) => {
        await this.submitFeedback(docId, feedback);
      },
      onOpenSettings: () => {
        void this.openSettings();
      },
      onBack: () => {
        this.selectedDocId = undefined;
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
      const candidates = mergeCandidatesWithStoredState(await scanReviewCandidates(settings), data.docs);
      if (this.unloaded) {
        return false;
      }

      store.upsertDocs(candidates);
      store.upsertDocs(markMissingDocs(data.docs, candidates.map((candidate) => candidate.docId), date));

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
      await this.pruneStoredData(settings, candidates.map((candidate) => candidate.docId));
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

  private async selectDoc(docId: string): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    const plan = data.dailyPlans[toDateKey()];
    const doc = data.docs[docId];
    const planItem = plan?.items.find((item) => item.docId === docId);

    if (!plan || !doc || !planItem) {
      showMessage("这个文档暂时不可用。", 3000, "error");
      return;
    }

    if (planItem.status === "missing") {
      showMessage("这个文档已不在当前回顾池中。", 3000, "error");
      return;
    }

    try {
      await openDocument(this.app, docId);
      if (planItem.status !== "done" && planItem.status !== "skipped") {
        startReview(plan, docId);
        store.setDailyPlan(plan);
        await store.save();
      }
      this.selectedDocId = docId;
      this.renderCurrentDock();
      this.topbar?.setBadge(getIncompleteCount(plan));
      if (planItem.status !== "done" && planItem.status !== "skipped" && shouldAutoGenerateQuestions(doc)) {
        void this.enhanceQuestions(docId);
      }
    } catch (error) {
      console.error("[siyuan-review] failed to open document", error);
      showMessage("打开文档失败。", 3000, "error");
    }
  }

  private async submitFeedback(docId: string, feedback: ReviewFeedback): Promise<void> {
    if (this.submittingFeedbackDocIds.has(docId)) {
      showMessage("本次反馈正在记录中，请稍候。", 2000);
      return;
    }

    const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    const plan = data.dailyPlans[toDateKey()];
    const doc = data.docs[docId];

    if (!plan || !doc) {
      showMessage("无法提交反馈，今日列表或文档状态不存在。", 3000, "error");
      return;
    }

    this.submittingFeedbackDocIds.add(docId);
    this.renderCurrentDock();

    try {
      const result = completeReview({
        doc,
        plan,
        feedback,
        intervals: settings.intervals,
      });

      store.upsertDocs([result.doc]);
      store.setDailyPlan(result.plan);
      store.addHistory(result.event);
      await store.save();

      this.selectedDocId = undefined;
      this.renderCurrentDock();
      this.topbar?.setBadge(getIncompleteCount(result.plan));
      showMessage("已记录本次回顾。", 2000);
    } catch (error) {
      console.error("[siyuan-review] failed to submit feedback", error);
      showMessage("提交反馈失败。", 3000, "error");
    } finally {
      this.submittingFeedbackDocIds.delete(docId);
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
        docs: buildReviewCenterDocs(candidates, data.docs),
        todayPlan: data.dailyPlans[toDateKey()],
        onOpenDoc: async (docId) => {
          await openDocument(this.app, docId);
        },
        onOpenCloze: async (docId) => {
          await this.openCloze(docId);
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
      const candidates = mergeCandidatesWithStoredState(await scanReviewCandidates(settings), data.docs);
      store.upsertDocs(candidates);
      store.upsertDocs(markMissingDocs(data.docs, candidates.map((candidate) => candidate.docId), date));
      await store.save();
      return candidates;
    } catch (error) {
      console.warn("[siyuan-review] failed to scan review pool, using stored data", error);
      showMessage("回顾池扫描失败，已展示本地已有数据。", 3000, "error");
      return Object.values(data.docs).map((doc) => ({
        ...doc,
        exists: !doc.missingSince,
      }));
    }
  }

  private async enhanceQuestions(docId: string): Promise<void> {
    if (this.enhancingQuestionDocIds.has(docId)) {
      showMessage("问题正在生成中，请稍候。", 2000);
      return;
    }

    const settings = (await this.settingsStore?.load()) ?? DEFAULT_SETTINGS;
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const data = store.getData();
    const doc = data.docs[docId];
    const plan = data.dailyPlans[toDateKey()];
    if (!doc || !plan) {
      return;
    }

    this.enhancingQuestionDocIds.add(docId);
    this.renderCurrentDock();

    try {
      const content = canUseAiQuestionGeneration(settings.ai) ? await getDocumentMarkdown(docId) : "";
      const questionCache = await getReviewQuestions({
        doc,
        content,
        ai: settings.ai,
        generateAiQuestions,
      });

      store.upsertDocs([{ ...doc, questionCache }]);
      await store.save();

      if (this.selectedDocId === docId) {
        this.renderCurrentDock();
      }
    } catch (error) {
      console.warn("[siyuan-review] failed to enhance questions", error);
      if (this.selectedDocId === docId) {
        showMessage("问题生成失败，已保留当前问题。", 3000, "error");
      }
    } finally {
      this.enhancingQuestionDocIds.delete(docId);
      this.renderCurrentDock();
    }
  }

  private async openCloze(docId: string): Promise<void> {
    if (this.openingClozeDocIds.has(docId)) {
      showMessage("检验界面正在打开中，请稍候。", 2000);
      return;
    }

    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const doc = store.getData().docs[docId];
    if (!doc) {
      showMessage("无法打开检验，文档状态不存在。", 3000, "error");
      return;
    }

    this.openingClozeDocIds.add(docId);
    this.renderCurrentDock();

    try {
      openClozeDialog({
        docTitle: doc.title,
        markdown: await getDocumentMarkdown(docId),
        onFinish: async () => {
          await this.saveClozeCheck(docId);
        },
      });
    } catch (error) {
      console.error("[siyuan-review] failed to open cloze check", error);
      showMessage("打开检验失败。", 3000, "error");
    } finally {
      this.openingClozeDocIds.delete(docId);
      this.renderCurrentDock();
    }
  }

  private async saveClozeCheck(docId: string): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const doc = store.getData().docs[docId];
    if (!doc) {
      throw new Error(`Document ${docId} does not exist.`);
    }

    store.upsertDocs([recordClozeCheck(doc)]);
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
      docs: data.docs,
      selectedDocId: this.selectedDocId,
      generatingQuestionDocIds: Array.from(this.enhancingQuestionDocIds),
      submittingFeedbackDocIds: Array.from(this.submittingFeedbackDocIds),
      openingClozeDocIds: Array.from(this.openingClozeDocIds),
    });
  }

  private async pruneStoredData(settings = DEFAULT_SETTINGS, protectedDocIds: string[] = []): Promise<void> {
    const store = this.reviewStore;
    if (!store) {
      return;
    }

    const result = pruneReviewData(store.getData(), settings.dataRetention, toDateKey(), protectedDocIds);
    if (!result.changed) {
      return;
    }

    await store.saveBackup();
    store.replaceData(result.data);
    console.info("[siyuan-review] pruned review data", {
      removedDailyPlans: result.removedDailyPlans,
      removedHistoryEvents: result.removedHistoryEvents,
      removedDocs: result.removedDocs,
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
    showMessage(`今天有 ${total} 篇文档待回顾。`, 3000);
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

function buildReviewCenterDocs(
  candidates: ReviewCandidate[],
  storedDocs: Record<string, ReviewDocState>,
): ReviewCandidate[] {
  const candidateIds = new Set(candidates.map((candidate) => candidate.docId));
  const missingStoredDocs = Object.values(storedDocs)
    .filter((doc) => !candidateIds.has(doc.docId))
    .map<ReviewCandidate>((doc) => ({
      ...doc,
      exists: false,
    }));

  return [...candidates, ...missingStoredDocs];
}
