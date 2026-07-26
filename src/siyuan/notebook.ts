import type { NotebookInfo } from "../types/siyuan";
import { postSiyuanApi } from "./api";

type LsNotebooksResponse = {
  notebooks: Array<{
    id: string;
    name: string;
    closed?: boolean;
  }>;
};

export async function listNotebooks(): Promise<NotebookInfo[]> {
  const data = await postSiyuanApi<LsNotebooksResponse>("/api/notebook/lsNotebooks");
  return data.notebooks.map((notebook) => ({
    id: notebook.id,
    name: notebook.name,
    closed: notebook.closed,
  }));
}
