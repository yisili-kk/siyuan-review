export function normalizeReviewTag(tag: string): string {
  return tag.trim().replace(/^#|#$/g, "");
}
