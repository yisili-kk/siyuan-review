import { Dialog, showMessage } from "siyuan";
import { isDue } from "../utils/date";
import type { DailyPlan, ReviewCandidate, ReviewItem } from "../types/review";
import {
  getActiveTodayItemIds,
  getPoolCategories,
  getPoolStatusKey,
  getReviewCenterStats,
  type ReviewCenterStatusKey,
} from "./review-center-model";

const PAGE_SIZE = 10;

export function openReviewCenterDialog(input: {
  date: string;
  items: ReviewCandidate[];
  todayPlan?: DailyPlan;
  onRefresh(): Promise<{ items: ReviewCandidate[]; todayPlan?: DailyPlan }>;
  onOpenItem(itemId: string): Promise<void>;
  onOpenCloze(itemId: string): Promise<void>;
  onOpenSettings(): void;
}): void {
  const dialog = new Dialog({
    title: "文档回顾中心",
    width: "1080px",
    content: buildReviewCenterHtml(input),
  });
  dialog.element.classList.add("siyuan-review-center-dialog");

  const root = dialog.element.querySelector<HTMLElement>(".siyuan-review-center");
  if (!root) {
    return;
  }

  bindPoolFilters(root);
  bindPoolActions(root, input, dialog);
  bindPagination(root);
  bindDialogActions(root, input, dialog);
}

function buildReviewCenterHtml(input: {
  date: string;
  items: ReviewCandidate[];
  todayPlan?: DailyPlan;
}): string {
  const stats = getReviewCenterStats(input.items, input.todayPlan, input.date);
  const hasRows = input.items.some((item) => item.exists);
  return `
<div class="siyuan-review-center">
  <header class="siyuan-review-center__head">
    <div>
      <strong>回顾池</strong>
      <p data-role="pool-stats">${stats.total} 个回顾项 · 今日 ${stats.today} 个 · 已到期 ${stats.due} 个</p>
    </div>
    <div class="siyuan-review-center__head-actions">
      <button class="b3-button b3-button--outline" type="button" data-action="refresh-pool">刷新</button>
      <button class="b3-button b3-button--outline" type="button" data-action="open-center-settings">设置</button>
    </div>
  </header>

  <div class="siyuan-review-center__body">
    <section class="siyuan-review-center-panel">
      <div class="siyuan-review-pool-toolbar">
        <label class="siyuan-review-pool-search">
          <input class="b3-text-field" type="search" data-action="pool-search" placeholder="搜索标题或来源文档">
        </label>
        <label class="siyuan-review-pool-filter">
          <select class="b3-select" data-action="pool-filter">
            <option value="all">全部</option>
            ${renderGroupFilterOptions(input.items)}
            <option value="document">文档</option>
            <option value="block">片段</option>
            <option value="today">今日待回顾</option>
            <option value="due">已到期</option>
            <option value="neverReviewed">从未回顾</option>
            <option value="needsSupplement">需要补充</option>
            <option value="needsRefactor">需要重构</option>
          </select>
        </label>
      </div>
      <div class="siyuan-review-pool-table">
        <div class="siyuan-review-pool-table__body">
          ${renderPoolTable(input.items, input.todayPlan, input.date)}
          ${hasRows ? '<p class="siyuan-review-empty" data-role="pool-filter-empty" hidden>当前筛选下没有回顾项。</p>' : ""}
        </div>
        <div class="siyuan-review-pool-pagination" data-role="pool-pagination" ${hasRows ? "" : "hidden"}>
          <span data-role="page-info">第 1 / 1 页</span>
          <div>
            <button class="b3-button b3-button--outline" type="button" data-action="prev-page">上一页</button>
            <button class="b3-button b3-button--outline" type="button" data-action="next-page">下一页</button>
          </div>
        </div>
      </div>
    </section>
  </div>

  <footer class="siyuan-review-center__footer">
    <button class="b3-button b3-button--outline" type="button" data-action="close-center">关闭</button>
  </footer>
</div>`;
}

function renderPoolTable(items: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): string {
  const visibleItems = items.filter((item) => item.exists);
  if (visibleItems.length === 0) {
    return '<p class="siyuan-review-empty">回顾池里还没有回顾项。</p>';
  }

  const activeTodayItemIds = getActiveTodayItemIds(todayPlan);
  const rows = visibleItems
    .slice()
    .sort((a, b) => sortPoolItems(a, b, date))
    .map((item) => {
      const categories = getPoolCategories(item, activeTodayItemIds, date);
      const status = renderPoolStatus(getPoolStatusKey(item, activeTodayItemIds, date));
      const typeLabel = item.itemType === "document" ? "文档" : "片段";
      const groupLine = `<small class="siyuan-review-pool-source">${escapeHtml(item.groupName)}</small>`;
      const sourceLine =
        item.itemType === "block"
          ? `<small class="siyuan-review-pool-source">来源文档：${escapeHtml(item.sourceTitle)}</small>`
          : "";
      const searchableText = `${item.title} ${item.sourceTitle}`.toLocaleLowerCase();
      return `
<tr data-categories="${escapeHtml(categories.join(" "))}" data-title="${escapeHtml(searchableText)}" data-pool-row>
  <td data-role="row-index"></td>
  <td>
    ${escapeHtml(typeLabel)}
    ${groupLine}
  </td>
  <td>
    <strong>${escapeHtml(item.title)}</strong>
    ${sourceLine}
  </td>
  <td>${status}</td>
  <td>${item.lastReviewedAt ? escapeHtml(item.lastReviewedAt) : "从未"}</td>
  <td>${item.nextReviewAt ? escapeHtml(item.nextReviewAt) : "-"}</td>
  <td>${item.clozeCheckCount ?? 0}</td>
  <td>
    <div class="siyuan-review-pool-actions">
      <button class="b3-button b3-button--outline" type="button" data-item-id="${escapeHtml(item.itemId)}">打开</button>
      <button class="b3-button b3-button--outline" type="button" data-cloze-item-id="${escapeHtml(item.itemId)}">检验</button>
    </div>
  </td>
</tr>`;
    })
    .join("");

  return `
<table>
  <thead>
    <tr>
      <th>序号</th>
      <th>类型</th>
      <th>内容</th>
      <th>状态</th>
      <th>上次回顾</th>
      <th>下次回顾</th>
      <th>检验</th>
      <th>操作</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`;
}

function renderGroupFilterOptions(items: ReviewCandidate[]): string {
  const groups = new Map<string, string>();
  items
    .filter((item) => item.exists)
    .forEach((item) => {
      if (!groups.has(item.groupId)) {
        groups.set(item.groupId, item.groupName);
      }
    });

  return Array.from(groups.entries())
    .sort((a, b) => a[1].localeCompare(b[1]))
    .map(([groupId, groupName]) => `<option value="group:${escapeHtml(groupId)}">${escapeHtml(groupName)}</option>`)
    .join("");
}

function bindPoolFilters(root: HTMLElement): void {
  root.querySelector<HTMLSelectElement>('[data-action="pool-filter"]')?.addEventListener("change", () => {
    root.dataset.page = "1";
    updatePagination(root);
  });
  root.querySelector<HTMLInputElement>('[data-action="pool-search"]')?.addEventListener("input", () => {
    root.dataset.page = "1";
    updatePagination(root);
  });
}

function bindPoolActions(
  root: HTMLElement,
  input: {
    date: string;
    todayPlan?: DailyPlan;
    onRefresh(): Promise<{ items: ReviewCandidate[]; todayPlan?: DailyPlan }>;
    onOpenItem(itemId: string): Promise<void>;
    onOpenCloze(itemId: string): Promise<void>;
  },
  dialog: Dialog,
): void {
  root.querySelector<HTMLButtonElement>('[data-action="refresh-pool"]')?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement | null;
    if (!button || button.disabled) {
      return;
    }

    button.disabled = true;
    button.textContent = "刷新中...";
    void input
      .onRefresh()
      .then((result) => {
        input.todayPlan = result.todayPlan;
        replacePoolTable(root, result.items, result.todayPlan, input.date);
        updateStats(root, result.items, result.todayPlan, input.date);
        bindPoolRowActions(root, input, dialog);
        updatePagination(root);
        showMessage("回顾池已刷新。", 2000);
      })
      .catch(() => {
        showMessage("刷新回顾池失败。", 3000, "error");
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = "刷新";
      });
  });

  bindPoolRowActions(root, input, dialog);
}

function bindPoolRowActions(
  root: HTMLElement,
  input: {
    onOpenItem(itemId: string): Promise<void>;
    onOpenCloze(itemId: string): Promise<void>;
  },
  dialog: Dialog,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.itemId;
      if (!itemId || button.disabled) {
        return;
      }

      button.disabled = true;
      button.textContent = "打开中...";
      void input
        .onOpenItem(itemId)
        .then(() => {
          dialog.destroy();
        })
        .catch(() => {
          button.disabled = false;
          button.textContent = "打开";
          showMessage("打开回顾项失败。", 3000, "error");
        });
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-cloze-item-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const itemId = button.dataset.clozeItemId;
      if (!itemId || button.disabled) {
        return;
      }

      button.disabled = true;
      button.textContent = "打开中...";
      void input.onOpenCloze(itemId).finally(() => {
        button.disabled = false;
        button.textContent = "检验";
      });
    });
  });
}

function replacePoolTable(root: HTMLElement, items: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): void {
  const tableBody = root.querySelector<HTMLElement>(".siyuan-review-pool-table__body");
  if (!tableBody) {
    return;
  }

  const hasRows = items.some((item) => item.exists);
  tableBody.innerHTML = `
    ${renderPoolTable(items, todayPlan, date)}
    ${hasRows ? '<p class="siyuan-review-empty" data-role="pool-filter-empty" hidden>当前筛选下没有回顾项。</p>' : ""}
  `;
  const pagination = root.querySelector<HTMLElement>('[data-role="pool-pagination"]');
  if (pagination) {
    pagination.hidden = !hasRows;
  }
  root.dataset.page = "1";
}

function updateStats(root: HTMLElement, items: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): void {
  const stats = getReviewCenterStats(items, todayPlan, date);
  const statsNode = root.querySelector<HTMLElement>('[data-role="pool-stats"]');
  if (statsNode) {
    statsNode.textContent = `${stats.total} 个回顾项 · 今日 ${stats.today} 个 · 已到期 ${stats.due} 个`;
  }
}

function bindPagination(root: HTMLElement): void {
  root.dataset.page = "1";
  root.querySelector<HTMLButtonElement>('[data-action="prev-page"]')?.addEventListener("click", () => {
    root.dataset.page = String(Math.max(readCurrentPage(root) - 1, 1));
    updatePagination(root);
  });
  root.querySelector<HTMLButtonElement>('[data-action="next-page"]')?.addEventListener("click", () => {
    root.dataset.page = String(readCurrentPage(root) + 1);
    updatePagination(root);
  });
  updatePagination(root);
}

function bindDialogActions(
  root: HTMLElement,
  input: {
    onOpenSettings(): void;
  },
  dialog: Dialog,
): void {
  root.querySelector<HTMLButtonElement>('[data-action="open-center-settings"]')?.addEventListener("click", () => {
    input.onOpenSettings();
  });

  root.querySelector<HTMLButtonElement>('[data-action="close-center"]')?.addEventListener("click", () => {
    dialog.destroy();
  });
}

function updatePagination(root: HTMLElement): void {
  const filter = root.querySelector<HTMLSelectElement>('[data-action="pool-filter"]')?.value ?? "all";
  const keyword = normalizeSearchKeyword(root.querySelector<HTMLInputElement>('[data-action="pool-search"]')?.value ?? "");
  const matchedRows = Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-pool-row]")).filter((row) => {
    const categories = row.dataset.categories?.split(/\s+/) ?? [];
    const matchesCategory = filter === "all" || categories.includes(filter);
    const matchesKeyword = !keyword || (row.dataset.title ?? "").includes(keyword);
    return matchesCategory && matchesKeyword;
  });
  const totalPages = Math.max(Math.ceil(matchedRows.length / PAGE_SIZE), 1);
  const currentPage = Math.min(readCurrentPage(root), totalPages);
  root.dataset.page = String(currentPage);

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  root.querySelectorAll<HTMLTableRowElement>("[data-pool-row]").forEach((row) => {
    row.hidden = true;
  });
  matchedRows.forEach((row, index) => {
    row.hidden = index < start || index >= end;
    const rowIndex = row.querySelector<HTMLElement>('[data-role="row-index"]');
    if (rowIndex) {
      rowIndex.textContent = String(index + 1);
    }
  });

  const pagination = root.querySelector<HTMLElement>('[data-role="pool-pagination"]');
  if (pagination) {
    pagination.hidden = matchedRows.length === 0;
  }
  const empty = root.querySelector<HTMLElement>('[data-role="pool-filter-empty"]');
  if (empty) {
    empty.hidden = matchedRows.length > 0;
  }
  const pageInfo = root.querySelector<HTMLElement>('[data-role="page-info"]');
  if (pageInfo) {
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页，共 ${matchedRows.length} 个`;
  }
  const prevButton = root.querySelector<HTMLButtonElement>('[data-action="prev-page"]');
  const nextButton = root.querySelector<HTMLButtonElement>('[data-action="next-page"]');
  if (prevButton) {
    prevButton.disabled = currentPage <= 1;
  }
  if (nextButton) {
    nextButton.disabled = currentPage >= totalPages;
  }
}

function normalizeSearchKeyword(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function readCurrentPage(root: HTMLElement): number {
  const page = Number(root.dataset.page);
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
}

function sortPoolItems(a: ReviewItem, b: ReviewItem, date: string): number {
  const aDue = isDue(a.nextReviewAt, date) ? 0 : 1;
  const bDue = isDue(b.nextReviewAt, date) ? 0 : 1;
  if (aDue !== bDue) {
    return aDue - bDue;
  }

  const aNext = a.nextReviewAt ?? "0000-00-00";
  const bNext = b.nextReviewAt ?? "0000-00-00";
  if (aNext !== bNext) {
    return aNext.localeCompare(bNext);
  }

  return a.title.localeCompare(b.title);
}

function renderPoolStatus(status: ReviewCenterStatusKey): string {
  if (status === "today") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--primary">今日待回顾</span>';
  }
  if (status === "needsSupplement") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--warning">需要补充</span>';
  }
  if (status === "needsRefactor") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--warning">需要重构</span>';
  }
  if (status === "due") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--primary">已到期</span>';
  }
  if (status === "neverReviewed") {
    return '<span class="siyuan-review-pool-status">从未回顾</span>';
  }
  return '<span class="siyuan-review-pool-status siyuan-review-pool-status--muted">未到期</span>';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
