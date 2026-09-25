"use server";

import { headers } from "next/headers";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";

export type RestoreState = { error: string; restoredId?: string };

export async function restoreTrashAction(_previous: RestoreState, form: FormData): Promise<RestoreState> {
  const type = form.get("type"), id = form.get("id");
  try {
    if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
      throw new ApiError(403, "INVALID_ORIGIN");
    if ((type !== "midi" && type !== "person") || typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) ||
        BigInt(id) > BigInt("9223372036854775807") || form.getAll("type").length !== 1 || form.getAll("id").length !== 1)
      throw new ApiError(400, "INVALID_INPUT");
    const result = await adminRequest<{ restored_id: string }>(`/api/v1/admin/trash/${type}/${id}/restore`, { method: "POST", redirect: "error" });
    if (result.restored_id !== id) throw new ApiError(502, "INVALID_RESPONSE");
    return { error: "", restoredId: id };
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.code === "UNAUTHORIZED")) return { error: "会话已过期，请重新登录后恢复。" };
    if (error instanceof ApiError && error.status < 500) return { error: "此记录已恢复或不存在，请刷新回收站。" };
    return { error: "恢复失败，请刷新回收站后重试。" };
  }
}
