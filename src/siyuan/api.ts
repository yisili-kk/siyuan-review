import type { SiyuanApiResponse } from "../types/siyuan";

const DEFAULT_API_TIMEOUT_MS = 15000;

export async function postSiyuanApi<T>(path: string, body: unknown = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => {
    controller.abort();
  }, DEFAULT_API_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`SiYuan API timed out after ${DEFAULT_API_TIMEOUT_MS}ms: ${path}`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`SiYuan API HTTP ${response.status}: ${path}`);
  }

  let result: SiyuanApiResponse<T>;
  try {
    result = (await response.json()) as SiyuanApiResponse<T>;
  } catch {
    throw new Error(`SiYuan API returned invalid JSON: ${path}`);
  }

  if (result.code !== 0) {
    throw new Error(result.msg || `SiYuan API failed: ${path}`);
  }

  return result.data;
}
