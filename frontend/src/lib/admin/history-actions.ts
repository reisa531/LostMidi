"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";

class InputError extends Error {}

function text(form: FormData, name: string) {
  const value = form.get(name) ?? "";
  if (typeof value !== "string") throw new InputError("字段格式不正确，请检查输入。");
  return value;
}
function idOf(value: string) {
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))
    throw new InputError("记录编号不正确，请保留输入并重新打开页面。");
  return value;
}
function boundedText(form: FormData, name: string, label: string, max: number, required = false) {
  const value = text(form, name);
  if (required && !value.trim()) throw new InputError(`请填写${label}。`);
  if (new TextEncoder().encode(value).length > max) throw new InputError(`${label}最多 ${max.toLocaleString("zh-CN")} UTF-8 字节，中文字符通常占 3 字节。`);
  return value || null;
}
function urlOf(form: FormData, name: string, label: string) {
  const value = boundedText(form, name, label, 4096);
  if (!value) return null;
  let valid = false;
  try {
    const url = new URL(value);
    const hasControls = Array.from(value).some(character => {
      const code = character.charCodeAt(0);
      return code < 32 || (code >= 127 && code <= 159);
    });
    valid = /^https?:\/\//i.test(value) && ["http:", "https:"].includes(url.protocol)
      && !url.username && !url.password && !/^https?:\/\/[^/?#]*@/i.test(value)
      && value === value.trim() && !hasControls;
  } catch { /* Report malformed URLs without changing the entered value. */ }
  if (!valid) throw new InputError(`${label}须为不含账户信息或控制符的完整 http/https 网址；未知时请留空。`);
  return value;
}
function utcOf(form: FormData, name: string, label: string) {
  const value = text(form, name);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?$/.test(value))
    throw new InputError(`${label}请填写完整 UTC 日期和时间，小数秒最多 6 位；不知道完整日期时请留空。`);
  // Do not use Date: it changes time zones and loses sub-millisecond precision.
  return `${value.length === 16 ? `${value}:00` : value}Z`;
}
function sortableUTC(value: string) {
  const [seconds, fraction = ""] = value.slice(0, -1).split(".");
  return `${seconds}.${fraction.padEnd(6, "0")}`;
}
function errorMessage(error: unknown) {
  if (error instanceof InputError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 401) return "会话已过期。当前输入已保留，请在新页面登录后重试。";
    if (error.status === 409) return "作品资料已被其他页面修改。请保留当前输入，重新打开来源与寻回页，核对最新资料后手动合并；不要直接重复提交。";
    const messages: Record<string, string> = {
      INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
      INVALID_INPUT: "请检查必填项、UTF-8 字节长度、网址和 UTC 日期；首次记录时间不能晚于最后记录时间。",
      UNKNOWN_PERSON: "所选寻回人已不存在。请刷新人物列表并重新选择，或选择「人物不详」。",
      MIDI_NOT_FOUND: "作品档案已不存在。当前输入已保留，请先核对作品列表。",
      SOURCE_NOT_FOUND: "这条历史来源已不存在。请保留输入，重新打开页面核对，不要直接重复提交。",
      RECOVERY_EVENT_NOT_FOUND: "这条寻回记录已不存在。请保留输入，重新打开页面核对，不要直接重复提交。",
    };
    if (messages[error.code]) return messages[error.code];
  }
  return "请求超时、连接中断或服务异常，无法确认是否已保存。输入已保留，请先在新页面核对记录是否已保存或删除，再决定是否重试，避免重复新增。";
}

export async function saveHistoryAction(_previous: { error: string }, form: FormData) {
  let midiId: string;
  let operation: string;
  let queued = false;
  try {
    if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
      throw new ApiError(403, "INVALID_ORIGIN");
    midiId = idOf(text(form, "midi_id"));
    const kind = text(form, "kind");
    operation = text(form, "operation");
    if (!["source", "event"].includes(kind) || !["save", "delete"].includes(operation))
      throw new InputError("操作不正确，请重新选择保存或确认删除。");
    const recordId = text(form, "record_id") ? idOf(text(form, "record_id")) : "";
    const version = text(form, "revision");
    const revision = Number(version);
    if (!/^[1-9]\d*$/.test(version) || !Number.isSafeInteger(revision))
      throw new InputError("作品版本不正确，请保留输入并重新打开页面。");
    if (operation === "delete" && !recordId) throw new InputError("尚未保存的记录无需删除，请取消新增。");

    // Only these flat writable fields reach the API; deletion sends revision alone.
    let body: Record<string, string | number | null> = { revision };
    if (operation === "save" && kind === "source") {
      const first = utcOf(form, "first_seen_at", "首次记录时间");
      const last = utcOf(form, "last_seen_at", "最后记录时间");
      if (first && last && sortableUTC(first) > sortableUTC(last))
        throw new InputError("首次记录时间不能晚于最后记录时间。未知的日期请留空。");
      body = { revision,
        website_name: boundedText(form, "website_name", "网站名称", 300, true),
        original_url: urlOf(form, "original_url", "原始网址"),
        wayback_url: urlOf(form, "wayback_url", "存档网址"),
        first_seen_at: first, last_seen_at: last,
        notes: boundedText(form, "notes", "备注", 20000),
        source_type: text(form, "source_type"),
        credibility: Number(text(form, "credibility")),
        checked_at: utcOf(form, "checked_at", "最近核验时间"),
      };
    } else if (operation === "save") {
      body = { revision,
        recovered_at: utcOf(form, "recovered_at", "寻回时间"),
        recovered_by_name: boundedText(form, "recovered_by_name", "寻回人", 300),
        story: boundedText(form, "story", "寻回经过", 20000, true),
        evidence: boundedText(form, "evidence", "证据说明", 20000),
      };
    }
    const collection = kind === "source" ? "sources" : "recovery-events";
    const result = await adminRequest<{ request_id?: string; status?: string }>(`/api/v1/admin/midis/${midiId}/${collection}${recordId ? `/${recordId}` : ""}`, {
      method: operation === "delete" ? "DELETE" : recordId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    queued = result.status === "pending" && Boolean(result.request_id);
  } catch (error) { return { error: errorMessage(error) }; }
  if (queued) redirect("/admin/changes?submitted=1");
  redirect(`/admin/midis/${midiId}/history?${operation === "delete" ? "deleted" : "saved"}=1`);
}

export async function uploadEvidenceAction(form: FormData): Promise<never> {
  if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
    throw new ApiError(403, "INVALID_ORIGIN");
  const midiId = idOf(text(form, "midi_id"));
  const recordId = idOf(text(form, "record_id"));
  const versionText = text(form, "revision");
  const revision = Number(versionText);
  if (!/^[1-9]\d*$/.test(versionText) || !Number.isSafeInteger(revision)) throw new InputError("作品版本不正确，请重新打开记录后上传。");
  const kind = text(form, "kind");
  if (kind !== "source" && kind !== "event") throw new InputError("附件关联类型无效。");
  const file = form.get("evidence_file");
  if (!(file instanceof File) || !file.size) throw new InputError("请选择一个非空证据文件。");
  if (file.size > 1048576) throw new InputError("证据文件最大为 1 MiB。");
  const extension = file.name.toLowerCase().split(".").at(-1);
  const mediaTypes: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain" };
  const mediaType = mediaTypes[extension ?? ""];
  if (!mediaType || (file.type && file.type !== mediaType && file.type !== "application/octet-stream"))
    throw new InputError("仅支持 PDF、PNG、JPEG 和纯文本文件，且扩展名与文件类型必须相符。");
  const collection = kind === "source" ? "sources" : "recovery-events";
  const encodedName = encodeURIComponent(file.name);
  let queued = false;
  try {
    const result = await adminRequest<{ request_id?: string; status?: string }>(`/api/v1/admin/midis/${midiId}/${collection}/${recordId}/evidence`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodedName, "X-Evidence-Media-Type": mediaType, "X-Entry-Revision": String(revision) },
      body: Buffer.from(await file.arrayBuffer()),
    }, 60000);
    queued = result.status === "pending" && Boolean(result.request_id);
  } catch (error) { throw errorMessage(error); }
  if (queued) redirect("/admin/changes?submitted=1");
  redirect(`/admin/midis/${midiId}/history?evidence=uploaded`);
}
