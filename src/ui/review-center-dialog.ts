import { Dialog, showMessage } from "siyuan";
import { isDue } from "../utils/date";
import type { DailyPlan, ReviewCandidate, ReviewDocState } from "../types/review";

const PAGE_SIZE = 10;

export function openReviewCenterDialog(input: {
  date: string;
  docs: ReviewCandidate[];
  todayPlan?: DailyPlan;
  onOpenDoc(docId: string): Promise<void>;
  onOpenCloze(docId: string): Promise<void>;
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
  docs: ReviewCandidate[];
  todayPlan?: DailyPlan;
}): string {
  const stats = getPoolStats(input.docs, input.todayPlan, input.date);
  return `
<div class="siyuan-review-center">
  <header class="siyuan-review-center__head">
    <div>
      <strong>回顾池</strong>
      <p>${stats.total} 篇文档 · 今日 ${stats.today} 篇 · 已到期 ${stats.due} 篇</p>
    </div>
    <button class="b3-button b3-button--outline" type="button" data-action="open-center-settings">设置</button>
  </header>

  <div class="siyuan-review-center__body">
    <section class="siyuan-review-center-panel">
      <div class="siyuan-review-pool-toolbar">
        <label class="siyuan-review-pool-search">
          <input class="b3-text-field" type="search" data-action="pool-search" placeholder="搜索文档标题">
        </label>
        <label>
          <select class="b3-select" data-action="pool-filter">
            <option value="all">全部</option>
            <option value="today">今日待回顾</option>
            <option value="due">已到期</option>
            <option value="neverReviewed">从未回顾</option>
            <option value="needsSupplement">需要补充</option>
            <option value="needsRefactor">需要重构</option>
            <option value="missing">暂不在池中</option>
          </select>
        </label>
      </div>
      <div class="siyuan-review-pool-table">
        <div class="siyuan-review-pool-table__body">
          ${renderPoolTable(input.docs, input.todayPlan, input.date)}
          <p class="siyuan-review-empty" data-role="pool-filter-empty" hidden>当前筛选下没有文档。</p>
        </div>
        <div class="siyuan-review-pool-pagination" data-role="pool-pagination" ${input.docs.length === 0 ? "hidden" : ""}>
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

function renderPoolTable(docs: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): string {
  if (docs.length === 0) {
    return '<p class="siyuan-review-empty">回顾池里还没有文档。</p>';
  }

  const todayDocIds = new Set(todayPlan?.items.map((item) => item.docId) ?? []);
  const rows = docs
    .slice()
    .sort((a, b) => sortPoolDocs(a, b, date))
    .map((doc) => {
      const categories = getPoolCategories(doc, todayDocIds, date);
      const status = getPoolStatus(doc, todayDocIds, date);
      return `
<tr data-categories="${categories.join(" ")}" data-title="${escapeHtml(doc.title.toLocaleLowerCase())}" data-doc-row>
  <td data-role="row-index"></td>
  <td>
    <strong>${escapeHtml(doc.title)}</strong>
  </td>
  <td>${status}</td>
  <td>${doc.lastReviewedAt ? escapeHtml(doc.lastReviewedAt) : "从未"}</td>
  <td>${doc.nextReviewAt ? escapeHtml(doc.nextReviewAt) : "-"}</td>
  <td>${doc.clozeCheckCount ?? 0}</td>
  <td>
    <div class="siyuan-review-pool-actions">
      <button class="b3-button b3-button--outline" type="button" data-doc-id="${escapeHtml(doc.docId)}">打开</button>
      <button class="b3-button b3-button--outline" type="button" data-cloze-doc-id="${escapeHtml(doc.docId)}">检验</button>
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
      <th>文档</th>
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
    onOpenDoc(docId: string): Promise<void>;
    onOpenCloze(docId: string): Promise<void>;
  },
  dialog: Dialog,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-doc-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const docId = button.dataset.docId;
      if (!docId || button.disabled) {
        return;
      }

      button.disabled = true;
      button.textContent = "打开中...";
      void input
        .onOpenDoc(docId)
        .then(() => {
          dialog.destroy();
        })
        .catch(() => {
          button.disabled = false;
          button.textContent = "打开";
          showMessage("打开文档失败。", 3000, "error");
        });
    });
  });

  root.querySelectorAll<HTMLButtonElement>("[data-cloze-doc-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const docId = button.dataset.clozeDocId;
      if (!docId || button.disabled) {
        return;
      }

      button.disabled = true;
      button.textContent = "打开中...";
      void input.onOpenCloze(docId).finally(() => {
        button.disabled = false;
        button.textContent = "检验";
      });
    });
  });
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
  const matchedRows = Array.from(root.querySelectorAll<HTMLTableRowElement>("[data-doc-row]")).filter((row) => {
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
  root.querySelectorAll<HTMLTableRowElement>("[data-doc-row]").forEach((row) => {
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
    pageInfo.textContent = `第 ${currentPage} / ${totalPages} 页，共 ${matchedRows.length} 篇`;
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

function getPoolStats(docs: ReviewCandidate[], todayPlan: DailyPlan | undefined, date: string): {
  total: number;
  today: number;
  due: number;
} {
  const todayDocIds = new Set(todayPlan?.items.map((item) => item.docId) ?? []);
  return {
    total: docs.length,
    today: todayDocIds.size,
    due: docs.filter((doc) => doc.exists && isDue(doc.nextReviewAt, date)).length,
  };
}

function sortPoolDocs(a: ReviewDocState, b: ReviewDocState, date: string): number {
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

function getPoolCategories(doc: ReviewCandidate, todayDocIds: Set<string>, date: string): string[] {
  const categories = ["all"];
  if (!doc.exists) {
    return [...categories, "missing"];
  }
  if (todayDocIds.has(doc.docId)) {
    categories.push("today");
  }
  if (isDue(doc.nextReviewAt, date)) {
    categories.push("due");
  }
  if (!doc.lastReviewedAt) {
    categories.push("neverReviewed");
  }
  if (doc.status === "needsSupplement") {
    categories.push("needsSupplement");
  }
  if (doc.status === "needsRefactor") {
    categories.push("needsRefactor");
  }
  return categories;
}

function getPoolStatus(doc: ReviewCandidate, todayDocIds: Set<string>, date: string): string {
  if (!doc.exists) {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--muted">暂不在池中</span>';
  }
  if (todayDocIds.has(doc.docId)) {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--primary">今日待回顾</span>';
  }
  if (doc.status === "needsSupplement") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--warning">需要补充</span>';
  }
  if (doc.status === "needsRefactor") {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--warning">需要重构</span>';
  }
  if (isDue(doc.nextReviewAt, date)) {
    return '<span class="siyuan-review-pool-status siyuan-review-pool-status--primary">已到期</span>';
  }
  if (!doc.lastReviewedAt) {
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
