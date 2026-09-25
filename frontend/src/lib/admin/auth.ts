import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api/client";

export const sessionCookie = "lostmidi_admin";
export async function adminRequest<T>(path: string, options: RequestInit = {}, timeoutMs?: number) {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) throw new ApiError(401, "UNAUTHORIZED");
  return apiRequest<T>(path, { ...options, headers: { ...options.headers, Authorization: `Bearer ${token}` } }, timeoutMs);
}
export async function requireAdmin() {
  try { return await adminRequest<{ username: string; role: "super_admin" | "admin"; user_id: string | null; midi_import_enabled: boolean }>("/api/v1/admin/session"); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    throw error;
  }
}
