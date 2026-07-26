import type { SiyuanApiResponse } from "../types/siyuan";

export async function postSiyuanApi<T>(path: string, body: unknown = {}): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const result = (await response.json()) as SiyuanApiResponse<T>;
  if (result.code !== 0) {
    throw new Error(result.msg || `SiYuan API failed: ${path}`);
  }

  return result.data;
}
