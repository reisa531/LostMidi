"use server";

import { headers } from "next/headers";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";

export type DeleteState = { error: string; deletedId?: string; unauthorized?: boolean };

export async function deleteEntryAction(_previous: DeleteState, form: FormData): Promise<DeleteState> {
  const resource = form.get("resource");
  const id = form.get("id");
  try {
    const expected = process.env.ADMIN_ORIGIN;
    if (!expected || (await headers()).get("origin") !== expected) throw new ApiError(403, "INVALID_ORIGIN");
    const revision = form.get("revision");
    if ((resource !== "midis" && resource !== "people")
      || typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")
      || typeof revision !== "string" || !/^[1-9]\d{0,18}$/.test(revision) || !Number.isSafeInteger(Number(revision))
      || ["resource", "id", "revision"].some(name => form.getAll(name).length !== 1))
      throw new ApiError(400, "INVALID_INPUT");
    if (form.getAll("confirmed").length !== 1 || form.get("confirmed") !== "true")
      throw new ApiError(400, "CONFIRMATION_REQUIRED");

    // Only the DELETE response may acknowledge an already absent record.
    try {
      const result = await adminRequest<{ deleted_id: string }>(`/api/v1/admin/${resource}/${id}`, {
        method: "DELETE", redirect: "error", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision: Number(revision) }),
      });
      if (result?.deleted_id !== id) throw new ApiError(502, "INVALID_RESPONSE");
    } catch (error) {
      const notFound = resource === "midis" ? "MIDI_NOT_FOUND" : "PERSON_NOT_FOUND";
      if (!(error instanceof ApiError && error.status === 404 && error.code === notFound)) throw error;
    }
    return { error: "", deletedId: id };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 401 || error.code === "UNAUTHORIZED")
        return { error: "会话已过期，请在新页面登录后重试；当前确认和错误会保留。", unauthorized: true };
      const messages: Record<string, string> = {
        INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
        INVALID_INPUT: "编号或版本不正确，请刷新编辑页并核对后重新确认删除。",
        CONFIRMATION_REQUIRED: "请先勾选确认，明确同意删除此记录。",
        STALE_ENTRY: "档案版本已变化，未执行删除。请先保留未保存的内容，刷新或重新打开编辑页，核对最新资料后重新确认删除；不要用旧版本直接重试。",
        STALE_PERSON: "人物版本已变化，未执行删除。请先保留未保存的内容，刷新或重新打开编辑页，核对最新资料后重新确认删除；不要用旧版本直接重试。",
        PERSON_IN_USE: "人物仍被作品署名或寻回记录引用，无法删除。请先手动解除所有相关引用，再重新打开编辑页确认；系统不会自动级联解除。",
      };
      if (messages[error.code]) return { error: messages[error.code] };
      if (error.status < 500) return { error: "删除失败，请在新页面核对记录后再重试。" };
    }
    return { error: "请求超时、连接中断或服务异常，无法确认删除结果，记录可能已删除。请先在新页面核对列表，再决定是否重试；重试时记录已不存在会视为删除完成。" };
  }
}
