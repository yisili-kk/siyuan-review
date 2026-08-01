import type { Custom, MobileCustom, Plugin } from "siyuan";
import type { DailyPlan, ReviewDocState, ReviewFeedback } from "../types/review";
import { getTemplateQuestions } from "../core/question-service";
import { renderFeedbackButtons } from "./components/feedback-buttons";
import { renderQuestionPanel } from "./components/question-panel";
import { renderReviewDetail } from "./components/review-detail";
import { renderTodayList } from "./components/today-list";
import { REVIEW_DUE_ICON_SVG } from "./icons";

const DOCK_TYPE = "siyuan-review-dock";
const DOCK_ICON = "#iconSiyuanReviewDue";
const DOCK_BUTTON_CLASS = "siyuan-review-dock-button";
const LEGACY_DOCK_ICONS = new Set(["#iconRefresh"]);
let dockButtonPendingCount = 0;
let dockButtonUpdateId = 0;
let dockButtonObserver: MutationObserver | undefined;
let dockRegistered = false;
let dockRoot: HTMLElement | undefined;

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
        },
        update() {
          render(snapshot);
        },
        destroy() {
          dockRoot = undefined;
          root = undefined;
        },
      });
      updateDockButtonPendingState(getPendingReviewCount(snapshot));
    },
    render,
    dispose() {
      dockRegistered = false;
      dockRoot = undefined;
      updateDockButtonPendingState(0);
      disconnectDockButtonObserver();
      root = undefined;
    },
  };
}

function buildDockHtml(snapshot: DockSnapshot): string {
  const plan = snapshot.plan;
  const completed = plan?.items.filter((item) => item.status === "done" || item.status === "skipped").length ?? 0;
  const total = plan?.items.length ?? 0;
  const pending = getPendingReviewCount(snapshot);
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

function getPendingReviewCount(snapshot: DockSnapshot): number {
  return snapshot.plan?.items.filter((item) => item.status === "pending" || item.status === "reviewing").length ?? 0;
}

function updateDockButtonPendingState(pendingCount: number): void {
  dockButtonPendingCount = pendingCount;
  const updateId = ++dockButtonUpdateId;
  ensureDockButtonObserver();
  [0, 100, 500, 1200].forEach((delay) => {
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
    const pendingColor = isDockButtonActive(button) ? "var(--b3-theme-background, #fff)" : "var(--b3-theme-error, #d23f31)";
    if (hasPending) {
      button.dataset.reviewCount = String(pendingCount);
      button.style.setProperty("color", pendingColor, "important");
    } else {
      delete button.dataset.reviewCount;
      button.style.removeProperty("color");
    }
    button.querySelectorAll<SVGElement>("svg, use").forEach((icon) => {
      if (hasPending) {
        icon.style.setProperty("color", pendingColor, "important");
        icon.style.setProperty("fill", "currentColor", "important");
        icon.style.setProperty("stroke", "currentColor", "important");
      } else {
        icon.style.removeProperty("color");
        icon.style.removeProperty("fill");
        icon.style.removeProperty("stroke");
      }
    });
  });
}

function isDockButtonActive(button: HTMLElement): boolean {
  return button.classList.contains("dock__item--active") || button.classList.contains("dock__item--activefocus");
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

function ensureDockButtonObserver(): void {
  if (dockButtonObserver) {
    return;
  }

  dockButtonObserver = new MutationObserver(() => {
    applyDockButtonPendingState(dockButtonPendingCount);
  });
  dockButtonObserver.observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
    childList: true,
    subtree: true,
  });
}

function disconnectDockButtonObserver(): void {
  dockButtonObserver?.disconnect();
  dockButtonObserver = undefined;
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
