import type { ReviewCandidate, ReviewItem } from "../types/review";
import type { ReviewGroupSettings, ReviewSettings } from "../types/settings";
import type { SiyuanReviewBlockInfo } from "../types/siyuan";
import { getBlockMarkdown, queryReviewBlocksByTag } from "../siyuan/document";
import { normalizeReviewTag } from "../siyuan/tag";

export async function scanReviewCandidates(settings: ReviewSettings): Promise<ReviewCandidate[]> {
  const groups = settings.reviewGroups
    .filter((group) => group.enabled)
    .map((group) => ({
      ...group,
      tag: normalizeReviewTag(group.tag),
    }))
    .filter((group) => group.tag);

  const candidatesById = new Map<string, { candidate: ReviewCandidate; groupIndex: number }>();

  for (const [groupIndex, group] of groups.entries()) {
    const blocks = await queryReviewBlocksByTag({
      notebookIds: settings.enabledNotebooks,
      tag: group.tag,
    });

    for (const block of blocks) {
      const candidate = await toCandidate(block, group);
      const existing = candidatesById.get(candidate.itemId);
      if (!existing || shouldReplaceGroup(candidate.groupTag, groupIndex, existing.candidate.groupTag, existing.groupIndex)) {
        candidatesById.set(candidate.itemId, { candidate, groupIndex });
      }
    }
  }

  return Array.from(candidatesById.values()).map((value) => value.candidate);
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

async function toCandidate(block: SiyuanReviewBlockInfo, group: ReviewGroupSettings): Promise<ReviewCandidate> {
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
    groupId: group.id,
    groupName: group.name,
    groupTag: group.tag,
    templateQuestions: group.templateQuestions,
    contentPreview,
    exists: true,
  };
}

function shouldReplaceGroup(nextTag: string, nextIndex: number, currentTag: string, currentIndex: number): boolean {
  const nextSpecificity = getTagSpecificity(nextTag);
  const currentSpecificity = getTagSpecificity(currentTag);
  if (nextSpecificity !== currentSpecificity) {
    return nextSpecificity > currentSpecificity;
  }

  return nextIndex < currentIndex;
}

function getTagSpecificity(tag: string): number {
  return tag.split("/").filter(Boolean).length;
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
