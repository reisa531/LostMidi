import "server-only";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code = "API_ERROR") { super("Archive API request failed"); }
}

/** 公开档案数据的缓存标签：管理员写入成功后统一失效。 */
export const ARCHIVE_CACHE_TAG = "archive";
/** 公开读取的默认缓存时长（秒）。写入侧通过标签立即失效，这里只兜住失联的情况。 */
const PUBLIC_REVALIDATE_SECONDS = 60;

export type ApiReadCache = "public" | "bypass";
/** 公开读取模块的统一选项；后台工作区用 { cache: "bypass" } 换取即时一致性。 */
export type ReadOptions = { cache?: ApiReadCache; revalidate?: number };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof error?.error?.code === "string" ? error.error.code : "API_ERROR");
  }
  return response.json() as Promise<T>;
}

function backendUrl(path: string) {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new ApiError(503);
  return `${base.replace(/\/$/, "")}${path}`;
}

/** 每次都回源的读取：安装状态、验证码等要求即时或一次性的接口。 */
export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  let response: Response;
  try {
    response = await fetch(backendUrl(path), {
      ...options, cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json", ...options.headers },
    });
  } catch { throw new ApiError(503); }
  return readJson<T>(response);
}

/**
 * 公开只读档案数据。
 *
 * `public`（默认）写入 Next 数据缓存：公开页面命中后不再访问后端，管理员写入按
 * ARCHIVE_CACHE_TAG 失效，因此列表与详情不会落后于后台操作。
 * `bypass` 用于后台工作区等需要即时一致性的读取。
 */
export async function apiRead<T>(path: string, options: ReadOptions = {}): Promise<T> {
  const revalidate = options.revalidate ?? PUBLIC_REVALIDATE_SECONDS;
  if (options.cache === "bypass") return apiRequest<T>(path);
  let response: Response;
  try {
    response = await fetch(backendUrl(path), {
      next: { revalidate, tags: [ARCHIVE_CACHE_TAG] },
      signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" },
    });
  } catch { throw new ApiError(503); }
  return readJson<T>(response);
}
