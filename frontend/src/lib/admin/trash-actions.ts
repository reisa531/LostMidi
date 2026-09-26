"use server";

import { headers } from "next/headers";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";

export type RestoreState = { error: string; restoredId?: string; queuedId?: string };

export async function restoreTrashAction(_previous: RestoreState, form: FormData): Promise<RestoreState> {
  const type = form.get("type"), id = form.get("id");
  try {
    if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
      throw new ApiError(403, "INVALID_ORIGIN");
    if ((type !== "midi" && type !== "person") || typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) ||
        BigInt(id) > BigInt("9223372036854775807") || form.getAll("type").length !== 1 || form.getAll("id").length !== 1)
      throw new ApiError(400, "INVALID_INPUT");
    const result = await adminRequest<{ restored_id?: string; request_id?: string; status?: string }>(`/api/v1/admin/trash/${type}/${id}/restore`, { method: "POST", redirect: "error" });
    if (result.status === "pending" && result.request_id) return { error: "", queuedId: id };
    if (result.restored_id !== id) throw new ApiError(502, "INVALID_RESPONSE");
    return { error: "", restoredId: id };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHORIZED")) return { error: "会话已过期，请重新登录后恢复。" };
    if (error instanceof ApiError && error.status < 500) return { error: "此记录已恢复或不存在，请刷新回收站。" };
    return { error: "恢复失败，请刷新回收站后重试。" };
  }
}

export type PurgeState = { error: string; purged?: boolean; cleanupPending?: boolean };
export async function purgeTrashAction(_previous: PurgeState, form: FormData): Promise<PurgeState> {
  try {
    if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
      throw new ApiError(403, "INVALID_ORIGIN");
    const type = String(form.get("type") ?? "");
    const id = String(form.get("id") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");
    if ((type !== "midi" && type !== "person") || !/^[1-9]\d{0,18}$/.test(id) ||
      BigInt(id) > BigInt("9223372036854775807") || confirmation !== `我确认删除档案编号${id}` ||
      form.getAll("type").length !== 1 || form.getAll("id").length !== 1 || form.getAll("confirmation").length !== 1)
      return { error: "请输入准确的确认文字。" };
    const result = await adminRequest<{ purged_id: string; cleanup_pending: boolean }>(`/api/v1/admin/trash/${type}/${id}/purge`, {
      method: "POST", body: JSON.stringify({ confirmation }), headers: { "Content-Type": "application/json" }, redirect: "error",
    });
    if (result.purged_id !== id) throw new ApiError(502, "INVALID_RESPONSE");
    return { error: "", purged: true, cleanupPending: result.cleanup_pending };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) return { error: "只有超级管理员可以彻底删除。" };
    if (error instanceof ApiError && error.code === "REVIEW_IN_PROGRESS") return { error: "该档案正在审核，请稍后重试。" };
    if (error instanceof ApiError && error.code === "ARTICLE_IN_USE") return { error: "该档案仍有关联文章，请先在文章管理中解除关联或删除相应文章，再重试。" };
    if (error instanceof ApiError && error.status === 404) return { error: "记录已不存在，请刷新页面。" };
    return { error: "彻底删除失败，请稍后重试。" };
  }
}
