import type { DailyPlan, ReviewDocState } from "../../types/review";

export function renderTodayList(plan: DailyPlan, docs: Record<string, ReviewDocState>): string {
  return plan.items
    .map((item) => {
      const doc = docs[item.docId];
      const title = doc?.title ?? "文档不可用";
      const statusClass = `siyuan-review-item--${item.status}`;
      const status = statusLabel(item.status);
      const disabled = item.status === "done" || item.status === "skipped" || item.status === "missing";

      return `
<button class="siyuan-review-item ${statusClass}" ${disabled ? "" : `data-doc-id="${escapeHtml(item.docId)}"`} ${disabled ? "disabled" : ""}>
  <span class="siyuan-review-item__top">
    <span class="siyuan-review-item__title">${escapeHtml(title)}</span>
    <span class="siyuan-review-item__badge">${escapeHtml(status)}</span>
  </span>
  <span class="siyuan-review-item__reason">${reasonLabel(item.reason)}</span>
</button>`;
    })
    .join("");
}

function reasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    due: "已到期",
    neverReviewed: "从未回顾",
    oldestReviewed: "最久未回顾",
    priority: "维护优先",
  };
  return labels[reason] ?? reason;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "待回顾",
    reviewing: "回顾中",
    done: "已完成",
    skipped: "已跳过",
    missing: "不可用",
  };
  return labels[status] ?? status;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
