"use server";

import { revalidatePath } from "next/cache";
import { adminRequest } from "./auth";

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

export async function getChangeRequests() {
  return adminRequest<ChangeRequest[]>("/api/v1/admin/changes");
}

export async function reviewChangeAction(form: FormData) {
  const id = String(form.get("id") ?? "");
  const decision = String(form.get("decision") ?? "");
  const note = String(form.get("note") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id) || !["approve", "reject"].includes(decision)) throw new Error("Invalid review request");
  await adminRequest(`/api/v1/admin/changes/${id}/review`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, note }),
  });
  revalidatePath("/admin/changes");
}
