import type { MidiDetail, MidiEntry } from "@/lib/api/types";
import type { MidiSaveState } from "./actions";

export const maxFileSize = 15_000_000;
export type MidiFileImportState = {
  error: string;
  unauthorized?: boolean;
  queued?: boolean;
  result?: { fileId: string; filename: string; duplicate: boolean; revision: number };
};

class TransferError extends Error {
  constructor(readonly status: number, readonly code: string) { super("File transfer failed"); }
}

const messages: Record<string, string> = {
  INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
  INVALID_INPUT: "字段格式或长度不符合要求，请核对档案资料。",
  FILE_TOO_LARGE: "文件过大；单个文件最大 15 MB（15,000,000 字节）。",
  INVALID_FILE: "请选择非空文件，文件名不能包含路径、控制字符或首尾空格。",
  RIGHTS_CONFIRMATION_REQUIRED: "请先确认你有权公开分发此文件。",
  STORAGE_UNAVAILABLE: "存储服务暂时不可用。请先核对已存记录，再决定是否重试。",
  IMPORT_DISABLED: "文件导入尚未启用或已暂停；可以移除文件，仅保存文字资料。",
  SERVER_BUSY: "服务繁忙，请先核对已存记录，再稍后重试。",
  MIDI_NOT_FOUND: "该作品档案已不存在，请返回作品列表核对。",
  SLUG_CONFLICT: "此 slug 已被使用，请换一个。",
  IDEMPOTENCY_CONFLICT: "本次请求已保存过不同内容。请在新页面核对档案列表，不要重复建档。",
  CREATION_DELETED: "本次创建请求对应的档案已删除，请重新打开新增页创建。",
};

function errorState(error: unknown): MidiFileImportState {
  if (error instanceof TransferError) {
    if (error.status === 401) return { error: "会话已过期。已保留所选文件，请在新页面登录后重试。", unauthorized: true };
    if (error.code === "FILE_OWNERSHIP_CONFLICT") return { error: "相同文件已归属于其他档案，不能导入到当前档案。请先核对归属，不要重复提交。" };
    if (messages[error.code]) return { error: messages[error.code] };
    if (error.status === 409) return { error: "作品版本或文件归属发生冲突。请先刷新，核对最新版本和已有文件，不要直接重复提交。" };
    if (error.status === 413) return { error: messages.FILE_TOO_LARGE };
  }
  return { error: "连接中断或请求超时，无法确认导入结果。已保留所选文件，请先核对已存记录，文件可能已经保存。" };
}

function selectedFile(form: FormData) {
  const file = form.get("file");
  if (form.getAll("file").length !== 1 || !(file instanceof File) || !file.name || !file.size)
    throw new TransferError(400, "INVALID_FILE");
  if (file.size > maxFileSize) throw new TransferError(413, "FILE_TOO_LARGE");
  if (form.get("rights_confirmed") !== "true") throw new TransferError(400, "RIGHTS_CONFIRMATION_REQUIRED");
  return file;
}

async function transfer<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(path, { ...options, method: "POST", credentials: "same-origin", mode: "same-origin",
    redirect: "error", cache: "no-store", signal: AbortSignal.timeout(120_000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new TransferError(response.status, typeof body?.error?.code === "string" ? body.error.code : "API_ERROR");
  if (!body) throw new TransferError(502, "INVALID_RESPONSE");
  return body as T;
}

export async function importMidiFile(form: FormData): Promise<MidiFileImportState> {
  try {
    const file = selectedFile(form);
    const id = String(form.get("id") ?? ""), revision = String(form.get("revision") ?? "");
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")
      || !/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision))) throw new TransferError(400, "INVALID_INPUT");
    const imported = await transfer<{ request_id?: string; status?: string; file?: MidiDetail["files"][number]; duplicate?: boolean; revision?: number }>(
      `/admin/file-transfer/${id}/files`, {
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name),
          "X-Entry-Revision": revision, "X-Rights-Confirmed": "true" }, body: file,
      });
    if (imported.status === "pending" && imported.request_id) return { error: "", queued: true };
    if (!imported.file || typeof imported.revision !== "number") throw new TransferError(502, "INVALID_RESPONSE");
    return { error: "", result: { fileId: imported.file.id, filename: imported.file.original_filename,
      duplicate: Boolean(imported.duplicate), revision: imported.revision } };
  } catch (error) { return errorState(error); }
}

export async function createMidiWithFile(form: FormData): Promise<MidiSaveState> {
  let sent = false;
  try {
    const file = selectedFile(form);
    const value = (name: string) => String(form.get(name) ?? "");
    const year = value("estimated_year"), requestId = value("request_id");
    if ((year && !/^\d{1,4}$/.test(year)) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(requestId))
      throw new TransferError(400, "INVALID_INPUT");
    const encoded = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("File read failed"));
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.slice(reader.result.indexOf(",") + 1)) : reject(new Error("File read failed"));
      reader.readAsDataURL(file);
    });
    const body = {
      title: value("title"), slug: value("slug"), description: value("description") || null,
      estimated_year: year ? Number(year) : null, estimated_date: value("estimated_date") || null, archive_status: value("archive_status"),
      copyright_status: value("copyright_status"), distribution_permission: value("distribution_permission"),
      license: value("license") || null, rights_holder: value("rights_holder") || null, request_id: requestId,
      file: { filename: file.name, content_base64: encoded, rights_confirmed: true },
    };
    sent = true;
    const saved = await transfer<MidiEntry | { request_id: string; status: "pending" }>("/admin/file-transfer/create", {
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if ("request_id" in saved) return { error: "", queued: true };
    if (!saved.id) throw new TransferError(502, "INVALID_RESPONSE");
    return { error: "", savedId: saved.id };
  } catch (error) {
    if (sent && (!(error instanceof TransferError) || (error.status >= 500 && error.code !== "IMPORT_DISABLED")))
      return { error: "连接中断或服务异常，暂时无法确认创建结果。输入和文件已保留，请重试本次提交，系统不会重复建档。", retryOnly: true };
    return { error: errorState(error).error };
  }
}
