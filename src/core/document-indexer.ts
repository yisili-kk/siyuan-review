import type { ReviewCandidate, ReviewItem } from "../types/review";
import type { ReviewSettings } from "../types/settings";
import type { SiyuanReviewBlockInfo } from "../types/siyuan";
import { getBlockMarkdown, queryReviewBlocksByTag } from "../siyuan/document";
import { normalizeReviewTag } from "../siyuan/tag";

export async function scanReviewCandidates(settings: ReviewSettings): Promise<ReviewCandidate[]> {
  const blocks = await queryReviewBlocksByTag({
    notebookIds: settings.enabledNotebooks,
    tag: normalizeReviewTag(settings.reviewTag),
  });

  return Promise.all(blocks.map(toCandidate));
}

export function mergeCandidatesWithStoredState(
  candidates: ReviewCandidate[],
  storedItems: Record<string, ReviewItem>,
): ReviewCandidate[] {
  return candidates.map((candidate) => ({
    ...storedItems[candidate.itemId],
    ...candidate,
    exists: true,
    missingSince: undefined,
  }));
}

async function toCandidate(block: SiyuanReviewBlockInfo): Promise<ReviewCandidate> {
  const itemType = block.blockType === "d" ? "document" : "block";
  const sourceTitle = block.docTitle || "未命名文档";
  const contentPreview =
    itemType === "block" ? await resolveBlockPreview(block) : normalizePreview(block.content || sourceTitle);
  const title = itemType === "document" ? sourceTitle : contentPreview || "片段";

  return {
    itemId: block.id,
    itemType,
    docId: block.docId || block.id,
    notebookId: block.notebookId,
    blockType: block.blockType,
    title,
    sourceTitle,
    path: block.path,
    contentPreview,
    exists: true,
  };
}

async function resolveBlockPreview(block: SiyuanReviewBlockInfo): Promise<string> {
  if (block.blockType === "i") {
    const listItemTitle = resolveListItemTitle(block.markdown);
    if (listItemTitle) {
      return listItemTitle;
    }
  }

  const preview = normalizePreview(block.content);
  if (preview) {
    return preview;
  }

  try {
    const markdown = await getBlockMarkdown(block.id);
    if (block.blockType === "i") {
      const listItemTitle = resolveListItemTitle(markdown);
      if (listItemTitle) {
        return listItemTitle;
      }
    }
    return normalizePreview(markdown);
  } catch {
    return "";
  }
}

function resolveListItemTitle(markdown?: string): string {
  const firstContentLine = markdown?.split("\n").find((line) => normalizePreview(line));
  return firstContentLine ? normalizePreview(firstContentLine) : "";
}

function normalizePreview(value: string): string {
  return value
    .replace(/\{:\s+[^}]*\}/g, "")
    .replace(/#[^#\s]+#/g, "")
    .replace(/(^|\s)#[^\s#]+(?=\s|$)/g, " ")
    .replace(/^\s*[-*+]\s+/, "")
    .replace(/^\s*\d+[.)]\s+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}
