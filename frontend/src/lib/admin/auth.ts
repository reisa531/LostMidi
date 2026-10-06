import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidateTag, updateTag } from "next/cache";
import { ApiError, apiRequest, ARCHIVE_CACHE_TAG } from "@/lib/api/client";

export const sessionCookie = "lostmidi_admin";

/**
 * 写入成功后失效公开数据缓存。
 *
 * 后台写入都在 Server Action 里，优先用 updateTag：立即失效并让编辑者读到自己的改动。
 * 若从其他上下文调用（例如将来的路由处理器），退回按标签重新验证；两者都失败也只让
 * 公开读取多等一个缓存周期，不影响写入结果。
 */
function invalidateArchiveCache() {
  try { updateTag(ARCHIVE_CACHE_TAG); return; } catch { /* 不在 Server Action 中：走标签失效。 */ }
  try { revalidateTag(ARCHIVE_CACHE_TAG, "max"); } catch { /* 尽力而为：公开读取最长 60 秒后自行回源。 */ }
}

export async function adminRequest<T>(path: string, options: RequestInit = {}, timeoutMs?: number) {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) throw new ApiError(401, "UNAUTHORIZED");
  const result = await apiRequest<T>(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } }, timeoutMs);
  const method = (options.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") invalidateArchiveCache();
  return result;
}
export async function requireAdmin() {
  try { return await adminRequest<{ username: string; role: "super_admin" | "admin"; user_id: string | null; midi_import_enabled: boolean }>("/api/v1/admin/session"); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    throw error;
  }
}
