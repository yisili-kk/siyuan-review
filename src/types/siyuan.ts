export type NotebookInfo = {
  id: string;
  name: string;
  closed?: boolean;
};

export type SiyuanDocumentInfo = {
  id: string;
  notebookId: string;
  title: string;
  path: string;
};

export type SiyuanApiResponse<T> = {
  code: number;
  msg: string;
  data: T;
};
