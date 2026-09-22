"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/client";
import type { MidiDetail } from "@/lib/api/types";
import { adminRequest } from "./auth";

export type MidiFileImportState = {
  error: string;
  unauthorized?: boolean;
  result?: { fileId: string; filename: string; duplicate: boolean; revision: number };
};

function errorState(error: unknown): MidiFileImportState {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.code === "UNAUTHORIZED")
      return { error: "会话已过期。已保留所选文件，请在新页面登录后重试。", unauthorized: true };
    if (error.code === "FILE_OWNERSHIP_CONFLICT")
      return { error: "相同文件已归属于其他档案，不能导入到当前档案。请先刷新并核对档案归属，不要重复提交。" };
    if (error.status === 409 || error.code === "STALE_ENTRY")
      return { error: "作品版本或文件归属发生冲突。请先刷新，核对最新版本、已有文件及是否跨档案重复，不要直接重复提交。" };
    const messages: Record<string, string> = {
      INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
      INVALID_INPUT: "档案编号或版本不正确，请刷新页面核对。",
      INVALID_MIDI: "文件不是有效的 SMF 0、1 或 2 格式 MIDI，请检查文件内容。",
      FILE_TOO_LARGE: "文件超过大小限制；单个文件最大 1 MiB（1,048,576 字节）。",
      INVALID_FILE: "请选择一个非空的 .mid 或 .midi 文件，不支持 ZIP、批量或远程网址导入。",
      RIGHTS_CONFIRMATION_REQUIRED: "请先确认你有权将此文件私下归档。",
      STORAGE_UNAVAILABLE: "存储服务暂时不可用。请先刷新检查已存记录，核对后再决定是否重试。",
      IMPORT_DISABLED: "文件导入尚未启用或已暂停，请联系站点维护者；可刷新查看已有记录。",
      SERVER_BUSY: "服务繁忙，请先刷新检查已存记录，核对后再稍后重试。",
      MIDI_NOT_FOUND: "该作品档案已不存在，请返回作品列表核对。",
    };
    if (messages[error.code]) return { error: messages[error.code] };
    if (error.status === 413) return { error: messages.FILE_TOO_LARGE };
  }
  return { error: "请求超时、连接中断或服务异常，无法确认导入结果。请先刷新检查已存记录，再决定是否重试；文件可能已经保存。" };
}

export async function importMidiFileAction(_previous: MidiFileImportState, form: FormData): Promise<MidiFileImportState> {
  try {
    const expected = process.env.ADMIN_ORIGIN;
    if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
    await adminRequest("/api/v1/admin/session", { redirect: "error" });

    const id = form.get("id");
    const revision = form.get("revision");
    if (typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")
      || typeof revision !== "string" || !/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision)))
      throw new ApiError(400, "INVALID_INPUT");
    if (form.get("rights_confirmed") !== "true") throw new ApiError(400, "RIGHTS_CONFIRMATION_REQUIRED");
    const file = form.get("file");
    if (form.getAll("file").length !== 1 || !(file instanceof File) || !/\.midi?$/i.test(file.name) || file.size === 0)
      throw new ApiError(400, "INVALID_FILE");
    if (file.size > 1048576) throw new ApiError(413, "FILE_TOO_LARGE");

    const imported = await adminRequest<{ file: MidiDetail["files"][number]; duplicate: boolean; revision: number }>(`/api/v1/admin/midis/${id}/files`, {
      method: "POST", redirect: "error",
      headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name),
        "X-Entry-Revision": revision, "X-Rights-Confirmed": "true" },
      body: await file.arrayBuffer(),
    }, 60000);
    revalidatePath(`/admin/midis/${id}/files`);
    // Return only the result metadata needed by the form, never storage credentials or locations.
    return { error: "", result: { fileId: imported.file.id, filename: imported.file.original_filename,
      duplicate: imported.duplicate, revision: imported.revision } };
  } catch (error) { return errorState(error); }
}
