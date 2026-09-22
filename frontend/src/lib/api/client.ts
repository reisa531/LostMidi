import "server-only";

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code = "API_ERROR") { super("Archive API request failed"); }
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path);
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const base = process.env.BACKEND_API_URL;
  if (!base) throw new ApiError(503);
  let response: Response;
  try {
    response = await fetch(`${base.replace(/\/$/, "")}${path}`, {
      ...options, cache: "no-store", signal: AbortSignal.timeout(timeoutMs), headers: { Accept: "application/json", ...options.headers },
    });
  } catch { throw new ApiError(503); }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new ApiError(response.status, typeof error?.error?.code === "string" ? error.error.code : "API_ERROR");
  }
  return response.json() as Promise<T>;
}
