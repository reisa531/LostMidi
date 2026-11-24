"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api/client";
import { adminRequest, sessionCookie } from "./auth";
import type { MidiEntry } from "@/lib/api/types";
import { registrationCopy } from "./registration-copy";

async function checkOrigin() {
  const expected = process.env.ADMIN_ORIGIN;
  if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
}
function message(error: unknown) {
  if (!(error instanceof ApiError)) return "请求失败，请稍后重试。";
  const messages: Record<string, string> = {
    INVALID_CREDENTIALS: "用户名或密码不正确。", LOGIN_RATE_LIMITED: "登录尝试过多，请一分钟后重试。",
    ACCOUNT_DISABLED: "账号已停用。如需恢复，请在「关于」页联系站长。",
    ADMIN_DISABLED: "尚未配置管理员账号，请联系部署维护者。", INVALID_ORIGIN: "请求来源与后台配置不符，请检查访问地址。",
    SLUG_CONFLICT: "此 slug 已被占用，请更换。", STALE_ENTRY: "作品资料已被他处修改。请保留当前内容，重新打开编辑页合并。",
    INVALID_INPUT: "字段格式或长度不符要求，请检查标题、slug、年份与文字长度。",
    MIDI_NOT_FOUND: "该档案已不存在。", UNAUTHORIZED: "会话已过期，请重新登录。",
    ARCHIVE_SUPER_ADMIN_REQUIRED: "已归档档案及归档操作仅限管理员。",
    USER_EXISTS: "账号或邮箱已存在。",
    REGISTRATION_RATE_LIMITED: "注册请求过多，请一分钟后重试。",
    CAPTCHA_INVALID: registrationCopy.registrationRejected,
    CAPTCHA_UNAVAILABLE: registrationCopy.registrationUnavailable,
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
export type RegisterState = { error: string; registered?: boolean; attempt?: number };
export async function registerAction(_previous: RegisterState, form: FormData): Promise<RegisterState> {
  try {
    await checkOrigin();
    const username = String(form.get("username") ?? "");
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const passwordConfirmation = String(form.get("password_confirmation") ?? "");
    const token = String(form.get("captcha_token") ?? "");
    if (!/^[A-Za-z0-9_.-]{3,64}$/.test(username) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 || password.length < 12 || password !== passwordConfirmation)
      return { error: "请检查账号、邮箱及至少 12 位且一致的密码。", attempt: (_previous.attempt ?? 0) + 1 };
    if (!token || token.length > 2048)
      return { error: registrationCopy.missing, attempt: (_previous.attempt ?? 0) + 1 };
    await apiRequest("/api/v1/admin/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, email, password, password_confirmation: passwordConfirmation,
        captcha_token: token }),
    });
    return { error: "", registered: true };
  } catch (error) { return { error: message(error), attempt: (_previous.attempt ?? 0) + 1 }; }
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
export type MidiSaveState = { error: string; savedId?: string; queued?: boolean; retryOnly?: boolean };

export async function saveMidiAction(_previous: MidiSaveState, form: FormData): Promise<MidiSaveState> {
  const id = String(form.get("id") ?? "");
  let sent = false;
  try {
    await checkOrigin();
    await adminRequest("/api/v1/admin/session", { redirect: "error" });
    if (id && (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")))
      throw new ApiError(400, "INVALID_INPUT");
    const value = (name: string) => String(form.get(name) ?? "");
    const year = value("estimated_year");
    const revision = Number(value("revision"));
    if ((year && !/^\d{1,4}$/.test(year)) || (id && (!Number.isSafeInteger(revision) || revision < 1)))
      throw new ApiError(400, "INVALID_INPUT");
    const requestId = value("request_id");
    if (!id && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))
      throw new ApiError(400, "INVALID_INPUT");
    if (form.has("file")) throw new ApiError(400, "INVALID_FILE");
    const body = {
      title: value("title"), slug: value("slug"), description: value("description") || null,
      estimated_year: year ? Number(year) : null, estimated_date: value("estimated_date") || null, archive_status: value("archive_status"),
      copyright_status: value("copyright_status"), distribution_permission: value("distribution_permission"),
      license: value("license") || null, rights_holder: value("rights_holder") || null,
      ...(id ? { revision } : { request_id: requestId }),
    };
    sent = true;
    const saved = await adminRequest<MidiEntry | { request_id: string; status: "pending" }>(`/api/v1/admin/midis${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }, 60000);
    return "request_id" in saved ? { error: "", queued: true } : { error: "", savedId: saved.id };
  } catch (error) {
    const disabled = error instanceof ApiError && error.code === "IMPORT_DISABLED";
    const retryOnly = !id && sent && !disabled && (!(error instanceof ApiError) || error.status >= 500);
    if (retryOnly) return { error: "暂无法确认创建结果，输入与文件已保留。请重试提交，系统将核对原请求，不会重复建档。", retryOnly: true };
    const messages: Record<string, string> = {
      INVALID_FILE: "请通过文件上传表单提交文件。",
      RIGHTS_CONFIRMATION_REQUIRED: "请先确认有权公开分发此文件。",
      FILE_OWNERSHIP_CONFLICT: "相同文件已归属其他档案，未新建。请先在档案列表核对归属。",
      IDEMPOTENCY_CONFLICT: "本次请求已保存其他内容。请在新页面核对档案列表，勿重复建档。",
      CREATION_DELETED: "此请求对应的档案已删除，重试无法恢复。请重新打开新增页创建。",
      IMPORT_DISABLED: "文件上传未启用或已暂停；可移除文件，仅保存文字资料。",
    };
    return { error: error instanceof ApiError ? messages[error.code] ?? message(error) : message(error) };
  }
}
