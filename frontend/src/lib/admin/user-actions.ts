"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError, apiRequest } from "@/lib/api/client";
import { adminRequest } from "./auth";

async function checkOrigin() {
  const expected = process.env.ADMIN_ORIGIN;
  if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
}
function errorMessage(error: unknown) {
  if (!(error instanceof ApiError)) return "请求失败，请稍后重试。";
  const messages: Record<string, string> = {
    INVALID_ORIGIN: "请求来源与后台配置不一致。", USER_EXISTS: "用户名已经被使用。",
    INVALID_INPUT: "用户名、角色或密码格式不正确。", FORBIDDEN: "只有超级管理员可以管理用户。",
    INVITATION_INVALID: "邀请链接无效或已过期。", LAST_SUPER_ADMIN: "至少需要保留一位启用的超级管理员。",
    INVITATION_REQUIRED: "该账号没有已设置的密码，请重新发出邀请。",
  };
  return messages[error.code] ?? "服务暂时不可用，请稍后重试。";
}

export type InviteState = { error: string; username?: string; token?: string; expiresAt?: string };
export async function inviteAdminAction(_previous: InviteState, form: FormData): Promise<InviteState> {
  try {
    await checkOrigin();
    const result = await adminRequest<{ username: string; invitation_token: string; expires_at: string }>("/api/v1/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: String(form.get("username") ?? ""), role: String(form.get("role") ?? "admin") }),
    });
    revalidatePath("/admin/users");
    return { error: "", username: result.username, token: result.invitation_token, expiresAt: result.expires_at };
  } catch (error) { return { error: errorMessage(error) }; }
}

export async function updateAdminUserAction(_previous: { error: string; success: boolean }, form: FormData) {
  try {
    await checkOrigin();
    const id = String(form.get("id") ?? "");
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new ApiError(400, "INVALID_INPUT");
    await adminRequest(`/api/v1/admin/users/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: String(form.get("role") ?? ""), status: String(form.get("status") ?? "") }),
    });
    revalidatePath("/admin/users");
    return { error: "", success: true };
  } catch (error) { return { error: errorMessage(error), success: false }; }
}

export type AcceptInviteState = { error: string };
export async function acceptAdminInviteAction(_previous: AcceptInviteState, form: FormData): Promise<AcceptInviteState> {
  try {
    const expected = process.env.ADMIN_ORIGIN;
    if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
    await apiRequest("/api/v1/admin/invitations/accept", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: String(form.get("token") ?? ""), password: String(form.get("password") ?? "") }),
    });
  } catch (error) { return { error: errorMessage(error) }; }
  redirect("/admin/login?invited=1");
}
