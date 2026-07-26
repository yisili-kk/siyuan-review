export function createReviewEventId(docId: string, completedAt: string): string {
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${docId}-${Date.parse(completedAt)}-${suffix}`;
}
