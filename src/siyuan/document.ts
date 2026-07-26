import { type App, openTab } from "siyuan";
import type { SiyuanDocumentInfo } from "../types/siyuan";
import { postSiyuanApi } from "./api";

export async function openDocument(app: App, docId: string): Promise<void> {
  await openTab({
    app,
    doc: {
      id: docId,
    },
  });
}

export async function getDocumentMarkdown(docId: string): Promise<string> {
  const data = await postSiyuanApi<{ kramdown: string }>("/api/block/getBlockKramdown", { id: docId });
  return data.kramdown;
}

export async function queryDocumentsByTag(input: {
  notebookIds: string[];
  tag: string;
}): Promise<SiyuanDocumentInfo[]> {
  if (input.notebookIds.length === 0) {
    return [];
  }

  const notebookList = input.notebookIds.map((id) => `"${escapeSql(id)}"`).join(",");
  const tag = escapeSql(input.tag);
  const stmt = `
select distinct d.id, d.box as notebookId, d.content as title, d.hpath as path
from blocks d
where d.type = 'd'
  and d.box in (${notebookList})
  and exists (
    select 1 from spans s
    where s.root_id = d.id
      and s.type = 'tag'
      and s.content = '${tag}'
  )
order by d.updated desc
`;

  return postSiyuanApi<SiyuanDocumentInfo[]>("/api/query/sql", { stmt });
}

function escapeSql(value: string): string {
  return value.replaceAll("'", "''").replaceAll('"', '""');
}
