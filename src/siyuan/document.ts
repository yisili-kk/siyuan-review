import { type App, openTab } from "siyuan";
import type { SiyuanReviewBlockInfo } from "../types/siyuan";
import { postSiyuanApi } from "./api";
import { buildReviewBlocksByTagStmt } from "./review-query";

export async function openReviewItem(app: App, itemId: string): Promise<void> {
  await openTab({
    app,
    doc: {
      id: itemId,
    },
  });
}

export async function getBlockMarkdown(blockId: string): Promise<string> {
  const data = await postSiyuanApi<{ kramdown: string }>("/api/block/getBlockKramdown", { id: blockId });
  return data.kramdown;
}

export async function queryReviewBlocksByTag(input: {
  notebookIds: string[];
  tag: string;
}): Promise<SiyuanReviewBlockInfo[]> {
  if (input.notebookIds.length === 0) {
    return [];
  }

  const stmt = buildReviewBlocksByTagStmt(input);

  return postSiyuanApi<SiyuanReviewBlockInfo[]>("/api/query/sql", { stmt });
}
