import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import type { HistoryEdit } from "@/lib/admin/history";
import { ApiError } from "@/lib/api/client";
import { HistoryForm } from "@/components/admin/history-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { MidiSectionNav } from "@/components/admin/midi-section-nav";

export const metadata = { title: "来源与寻回" };

export default async function HistoryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string; evidence?: string }>;
}) {
  const session = await adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session");
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let history: HistoryEdit | undefined;
  let failureStatus = 0;
  try {
    history = await adminRequest<HistoryEdit>(`/api/v1/admin/midis/${id}/history`);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    failureStatus = error.status;
  }
  if (failureStatus === 401) redirect("/admin/login");
  if (failureStatus === 404) notFound();
  if (!history) return <AdminUnavailable />;
  const { saved, deleted, evidence } = await searchParams;
  const reviewRequired = session.role === "admin";
  return <>
    <AdminPageHeader eyebrow={`档案 / ${id} / 历史`} title={`来源与寻回 · ${history.entry.title}`} description={reviewRequired ? "新增、修改、删除和证据附件会提交给超级管理员审核，通过后才公开。" : "按作品整理历史网站、存档线索、寻回经过与证据。每次只维护一条记录，保存或删除后立即反映到公开详情。"} />
    <MidiSectionNav id={id} publicId={history.entry.slug} current="history" />
    {session.role === "super_admin" && (saved === "1" || deleted === "1") && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">{deleted === "1" ? "本条记录已删除，公开详情已更新。" : "本条记录已保存并公开。"}</p>}
    {evidence === "uploaded" && session.role === "super_admin" && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">证据附件已保存并公开。</p>}
    <HistoryForm key={`${id}-${history.entry.revision}`} history={history} reviewRequired={reviewRequired} />
  </>;
}
