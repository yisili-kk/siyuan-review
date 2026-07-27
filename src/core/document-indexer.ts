import type { ReviewCandidate, ReviewDocState } from "../types/review";
import type { ReviewSettings } from "../types/settings";
import type { SiyuanDocumentInfo } from "../types/siyuan";
import { queryDocumentsByTag } from "../siyuan/document";
import { normalizeReviewTag } from "../siyuan/tag";

export async function scanReviewCandidates(settings: ReviewSettings): Promise<ReviewCandidate[]> {
  const docs = await queryDocumentsByTag({
    notebookIds: settings.enabledNotebooks,
    tag: normalizeReviewTag(settings.reviewTag),
  });

  return docs.map(toCandidate);
}

export function mergeCandidatesWithStoredState(
  candidates: ReviewCandidate[],
  storedDocs: Record<string, ReviewDocState>,
): ReviewCandidate[] {
  return candidates.map((candidate) => ({
    ...storedDocs[candidate.docId],
    ...candidate,
    exists: true,
    missingSince: undefined,
  }));
}

function toCandidate(doc: SiyuanDocumentInfo): ReviewCandidate {
  return {
    docId: doc.id,
    notebookId: doc.notebookId,
    title: doc.title || "未命名文档",
    path: doc.path,
    exists: true,
  };
}
