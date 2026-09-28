"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { adminRequest } from "./auth";

async function checkOrigin() {
  if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN) throw new Error("请求来源无效。");
}
export async function saveUsefulLink(form: FormData) {
  await checkOrigin();
  const id = String(form.get("id") ?? "");
  if (id && !/^[1-9]\d*$/.test(id)) throw new Error("网址编号无效。");
  const title = String(form.get("title") ?? "").trim();
  const url = String(form.get("url") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const sort_order = Number(form.get("sort_order") ?? 0);
  const parsed = new URL(url);
  if (!title || title.length > 120 || !["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || !Number.isInteger(sort_order) || description.length > 500)
    throw new Error("请检查网址资料。");
  await adminRequest(`/api/v1/admin/useful-links${id ? `/${id}` : ""}`, {
    method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, url, description, sort_order }),
  });
  revalidatePath("/about"); revalidatePath("/admin/useful-links");
}
export async function deleteUsefulLink(form: FormData) {
  await checkOrigin();
  const id = String(form.get("id") ?? "");
  if (!/^[1-9]\d*$/.test(id)) throw new Error("网址编号无效。");
  await adminRequest(`/api/v1/admin/useful-links/${id}`, { method: "DELETE" });
  revalidatePath("/about"); revalidatePath("/admin/useful-links");
}
