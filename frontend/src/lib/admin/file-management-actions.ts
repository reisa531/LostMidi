"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";

export type FileManagementState = { error: string; queued?: boolean; done?: boolean; revision?: number };

function id(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807"))
    throw new Error("记录编号无效，请刷新页面。");
  return value;
}

export async function manageMusicFileAction(_: FileManagementState, form: FormData): Promise<FileManagementState> {
  try {
    if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
      throw new Error("请求来源不正确，请从后台页面重试。");
    const midiId = id(form.get("midi_id")), fileId = id(form.get("file_id"));
    const revision = Number(id(form.get("revision")));
    if (!Number.isSafeInteger(revision)) throw new Error("条目版本无效，请刷新页面。");
    const intent = form.get("intent");
    if (intent !== "visibility" && intent !== "delete") throw new Error("操作无效。");
    const setting = form.get("public_download_enabled");
    if (intent === "visibility" && setting !== "true" && setting !== "false") throw new Error("下载权限无效。");
    const result = await adminRequest<{ status?: string; request_id?: string; revision?: number }>(
      `/api/v1/admin/midis/${midiId}/files/${fileId}`,
      { method: intent === "delete" ? "DELETE" : "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(intent === "delete" ? { revision } : { revision, public_download_enabled: setting === "true" }) });
    revalidatePath(`/admin/midis/${midiId}/files`);
    revalidatePath(`/midis`);
    return result.status === "pending" && result.request_id
      ? { error: "", queued: true }
      : { error: "", done: true, revision: result.revision };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401) return { error: "会话已过期，请重新登录。" };
      if (error.status === 409) return { error: "条目已被其他操作修改，请刷新后重试。" };
      if (error.status === 404) return { error: "文件或条目已不存在，请刷新页面。" };
    }
    return { error: error instanceof Error && !(error instanceof ApiError) ? error.message : "操作失败，请稍后重试。" };
  }
}
