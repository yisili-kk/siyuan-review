import type { Custom, MobileCustom, Plugin } from "siyuan";
import type { DailyPlan, ReviewDocState, ReviewFeedback } from "../types/review";
import { getTemplateQuestions } from "../core/question-service";
import { renderFeedbackButtons } from "./components/feedback-buttons";
import { renderQuestionPanel } from "./components/question-panel";
import { renderReviewDetail } from "./components/review-detail";
import { renderTodayList } from "./components/today-list";

export type DockSnapshot = {
  plan?: DailyPlan;
  docs: Record<string, ReviewDocState>;
  selectedDocId?: string;
  generatingQuestionDocIds?: string[];
  submittingFeedbackDocIds?: string[];
  openingClozeDocIds?: string[];
};

export type DockActions = {
  onRefresh(): Promise<void>;
  onRegenerate(): Promise<void>;
  onRegenerateQuestions(docId: string): Promise<void>;
  onOpenCloze(docId: string): Promise<void>;
  onSelectDoc(docId: string): Promise<void>;
  onFeedback(docId: string, feedback: ReviewFeedback): Promise<void>;
  onOpenSettings(): void;
  onBack(): void;
};

export type DockController = {
  register(): void;
  render(snapshot: DockSnapshot): void;
  dispose(): void;
};

export function createDockController(plugin: Plugin, actions: DockActions): DockController {
  let root: HTMLElement | undefined;
  let snapshot: DockSnapshot = { docs: {} };

  function render(nextSnapshot: DockSnapshot = snapshot): void {
    snapshot = nextSnapshot;
    if (!root) {
      return;
    }

    root.innerHTML = buildDockHtml(snapshot);
    bindEvents(root, snapshot, actions);
  }

  return {
    register() {
      plugin.addDock({
        type: "siyuan-review-dock",
        config: {
          position: "RightBottom",
          size: { width: 420, height: 0 },
          icon: "iconRefresh",
          title: "文档回顾",
        },
        data: {},
        init(this: Custom | MobileCustom) {
          root = this.element as HTMLElement;
          root.classList.add("siyuan-review-dock");
          render(snapshot);
        },
        update() {
          render(snapshot);
        },
        destroy() {
          root = undefined;
        },
      });
    },
    render,
    dispose() {
      root = undefined;
    },
  };
}

function buildDockHtml(snapshot: DockSnapshot): string {
  const plan = snapshot.plan;
  const completed = plan?.items.filter((item) => item.status === "done" || item.status === "skipped").length ?? 0;
  const total = plan?.items.length ?? 0;
  const pending = plan?.items.filter((item) => item.status === "pending" || item.status === "reviewing").length ?? 0;
  const selectedDoc = snapshot.selectedDocId ? snapshot.docs[snapshot.selectedDocId] : undefined;
  const selectedItem = selectedDoc ? plan?.items.find((item) => item.docId === selectedDoc.docId) : undefined;
  const terminalStatus = isTerminalItemStatus(selectedItem?.status) ? selectedItem.status : undefined;
  const isGeneratingQuestions = selectedDoc
    ? (snapshot.generatingQuestionDocIds ?? []).includes(selectedDoc.docId)
    : false;
  const isSubmittingFeedback = selectedDoc
    ? (snapshot.submittingFeedbackDocIds ?? []).includes(selectedDoc.docId)
    : false;
  const isOpeningCloze = selectedDoc
    ? (snapshot.openingClozeDocIds ?? []).includes(selectedDoc.docId)
    : false;

  if (!plan) {
    return `
<div class="siyuan-review-panel">
  <header class="siyuan-review-header">
    <div>
      <h2>今日回顾</h2>
      <p>打开思源后生成今天的回顾列表。</p>
    </div>
    <span class="siyuan-review-progress">0 / 0</span>
  </header>
  <div class="siyuan-review-empty">还没有生成今日回顾列表。</div>
  <footer class="siyuan-review-actions">
    <button class="b3-button" data-action="refresh">刷新</button>
    <button class="b3-button b3-button--outline" data-action="settings">设置</button>
  </footer>
</div>`;
  }

  if (selectedDoc) {
    return `
<div class="siyuan-review-panel">
  <header class="siyuan-review-header">
    <button class="b3-button b3-button--text" data-action="back">返回</button>
    <span class="siyuan-review-progress">${completed} / ${total}</span>
  </header>
  ${renderReviewDetail(selectedDoc)}
  <div class="siyuan-review-detail-actions">
    <button class="b3-button b3-button--outline" data-action="open-cloze" ${isOpeningCloze ? 'disabled aria-busy="true"' : ""}>${isOpeningCloze ? "打开中..." : "检验"}</button>
  </div>
  <section class="siyuan-review-section">
    <h3>回顾问题</h3>
    ${renderQuestionPanel(selectedDoc.questionCache?.questions ?? getTemplateQuestions())}
    ${terminalStatus ? "" : renderQuestionActions(isGeneratingQuestions)}
  </section>
  ${
    terminalStatus
      ? renderCompletedReviewSummary(terminalStatus, selectedDoc)
      : `<section class="siyuan-review-section">
          <h3>本次反馈</h3>
          <div class="siyuan-review-feedback">${renderFeedbackButtons({ disabled: isSubmittingFeedback })}</div>
        </section>`
  }
</div>`;
  }

  return `
<div class="siyuan-review-panel">
  <header class="siyuan-review-header">
    <div>
      <h2>今日回顾</h2>
      <p>${pending > 0 ? `还有 ${pending} 篇待处理` : "今天的回顾已经完成"}</p>
    </div>
    <span class="siyuan-review-progress">${completed} / ${total}</span>
  </header>
  <div class="siyuan-review-toolbar">
    <button class="b3-button b3-button--outline" data-action="refresh">刷新</button>
    <button class="b3-button b3-button--outline" data-action="regenerate">重新生成</button>
    <button class="b3-button b3-button--outline" data-action="settings">设置</button>
  </div>
  <div class="siyuan-review-list">${renderTodayList(plan, snapshot.docs)}</div>
</div>`;
}

function bindEvents(root: HTMLElement, snapshot: DockSnapshot, actions: DockActions): void {
  root.querySelectorAll<HTMLButtonElement>("[data-doc-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const docId = button.dataset.docId;
      if (docId) {
        void actions.onSelectDoc(docId);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      const feedback = button.dataset.feedback as ReviewFeedback | undefined;
      if (snapshot.selectedDocId && feedback && !button.disabled) {
        button.disabled = true;
        button.textContent = "记录中...";
        void actions.onFeedback(snapshot.selectedDocId, feedback);
      }
    });
  });

  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.addEventListener("click", () => {
    void actions.onRefresh();
  });

  root.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.addEventListener("click", () => {
    void actions.onRegenerate();
  });

  root.querySelector<HTMLButtonElement>('[data-action="regenerate-questions"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (snapshot.selectedDocId && button && !button.disabled) {
      button.disabled = true;
      button.classList.add("siyuan-review-button--loading");
      button.setAttribute("aria-busy", "true");
      button.textContent = "生成中...";
      void actions.onRegenerateQuestions(snapshot.selectedDocId);
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="open-cloze"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (snapshot.selectedDocId && button && !button.disabled) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "打开中...";
      void actions.onOpenCloze(snapshot.selectedDocId);
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="settings"]')?.addEventListener("click", () => {
    actions.onOpenSettings();
  });

  root.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
    actions.onBack();
  });
}

function renderQuestionActions(isGeneratingQuestions: boolean): string {
  return `
    <div class="siyuan-review-question-actions">
      <button class="b3-button b3-button--outline ${isGeneratingQuestions ? "siyuan-review-button--loading" : ""}" data-action="regenerate-questions" ${isGeneratingQuestions ? 'disabled aria-busy="true"' : ""}>${isGeneratingQuestions ? "生成中..." : "重新生成问题"}</button>
      ${isGeneratingQuestions ? '<span class="siyuan-review-loading-note">正在生成问题，请稍候</span>' : ""}
    </div>`;
}

function renderCompletedReviewSummary(status: "done" | "skipped", doc: ReviewDocState): string {
  const statusText = status === "done" ? "已完成" : "已跳过";
  const nextReviewText = doc.nextReviewAt ? `下次回顾 ${doc.nextReviewAt}` : "已记录本次回顾";

  return `
<section class="siyuan-review-section">
  <h3>回顾状态</h3>
  <div class="siyuan-review-status-summary">
    <span>${statusText}</span>
    <p>${nextReviewText}</p>
  </div>
</section>`;
}

function isTerminalItemStatus(status: string | undefined): status is "done" | "skipped" {
  return status === "done" || status === "skipped";
}
