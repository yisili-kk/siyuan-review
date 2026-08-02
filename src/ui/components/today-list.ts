import type { DailyPlan, ReviewItem } from "../../types/review";

export function renderTodayList(plan: DailyPlan, items: Record<string, ReviewItem>): string {
  return plan.items
    .map((planItem) => {
      const item = items[planItem.itemId];
      const title = item?.title ?? "回顾项不可用";
      const statusClass = `siyuan-review-item--${planItem.status}`;
      const status = statusLabel(planItem.status);
      const meta = metaLabel(planItem.status, planItem.reason, item);
      const source = item && item.itemType === "block" ? `来自：${item.sourceTitle}` : "";
      const disabled = planItem.status === "missing";

      return `
<button class="siyuan-review-item ${statusClass}" ${disabled ? "" : `data-item-id="${escapeHtml(planItem.itemId)}"`} ${disabled ? "disabled" : ""}>
  <span class="siyuan-review-item__top">
    <span class="siyuan-review-item__title">${escapeHtml(title)}</span>
    <span class="siyuan-review-item__badge">${escapeHtml(status)}</span>
  </span>
  ${source ? `<span class="siyuan-review-item__source">${escapeHtml(source)}</span>` : ""}
  <span class="siyuan-review-item__reason">${escapeHtml(meta)}</span>
</button>`;
    })
    .join("");
}

function metaLabel(status: string, reason: string, item: ReviewItem | undefined): string {
  if (status === "done" || status === "skipped") {
    return item?.nextReviewAt ? `下次回顾 ${item.nextReviewAt}` : "已记录本次回顾";
  }

  if (status === "missing") {
    return "不在当前回顾池";
  }

  return reasonLabel(reason);
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
