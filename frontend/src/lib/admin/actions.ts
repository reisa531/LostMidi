"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api/client";
import { adminRequest, sessionCookie } from "./auth";
import type { MidiEntry } from "@/lib/api/types";

async function checkOrigin() {
  const expected = process.env.ADMIN_ORIGIN;
  if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
}
function message(error: unknown) {
  if (!(error instanceof ApiError)) return "请求失败，请稍后重试。";
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: "用户名或密码不正确。", LOGIN_RATE_LIMITED: "登录尝试过多，请一分钟后重试。",
    ADMIN_DISABLED: "管理员账号尚未配置，请联系部署维护者。", INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
    SLUG_CONFLICT: "此 slug 已被使用，请换一个。", STALE_ENTRY: "作品资料已被其他页面修改。请保留当前内容，重新打开编辑页后合并修改。",
    INVALID_INPUT: "字段格式或长度不符合要求，请检查标题、slug、年份和文字长度。",
    MIDI_NOT_FOUND: "该档案已不存在。", UNAUTHORIZED: "会话已过期，请重新登录。",
  };
  return messages[error.code] ?? "服务暂时不可用，请稍后重试。";
}

export async function loginAction(_previous: { error: string }, form: FormData) {
  try {
    await checkOrigin();
    const session = await apiRequest<{ token: string; expires_in: number }>("/api/v1/admin/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: String(form.get("username") ?? ""), password: String(form.get("password") ?? "") }),
    });
    (await cookies()).set(sessionCookie, session.token, {
      httpOnly: true, secure: process.env.ADMIN_COOKIE_SECURE !== "false", sameSite: "strict", path: "/admin", maxAge: session.expires_in,
    });
  } catch (error) { return { error: message(error) }; }
  redirect("/admin");
}
export async function logoutAction() {
  try {
    await checkOrigin();
    // Keep the cookie when revocation fails so the administrator can retry.
    try { await adminRequest("/api/v1/admin/logout", { method: "POST" }); }
    catch (error) { if (!(error instanceof ApiError && error.status === 401)) throw error; }
    (await cookies()).set(sessionCookie, "", { path: "/admin", httpOnly: true, sameSite: "strict", secure: process.env.ADMIN_COOKIE_SECURE !== "false", maxAge: 0 });
  } catch (error) { return { error: message(error) }; }
  redirect("/admin/login");
}
export async function saveMidiAction(_previous: { error: string }, form: FormData) {
  let saved: MidiEntry;
  try {
    await checkOrigin();
    const id = String(form.get("id") ?? "");
    if (id && !/^[1-9]\d{0,18}$/.test(id)) throw new ApiError(400, "INVALID_INPUT");
    const value = (name: string) => String(form.get(name) ?? "");
    const year = value("estimated_year");
    if (year && !/^\d{1,4}$/.test(year)) throw new ApiError(400, "INVALID_INPUT");
    const body = {
      title: value("title"), slug: value("slug"), description: value("description") || null,
      estimated_year: year ? Number(year) : null, archive_status: value("archive_status"),
      copyright_status: value("copyright_status"), distribution_permission: value("distribution_permission"),
      license: value("license") || null, rights_holder: value("rights_holder") || null,
      ...(id ? { revision: Number(value("revision")) } : {}),
    };
    saved = await adminRequest<MidiEntry>(`/api/v1/admin/midis${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
  } catch (error) { return { error: message(error) }; }
  redirect(`/admin/midis/${saved.id}/edit?saved=1`);
}
