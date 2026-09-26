"use server";

import { revalidatePath } from "next/cache";
import { adminRequest, requireAdmin } from "./auth";
import type { MidiEntry } from "@/lib/api/types";
import type { PersonEdit } from "./people";
import type { HistoryEdit } from "./history";

export type ChangeRequest = {
  id: string;
  type: string;
  entity_id: number | null;
  proposed_by: string;
  payload: string;
  status: string;
  review_note: string;
  created_at: string;
};

export type ChangeRequestPage = { data: ChangeRequest[]; pagination: { page: number; pageSize: number; total: number } };
export async function getChangeRequests(page: number, status: string) {
  return adminRequest<ChangeRequestPage>(`/api/v1/admin/changes?page=${page}&status=${encodeURIComponent(status)}`);
}

export async function getReviewCurrent(type: string, entityId: number) {
  const admin = await requireAdmin();
  if (admin.role !== "super_admin" || !Number.isSafeInteger(entityId) || entityId <= 0) throw new Error("无权查看原档案");
  if (type === "midi.update") return await adminRequest<MidiEntry>(`/api/v1/admin/midis/${entityId}`) as unknown as Record<string, unknown>;
  if (type === "person.update") {
    const person = await adminRequest<PersonEdit>(`/api/v1/admin/people/${entityId}`);
    return { ...person.person, aliases: person.aliases } as Record<string, unknown>;
  }
  if (type === "history.source.update" || type === "history.event.update") {
    const history = await adminRequest<HistoryEdit>(`/api/v1/admin/midis/${entityId}/history`);
    return { historical_sources: history.historical_sources, recovery_events: history.recovery_events } as Record<string, unknown>;
  }
  return null;
}

export async function reviewChangeAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["approve", "reject"].includes(decision)) throw new Error("Invalid review request");
  await adminRequest(`/api/v1/admin/changes/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }),
  }, 120_000);
  revalidatePath("/admin/changes");
}
export async function closeFailedChangeAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/.test(id) || !note || note.length > 2000) throw new Error("请填写关闭原因。");
  await adminRequest(`/api/v1/admin/changes/${id}/close`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note }),
  });
  revalidatePath("/admin/changes");
}
export async function reviewChangeState(_previous: { error: string; success: boolean }, form: FormData) {
  try { await reviewChangeAction(form); return { error: "", success: true }; }
  catch { return { error: "操作未完成。请检查申请状态、档案版本或连接后重试。", success: false }; }
}
export async function closeFailedChangeState(_previous: { error: string; success: boolean }, form: FormData) {
  try { await closeFailedChangeAction(form); return { error: "", success: true }; }
  catch { return { error: "关闭失败，请确认此申请仍为执行失败状态后重试。", success: false }; }
}
