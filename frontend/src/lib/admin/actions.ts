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
export type MidiSaveState = { error: string; savedId?: string; retryOnly?: boolean };

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
    let upload: { filename: string; content_base64: string; rights_confirmed: true } | undefined;
    if (!id) {
      const files = form.getAll("file");
      if (files.length > 1) throw new ApiError(400, "INVALID_FILE");
      const file = files[0];
      if (file !== undefined && !(file instanceof File)) throw new ApiError(400, "INVALID_FILE");
      if (file instanceof File && (file.name || file.size)) {
        if (!/\.midi?$/i.test(file.name) || file.size === 0) throw new ApiError(400, "INVALID_FILE");
        if (file.size > 1048576) throw new ApiError(413, "FILE_TOO_LARGE");
        if (form.get("rights_confirmed") !== "true") throw new ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED");
        upload = { filename: file.name, content_base64: Buffer.from(await file.arrayBuffer()).toString("base64"), rights_confirmed: true };
      }
    }
    const body = {
      title: value("title"), slug: value("slug"), description: value("description") || null,
      estimated_year: year ? Number(year) : null, archive_status: value("archive_status"),
      copyright_status: value("copyright_status"), distribution_permission: value("distribution_permission"),
      license: value("license") || null, rights_holder: value("rights_holder") || null,
      ...(id ? { revision } : { request_id: requestId, ...(upload ? { file: upload } : {}) }),
    };
    sent = true;
    const saved = await adminRequest<MidiEntry>(`/api/v1/admin/midis${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST", redirect: "error", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }, 60000);
    return { error: "", savedId: saved.id };
  } catch (error) {
    const disabled = error instanceof ApiError && error.code === "IMPORT_DISABLED";
    const retryOnly = !id && sent && !disabled && (!(error instanceof ApiError) || error.status >= 500);
    if (retryOnly) return { error: "暂时无法确认创建结果，输入和文件已保留。请重试本次提交，系统会核对原请求，不会重复建档。", retryOnly: true };
    const messages: Record<string, string> = {
      INVALID_FILE: "请选择一个非空的 .mid 或 .midi 文件。",
      INVALID_MIDI: "文件不是有效的 SMF 0、1 或 2 格式 MIDI，请检查文件内容。",
      FILE_TOO_LARGE: "文件过大；单个文件最大 1 MiB（1,048,576 字节）。",
      RIGHTS_CONFIRMATION_REQUIRED: "请先确认你有权公开分发此文件。",
      FILE_OWNERSHIP_CONFLICT: "相同文件已归属于其他档案，未创建新档案。请先在档案列表核对归属。",
      IDEMPOTENCY_CONFLICT: "本次请求已保存过不同内容。请在新页面核对档案列表，不要重复建档。",
      IMPORT_DISABLED: "文件上传尚未启用或已暂停；可以移除文件，仅保存文字资料。",
    };
    return { error: error instanceof ApiError ? messages[error.code] ?? message(error) : message(error) };
  }
}
