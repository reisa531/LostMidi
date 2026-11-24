"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { adminRequest } from "./auth";
import { ApiError } from "@/lib/api/client";

async function verifyOrigin() {
  if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN) throw new ApiError(403);
}
function feedback(error: unknown) {
  if (error instanceof ApiError && error.status === 409) return "另一位成员已修改设置，请刷新后合并修改。";
  if (error instanceof ApiError && error.status === 403) return "当前账号没有这项权限。";
  return "保存失败，请核对内容后重试。";
}
export async function saveDesk(_prev: string, form: FormData) {
  try {
    await verifyOrigin();
    const lines = (field: string) => String(form.get(field) ?? "").split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    const slides = lines("slides").map(line => {
      const bar = line.indexOf("|");
      if (bar < 1) throw new Error();
      return { title: line.slice(0,bar).trim(), href: line.slice(bar+1).trim() };
    });
    await adminRequest("/api/v1/admin/front-desk", { method: "PUT", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ slides, sayings: lines("sayings"), revision: Number(form.get("revision")) }) });
    revalidatePath("/"); revalidatePath("/admin/front-desk");
    return "栏目已保存。";
  } catch (error) { return feedback(error); }
}
export async function publishAnnouncement(_prev: string, form: FormData) {
  try {
    await verifyOrigin();
    await adminRequest("/api/v1/admin/announcements", { method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({title:String(form.get("title") ?? "").trim(),body:String(form.get("body") ?? "").trim()}) });
    revalidatePath("/"); revalidatePath("/admin/front-desk");
    return "公告已发布。";
  } catch (error) { return feedback(error); }
}
