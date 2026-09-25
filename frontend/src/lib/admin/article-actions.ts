"use server";
import { headers } from "next/headers";
import { ApiError } from "@/lib/api/client";
import { adminRequest } from "./auth";
import type { ArticleDetail } from "@/lib/api/articles";

export type ArticleSaveState = { error: string; savedId?: string };
function validateIds(raw: string, required: boolean) {
  const value: unknown = JSON.parse(raw);
  if (!Array.isArray(value) || value.length > 50 || (required && value.length === 0) ||
      !value.every(id => typeof id === "string" && /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807")) ||
      new Set(value).size !== value.length) throw new ApiError(400, "INVALID_INPUT");
  return value as string[];
}
async function checkOrigin() {
  if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
    throw new ApiError(403, "INVALID_ORIGIN");
}
export async function saveArticleAction(_previous: ArticleSaveState, form: FormData): Promise<ArticleSaveState> {
  try {
    await checkOrigin();
    const id = String(form.get("id") ?? "");
    if (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))
      throw new ApiError(400, "INVALID_INPUT");
    const title = String(form.get("title") ?? "").trim();
    const body = String(form.get("body_markdown") ?? "").trim();
    const status = String(form.get("status") ?? "");
    const midiIds = validateIds(String(form.get("midi_ids") ?? "[]"), true);
    const personIds = validateIds(String(form.get("person_ids") ?? "[]"), false);
    const revision = Number(form.get("revision") ?? 0);
    if (!title || !body || new TextEncoder().encode(title).length > 300 || new TextEncoder().encode(body).length > 100000 ||
        (status !== "draft" && status !== "published") || (id && (!Number.isSafeInteger(revision) || revision < 1)))
      throw new ApiError(400, "INVALID_INPUT");
    const article = await adminRequest<ArticleDetail>(id ? `/api/v1/admin/articles/${id}` : "/api/v1/admin/articles", {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body_markdown: body, status, midi_ids: midiIds, person_ids: personIds, ...(id ? { revision } : {}) }),
      redirect: "error",
    });
    return { error: "", savedId: article.id };
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ApiError && error.code === "INVALID_INPUT") return { error: "请填写标题、正文，并至少关联一条 MIDI 档案。" };
    if (error instanceof ApiError && error.code === "ARCHIVE_SUPER_ADMIN_REQUIRED") return { error: "关联已归档 MIDI 的文章仅限超级管理员修改。" };
    if (error instanceof ApiError && error.code === "STALE_ARTICLE") return { error: "文章已由其他页面修改，请重新打开后合并内容。" };
    if (error instanceof ApiError && error.code === "INVALID_ASSOCIATION") return { error: "关联的 MIDI 或人物已不存在，请刷新页面。" };
    if (error instanceof ApiError && error.status === 401) return { error: "会话已过期，请重新登录。" };
    return { error: "保存失败，请稍后重试。" };
  }
}
export async function deleteArticleAction(form: FormData) {
  await checkOrigin();
  const id = String(form.get("id") ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id) || form.get("confirm") !== "yes")
    throw new ApiError(400, "INVALID_INPUT");
  await adminRequest(`/api/v1/admin/articles/${id}`, { method: "DELETE", redirect: "error" });
}
