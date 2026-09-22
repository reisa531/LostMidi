import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { getPeople, type PeopleList } from "@/lib/admin/people";
import type { HistoryEdit } from "@/lib/admin/history";
import { ApiError } from "@/lib/api/client";
import { HistoryForm } from "@/components/admin/history-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";

export const metadata = { title: "来源与寻回" };

export default async function HistoryPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; deleted?: string }>;
}) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let data: [HistoryEdit, PeopleList] | undefined;
  let failureStatus = 0;
  try {
    data = await Promise.all([adminRequest<HistoryEdit>(`/api/v1/admin/midis/${id}/history`), getPeople()]);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    failureStatus = error.status;
  }
  if (failureStatus === 401) redirect("/admin/login");
  if (failureStatus === 404) notFound();
  if (!data) return <AdminUnavailable />;
  const [history, people] = data;
  const { saved, deleted } = await searchParams;
  return <>
    <AdminPageHeader eyebrow={`Collection / ${id} / History`} title={`来源与寻回 · ${history.entry.title}`} description="按作品整理历史网站、存档线索、寻回经过与证据。每次只维护一条记录，保存或删除后立即反映到公开详情。" />
    <nav aria-label="作品相关页面" className="mb-6 flex flex-wrap gap-5 text-sm">
      <Link href={`/admin/midis/${id}/edit`} className="underline">返回作品编辑</Link>
      <Link href={`/midis/${history.entry.slug}`} target="_blank" rel="noopener noreferrer" className="underline">在新页面查看公开详情</Link>
    </nav>
    {(saved === "1" || deleted === "1") && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">{deleted === "1" ? "本条记录已删除，公开详情已更新。" : "本条记录已保存并公开。"}</p>}
    <HistoryForm key={`${id}-${history.entry.revision}`} history={history} people={people} />
  </>;
}
