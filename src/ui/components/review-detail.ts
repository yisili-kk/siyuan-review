import type { ReviewEvent, ReviewFeedback, ReviewItem } from "../../types/review";
import { toDateKey } from "../../utils/date";

export function renderReviewDetail(item: ReviewItem, options: { isOpeningCloze?: boolean } = {}): string {
  const source =
    item.itemType === "block"
      ? `<p>${escapeHtml(item.groupName)} · 片段 · 来自 ${escapeHtml(item.sourceTitle)}</p>`
      : `<p>${escapeHtml(item.groupName)} · 文档</p>`;
  return `
<section class="siyuan-review-detail">
  <div class="siyuan-review-detail__main">
    <h3>${escapeHtml(item.title)}</h3>
    ${source}
    <p>已检验 ${item.clozeCheckCount ?? 0} 次</p>
  </div>
  <button class="b3-button b3-button--outline" data-action="open-cloze" ${options.isOpeningCloze ? 'disabled aria-busy="true"' : ""}>${options.isOpeningCloze ? "打开中..." : "检验"}</button>
</section>`;
}

export function renderRecentHistory(history: ReviewEvent[]): string {
  if (history.length === 0) {
    return "";
  }

  return `
<section class="siyuan-review-section siyuan-review-history">
  <h3>最近回顾</h3>
  <div class="siyuan-review-history__list">
    ${history.map(renderHistoryItem).join("")}
  </div>
</section>`;
}

function renderHistoryItem(event: ReviewEvent): string {
  const completedDate = formatDate(event.completedAt);
  const note = event.note?.trim();
  return `
<article class="siyuan-review-history__item">
  <div class="siyuan-review-history__main">
    <strong>${feedbackLabel(event.feedback)}</strong>
    <span>${escapeHtml(completedDate)}</span>
  </div>
  <p>下次回顾 ${escapeHtml(event.nextReviewAt)}</p>
  ${note ? `<blockquote>${escapeHtml(note)}</blockquote>` : ""}
</article>`;
}

function feedbackLabel(feedback: ReviewFeedback): string {
  if (feedback === "needsSupplement") {
    return "内容需补充";
  }

  if (feedback === "needsRefactor") {
    return "结构需重构";
  }

  if (feedback === "skipped") {
    return "暂时跳过";
  }

  if (feedback === "valuable") {
    return "已补充想法";
  }

  return "完成回顾";
}

function formatDate(value: string): string {
  if (!value.includes("T")) {
    return value;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value.slice(0, 10) : toDateKey(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
