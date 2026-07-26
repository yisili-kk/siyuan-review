export function renderQuestionPanel(questions: string[]): string {
  return `<ol class="siyuan-review-questions">${questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ol>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
