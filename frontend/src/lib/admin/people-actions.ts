"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { adminRequest } from "./auth";
import { getPeople, type PersonEdit } from "./people";
import { ApiError } from "@/lib/api/client";

async function checkOrigin() {
  if (!process.env.ADMIN_ORIGIN || (await headers()).get("origin") !== process.env.ADMIN_ORIGIN)
    throw new ApiError(403, "INVALID_ORIGIN");
}
function idOf(value: FormDataEntryValue | null) {
  const id = String(value ?? "");
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) throw new ApiError(400, "INVALID_INPUT");
  return id;
}
function errorMessage(error: unknown) {
  const messages: Record<string, string> = {
    UNAUTHORIZED: "会话已过期。请在新页面登录后重试。",
    INVALID_ORIGIN: "请求来源与后台配置不一致，请检查访问地址。",
    INVALID_INPUT: "请检查必填项、文字长度和重复的昵称或署名。",
    STALE_PERSON: "人物资料已被其他页面修改，请保留当前输入，重新打开编辑页后合并修改。",
    STALE_ENTRY: "作品资料已被其他页面修改，请保留当前输入，重新打开页面后合并修改。",
    UNKNOWN_PERSON: "所选人物已不存在，请重新选择。", PERSON_NOT_FOUND: "人物资料已不存在。", MIDI_NOT_FOUND: "作品档案已不存在。",
  };
  return error instanceof ApiError ? messages[error.code] ?? "服务暂时不可用，请稍后重试。" : "请求失败，请稍后重试。";
}
export async function savePersonAction(_previous: { error: string }, form: FormData) {
  let saved: PersonEdit | { request_id: string; status: "pending" };
  try {
    await checkOrigin();
    const id = form.get("id") ? idOf(form.get("id")) : "";
    const aliases = String(form.get("aliases") ?? "").split(/\r?\n/).map(alias => alias.trim()).filter(Boolean);
    const lines = (name: string) => String(form.get(name) ?? "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    const columns = (name: string) => lines(name).map(line => line.split("|").map(part => part.trim()));
    const field = (parts: string[], index: number) => parts[index] || null;
    const aliasDetails = lines("alias_details").map(line => { const [name, note = "", period = "", source = ""] = line.split("|").map(part => part.trim()); return { name, note, period: period || null, source: source || null }; });
    const current = id ? await adminRequest<PersonEdit>(`/api/v1/admin/people/${id}`) : null;
    if (current && current.person.revision !== Number(form.get("revision"))) throw new ApiError(409, "STALE_PERSON");
    const existing = current?.person.profile ?? {};
    const profile = {
      ...existing,
      country: String(form.get("country") ?? "").trim() || null,
      activeTime: String(form.get("active_time") ?? "").trim() || null,
      sameAs: lines("same_as"),
      collaborators: columns("collaborators").map(p => ({ name: p[0] || "", personId: field(p,1), source: field(p,2) })),
      aliasDetails: aliasDetails.filter(item => aliases.includes(item.name)),
    };
    saved = await adminRequest<PersonEdit>(`/api/v1/admin/people${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: String(form.get("display_name") ?? ""), biography: String(form.get("biography") ?? "") || null, summary: String(form.get("summary") ?? "") || null, profile, aliases,
        ...(id ? { revision: Number(form.get("revision")) } : {}) }),
    });
  } catch (error) { return { error: errorMessage(error) }; }
  if ("request_id" in saved) redirect("/admin/changes?submitted=1");
  redirect(`/admin/people/${saved.person.id}/edit?saved=1`);
}
export async function loadPeopleAction(page: number) {
  await checkOrigin();
  if (!Number.isInteger(page) || page < 1 || page > 1000000) throw new ApiError(400, "INVALID_INPUT");
  return getPeople(page);
}
export async function saveCreditsAction(_previous: { error: string }, form: FormData) {
  let id: string;
  let queued = false;
  try {
    await checkOrigin();
    id = idOf(form.get("midi_id"));
    const session = await adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session");
    const people = form.getAll("person_id");
    const roles = form.getAll("role");
    if (people.length !== roles.length) throw new ApiError(400, "INVALID_INPUT");
    const result = await adminRequest<{ request_id?: string }>(`/api/v1/admin/midis/${id}/credits`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: Number(form.get("revision")), credits: people.map((person, index) => ({ person_id: idOf(person), role: String(roles[index]) })) }),
    });
    queued = session.role === "admin" && "request_id" in result;
  } catch (error) { return { error: errorMessage(error) }; }
  if (queued) redirect("/admin/changes?submitted=1");
  redirect(`/admin/midis/${id}/credits?saved=1`);
}
