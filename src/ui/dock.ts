import { showMessage, type Custom, type MobileCustom, type Plugin } from "siyuan";
import type { DailyPlan, ReviewEvent, ReviewFeedback, ReviewItem } from "../types/review";
import { getTemplateQuestions } from "../core/question-service";
import { renderFeedbackButtons } from "./components/feedback-buttons";
import { renderQuestionPanel } from "./components/question-panel";
import { renderRecentHistory, renderReviewDetail } from "./components/review-detail";
import { renderTodayList } from "./components/today-list";
import { REVIEW_DUE_ICON_SVG } from "./icons";

const DOCK_TYPE = "siyuan-review-dock";
const DOCK_ICON = "#iconSiyuanReviewDue";
const DOCK_BUTTON_CLASS = "siyuan-review-dock-button";
const LEGACY_DOCK_ICONS = new Set(["#iconRefresh"]);
const DOCK_OPEN_REFRESH_COOLDOWN_MS = 5000;
let dockButtonPendingCount = 0;
let dockButtonUpdateId = 0;
let dockRegistered = false;
let dockRoot: HTMLElement | undefined;

type ProcessingFeedbackReason = Extract<ReviewFeedback, "needsSupplement" | "needsRefactor">;

export type ProcessingFeedbackDraft = {
  reason?: ProcessingFeedbackReason;
  note?: string;
};

export type DockSnapshot = {
  plan?: DailyPlan;
  items: Record<string, ReviewItem>;
  history?: ReviewEvent[];
  processingFeedbackDrafts?: Record<string, ProcessingFeedbackDraft>;
  selectedItemId?: string;
  generatingQuestionItemIds?: string[];
  submittingFeedbackItemIds?: string[];
  openingClozeItemIds?: string[];
};

export type DockActions = {
  onOpen?(): Promise<void>;
  onRefresh(): Promise<void>;
  onRegenerate(): Promise<void>;
  onRegenerateQuestions(itemId: string): Promise<void>;
  onOpenCloze(itemId: string): Promise<void>;
  onSelectItem(itemId: string): Promise<void>;
  onFeedback(itemId: string, feedback: ReviewFeedback, note?: string): Promise<boolean>;
  onOpenProcessingFeedback(itemId: string): void;
  onCancelProcessingFeedback(itemId: string): void;
  onUpdateProcessingFeedbackDraft(itemId: string, draft: ProcessingFeedbackDraft): void;
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
  let snapshot: DockSnapshot = { items: {} };
  let lastOpenRefreshAt = 0;
  let openRefreshInFlight = false;

  function triggerOpenRefresh(): void {
    if (!actions.onOpen || openRefreshInFlight) {
      return;
    }

    const now = Date.now();
    if (now - lastOpenRefreshAt < DOCK_OPEN_REFRESH_COOLDOWN_MS) {
      return;
    }

    lastOpenRefreshAt = now;
    openRefreshInFlight = true;
    void actions.onOpen().finally(() => {
      openRefreshInFlight = false;
    });
  }

  function handleDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const button = target.closest<HTMLElement>(".dock__item");
    if (button && isReviewDockButton(button)) {
      triggerOpenRefresh();
    }
  }

  function render(nextSnapshot: DockSnapshot = snapshot): void {
    snapshot = nextSnapshot;
    updateDockButtonPendingState(getPendingReviewCount(snapshot));
    if (!root) {
      return;
    }

    root.innerHTML = buildDockHtml(snapshot);
    bindEvents(root, snapshot, actions);
  }

  return {
    register() {
      dockRegistered = true;
      plugin.addDock({
        type: DOCK_TYPE,
        config: {
          position: "RightBottom",
          size: { width: 420, height: 0 },
          icon: REVIEW_DUE_ICON_SVG,
          title: "文档回顾",
        },
        data: {},
        init(this: Custom | MobileCustom) {
          root = this.element as HTMLElement;
          dockRoot = root;
          root.classList.add("siyuan-review-dock");
          render(snapshot);
          triggerOpenRefresh();
        },
        update() {
          render(snapshot);
          triggerOpenRefresh();
        },
        destroy() {
          dockRoot = undefined;
          root = undefined;
        },
      });
      document.addEventListener("click", handleDocumentClick, true);
      updateDockButtonPendingState(getPendingReviewCount(snapshot));
    },
    render,
    dispose() {
      dockRegistered = false;
      dockRoot = undefined;
      document.removeEventListener("click", handleDocumentClick, true);
      updateDockButtonPendingState(0);
      root = undefined;
    },
  };
}

function buildDockHtml(snapshot: DockSnapshot): string {
  const plan = snapshot.plan;
  const completed = plan?.items.filter((item) => item.status === "done" || item.status === "skipped").length ?? 0;
  const total = plan?.items.length ?? 0;
  const pending = getPendingReviewCount(snapshot);
  const selectedReviewItem = snapshot.selectedItemId ? snapshot.items[snapshot.selectedItemId] : undefined;
  const selectedPlanItem = selectedReviewItem
    ? plan?.items.find((item) => item.itemId === selectedReviewItem.itemId)
    : undefined;
  const terminalStatus = isTerminalItemStatus(selectedPlanItem?.status) ? selectedPlanItem.status : undefined;
  const isGeneratingQuestions = selectedReviewItem
    ? (snapshot.generatingQuestionItemIds ?? []).includes(selectedReviewItem.itemId)
    : false;
  const isSubmittingFeedback = selectedReviewItem
    ? (snapshot.submittingFeedbackItemIds ?? []).includes(selectedReviewItem.itemId)
    : false;
  const isOpeningCloze = selectedReviewItem
    ? (snapshot.openingClozeItemIds ?? []).includes(selectedReviewItem.itemId)
    : false;
  const recentHistory = selectedReviewItem ? getRecentHistory(snapshot, selectedReviewItem.itemId) : [];
  const processingDraft = selectedReviewItem ? snapshot.processingFeedbackDrafts?.[selectedReviewItem.itemId] : undefined;

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

  if (selectedReviewItem) {
    return `
<div class="siyuan-review-panel">
  <header class="siyuan-review-header">
    <button class="b3-button b3-button--text" data-action="back">返回</button>
    <span class="siyuan-review-progress">${completed} / ${total}</span>
  </header>
  ${renderReviewDetail(selectedReviewItem, { isOpeningCloze })}
  <section class="siyuan-review-section">
    <div class="siyuan-review-section__head">
      <h3>回顾问题</h3>
      ${renderQuestionActions(isGeneratingQuestions)}
    </div>
    ${renderQuestionPanel(getQuestionsForDisplay(selectedReviewItem))}
  </section>
  ${
    terminalStatus
      ? `${renderCompletedReviewSummary(terminalStatus, selectedReviewItem)}${renderRecentHistory(recentHistory)}`
      : `<section class="siyuan-review-section">
          <h3>本次反馈</h3>
          <div class="siyuan-review-feedback">
            ${renderFeedbackButtons({ disabled: isSubmittingFeedback, processingOpen: Boolean(processingDraft) })}
            ${processingDraft ? renderProcessingFeedbackForm(processingDraft, isSubmittingFeedback) : ""}
          </div>
        </section>${renderRecentHistory(recentHistory)}`
  }
</div>`;
  }

  return `
<div class="siyuan-review-panel">
  <header class="siyuan-review-header">
    <div>
      <h2>今日回顾</h2>
      <p>${pending > 0 ? `还有 ${pending} 个待处理` : "今天的回顾已经完成"}</p>
    </div>
    <span class="siyuan-review-progress">${completed} / ${total}</span>
  </header>
  <div class="siyuan-review-toolbar">
    <button class="b3-button b3-button--outline" data-action="refresh">刷新</button>
    <button class="b3-button b3-button--outline" data-action="regenerate">重新生成</button>
    <button class="b3-button b3-button--outline" data-action="settings">设置</button>
  </div>
  <div class="siyuan-review-list">${renderTodayList(plan, snapshot.items)}</div>
</div>`;
}

function getPendingReviewCount(snapshot: DockSnapshot): number {
  return snapshot.plan?.items.filter((item) => item.status === "pending" || item.status === "reviewing").length ?? 0;
}

function getRecentHistory(snapshot: DockSnapshot, itemId: string): ReviewEvent[] {
  return (snapshot.history ?? [])
    .filter((event) => event.itemId === itemId)
    .slice()
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 3);
}

function renderProcessingFeedbackForm(draft: ProcessingFeedbackDraft, isSubmitting: boolean): string {
  const disabledAttr = isSubmitting ? "disabled" : "";
  return `
<div class="siyuan-review-processing-feedback">
  <div class="siyuan-review-processing-feedback__section">
    <strong>处理原因</strong>
    <div class="siyuan-review-processing-feedback__reasons">
      ${renderProcessingReasonButton("needsSupplement", "内容需补充", draft.reason, disabledAttr)}
      ${renderProcessingReasonButton("needsRefactor", "结构需重构", draft.reason, disabledAttr)}
    </div>
  </div>
  <label class="siyuan-review-processing-feedback__section">
    <span>
      <strong>备注</strong>
      <em>写下后续要处理什么，便于下次回顾接上。</em>
    </span>
    <textarea class="b3-text-field" data-processing-note rows="4" placeholder="例如：补充案例、拆成两篇、补上来源。"${isSubmitting ? " disabled" : ""}>${escapeHtml(draft.note ?? "")}</textarea>
  </label>
  <div class="siyuan-review-processing-feedback__actions">
    <button class="b3-button b3-button--outline" type="button" data-action="cancel-processing-feedback" ${disabledAttr}>取消</button>
    <button class="b3-button" type="button" data-action="submit-processing-feedback" ${disabledAttr}>${isSubmitting ? "记录中..." : "记录"}</button>
  </div>
</div>`;
}

function renderProcessingReasonButton(
  reason: ProcessingFeedbackReason,
  label: string,
  selectedReason: ProcessingFeedbackDraft["reason"],
  disabledAttr: string,
): string {
  const selectedClass = reason === selectedReason ? " siyuan-review-processing-feedback__reason--selected" : "";
  return `<button class="b3-button b3-button--outline siyuan-review-processing-feedback__reason${selectedClass}" type="button" data-processing-reason="${reason}" ${disabledAttr}>${label}</button>`;
}

function readProcessingFeedbackDraft(root: HTMLElement, snapshot: DockSnapshot, itemId: string): ProcessingFeedbackDraft {
  const currentDraft = snapshot.processingFeedbackDrafts?.[itemId] ?? {};
  const selectedReason = root.querySelector<HTMLButtonElement>(".siyuan-review-processing-feedback__reason--selected")
    ?.dataset.processingReason as ProcessingFeedbackReason | undefined;
  const note = root.querySelector<HTMLTextAreaElement>("[data-processing-note]")?.value;

  return {
    ...currentDraft,
    reason: selectedReason ?? currentDraft.reason,
    note: note ?? currentDraft.note,
  };
}

function updateDockButtonPendingState(pendingCount: number): void {
  dockButtonPendingCount = pendingCount;
  const updateId = ++dockButtonUpdateId;
  [0, 16, 50, 150, 500, 1200].forEach((delay) => {
    window.setTimeout(() => {
      if (updateId === dockButtonUpdateId) {
        applyDockButtonPendingState(dockButtonPendingCount);
      }
    }, delay);
  });
  window.requestAnimationFrame(() => {
    if (updateId === dockButtonUpdateId) {
      applyDockButtonPendingState(dockButtonPendingCount);
    }
  });
}

function applyDockButtonPendingState(pendingCount: number): void {
  const hasPending = pendingCount > 0;
  findDockButtons().forEach((button) => {
    normalizeDockButtonIcon(button);
    button.classList.add(DOCK_BUTTON_CLASS);
    button.classList.toggle("siyuan-review-dock-button--pending", hasPending);
    if (hasPending) {
      button.dataset.reviewCount = String(pendingCount);
    } else {
      delete button.dataset.reviewCount;
    }
    button.querySelectorAll<SVGElement>("svg, use").forEach((icon) => {
      icon.style.removeProperty("color");
      icon.style.removeProperty("fill");
      icon.style.removeProperty("stroke");
    });
    button.style.removeProperty("color");
  });
}

function findDockButtons(): HTMLElement[] {
  const selectors = [
    `.dock__item[data-type="${DOCK_TYPE}"]`,
    `.${DOCK_BUTTON_CLASS}`,
    `[data-type="${DOCK_TYPE}"]`,
    `[data-id="${DOCK_TYPE}"]`,
    `[data-tab-type="${DOCK_TYPE}"]`,
    `[title="文档回顾"]`,
    `[aria-label="文档回顾"]`,
  ];

  const buttons = Array.from(document.querySelectorAll<HTMLElement>(selectors.join(","))).filter(
    (element) => !element.classList.contains("siyuan-review-dock"),
  );
  document.querySelectorAll<HTMLElement>(".dock__item").forEach((button) => {
    if (hasDockIcon(button) || (isReviewDockButton(button) && hasLegacyDockIcon(button))) {
      buttons.push(button);
    }
  });
  const fallbackButton = findLegacyDockButtonFallback(buttons);
  if (fallbackButton) {
    buttons.push(fallbackButton);
  }
  return Array.from(new Set(buttons));
}

function hasDockIcon(button: HTMLElement): boolean {
  return Array.from(button.querySelectorAll<SVGUseElement>("use")).some((icon) => {
    return getIconHref(icon) === DOCK_ICON;
  });
}

function hasLegacyDockIcon(button: HTMLElement): boolean {
  return Array.from(button.querySelectorAll<SVGUseElement>("use")).some((icon) => {
    return LEGACY_DOCK_ICONS.has(getIconHref(icon));
  });
}

function normalizeDockButtonIcon(button: HTMLElement): void {
  button.querySelectorAll<SVGUseElement>("use").forEach((icon) => {
    if (!LEGACY_DOCK_ICONS.has(getIconHref(icon))) {
      return;
    }
    icon.setAttribute("href", DOCK_ICON);
    icon.setAttribute("xlink:href", DOCK_ICON);
    icon.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", DOCK_ICON);
  });
}

function findLegacyDockButtonFallback(existingButtons: HTMLElement[]): HTMLElement | undefined {
  if (!dockRegistered || existingButtons.length > 0) {
    return undefined;
  }

  const legacyButtons = Array.from(document.querySelectorAll<HTMLElement>(".dock__item")).filter(hasLegacyDockIcon);
  return legacyButtons.length === 1 ? legacyButtons[0] : undefined;
}

function isReviewDockButton(button: HTMLElement): boolean {
  return (
    button.dataset.type === DOCK_TYPE ||
    button.dataset.id === DOCK_TYPE ||
    button.dataset.tabType === DOCK_TYPE ||
    button.getAttribute("title") === "文档回顾" ||
    button.getAttribute("aria-label") === "文档回顾"
  );
}

function getIconHref(icon: SVGUseElement): string {
  return icon.getAttribute("href") ?? icon.getAttribute("xlink:href") ?? "";
}

function bindEvents(root: HTMLElement, snapshot: DockSnapshot, actions: DockActions): void {
  root.querySelectorAll<HTMLButtonElement>("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.itemId;
      if (itemId) {
        void actions.onSelectItem(itemId);
      }
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      const feedback = button.dataset.feedback as ReviewFeedback | undefined;
      if (snapshot.selectedItemId && feedback && !button.disabled) {
        button.disabled = true;
        button.textContent = "记录中...";
        void actions.onFeedback(snapshot.selectedItemId, feedback);
      }
    });
  });

  root.querySelector<HTMLButtonElement>('[data-action="needs-processing-feedback"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (!snapshot.selectedItemId || !button || button.disabled) {
      return;
    }

    actions.onOpenProcessingFeedback(snapshot.selectedItemId);
  });

  root.querySelectorAll<HTMLButtonElement>("[data-processing-reason]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!snapshot.selectedItemId || button.disabled) {
        return;
      }

      const reason = button.dataset.processingReason as ProcessingFeedbackReason | undefined;
      if (!reason) {
        return;
      }

      root.querySelectorAll<HTMLButtonElement>("[data-processing-reason]").forEach((reasonButton) => {
        reasonButton.classList.toggle("siyuan-review-processing-feedback__reason--selected", reasonButton === button);
      });
      actions.onUpdateProcessingFeedbackDraft(snapshot.selectedItemId, {
        ...readProcessingFeedbackDraft(root, snapshot, snapshot.selectedItemId),
        reason,
      });
    });
  });

  root.querySelector<HTMLTextAreaElement>("[data-processing-note]")?.addEventListener("input", (event) => {
    if (!snapshot.selectedItemId) {
      return;
    }

    const textarea = event.currentTarget as HTMLTextAreaElement | null;
    actions.onUpdateProcessingFeedbackDraft(snapshot.selectedItemId, {
      ...readProcessingFeedbackDraft(root, snapshot, snapshot.selectedItemId),
      note: textarea?.value ?? "",
    });
  });

  root.querySelector<HTMLButtonElement>('[data-action="cancel-processing-feedback"]')?.addEventListener("click", () => {
    if (snapshot.selectedItemId) {
      actions.onCancelProcessingFeedback(snapshot.selectedItemId);
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="submit-processing-feedback"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (!snapshot.selectedItemId || !button || button.disabled) {
      return;
    }

    const draft = readProcessingFeedbackDraft(root, snapshot, snapshot.selectedItemId);
    if (!draft.reason) {
      showMessage("请选择处理原因。", 2000, "error");
      return;
    }

    button.disabled = true;
    button.textContent = "记录中...";
    actions.onUpdateProcessingFeedbackDraft(snapshot.selectedItemId, draft);
    void actions.onFeedback(snapshot.selectedItemId, draft.reason, draft.note);
  });

  root.querySelector<HTMLButtonElement>('[data-action="refresh"]')?.addEventListener("click", () => {
    void actions.onRefresh();
  });

  root.querySelector<HTMLButtonElement>('[data-action="regenerate"]')?.addEventListener("click", () => {
    void actions.onRegenerate();
  });

  root.querySelector<HTMLButtonElement>('[data-action="regenerate-questions"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (snapshot.selectedItemId && button && !button.disabled) {
      button.disabled = true;
      button.classList.add("siyuan-review-button--loading");
      button.setAttribute("aria-busy", "true");
      button.textContent = "生成中...";
      void actions.onRegenerateQuestions(snapshot.selectedItemId);
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="open-cloze"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (snapshot.selectedItemId && button && !button.disabled) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "打开中...";
      void actions.onOpenCloze(snapshot.selectedItemId);
    }
  });

  root.querySelector<HTMLButtonElement>('[data-action="settings"]')?.addEventListener("click", () => {
    actions.onOpenSettings();
  });

  root.querySelector<HTMLButtonElement>('[data-action="back"]')?.addEventListener("click", () => {
    actions.onBack();
  });
}

function getQuestionsForDisplay(item: ReviewItem): string[] {
  if (item.questionCache?.source === "ai" && item.questionCache.questions.length > 0) {
    return item.questionCache.questions;
  }

  return getTemplateQuestions(item.itemType, item);
}

function renderQuestionActions(isGeneratingQuestions: boolean): string {
  return `
    <div class="siyuan-review-question-actions">
      <button class="b3-button b3-button--outline ${isGeneratingQuestions ? "siyuan-review-button--loading" : ""}" data-action="regenerate-questions" ${isGeneratingQuestions ? 'disabled aria-busy="true"' : ""}>${isGeneratingQuestions ? "生成中..." : "AI生成问题"}</button>
      ${isGeneratingQuestions ? '<span class="siyuan-review-loading-note">正在生成问题，请稍候</span>' : ""}
    </div>`;
}

function renderCompletedReviewSummary(status: "done" | "skipped", item: ReviewItem): string {
  const statusText = status === "done" ? "已完成" : "已跳过";
  const nextReviewText = item.nextReviewAt ? `下次回顾 ${item.nextReviewAt}` : "已记录本次回顾";

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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
