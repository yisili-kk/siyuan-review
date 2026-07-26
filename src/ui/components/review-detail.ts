import type { ReviewDocState } from "../../types/review";

export function renderReviewDetail(doc: ReviewDocState): string {
  return `
<section class="siyuan-review-detail">
  <h3>${escapeHtml(doc.title)}</h3>
</section>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
