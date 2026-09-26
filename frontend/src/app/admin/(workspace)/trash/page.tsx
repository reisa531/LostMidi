import { ApiError } from "@/lib/api/client";
import { adminRequest } from "@/lib/admin/auth";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";
import { RestoreButton } from "@/components/admin/restore-button";
import { PurgeButton } from "@/components/admin/purge-button";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata = { title: "回收站" };

type TrashItem = { entity_type: "midi" | "person"; entity_id: string; entity_label: string; deleted_at: string; deleted_by: string };
type AuditItem = { actor: string; action: "delete" | "restore" | "purge"; entity_type: "midi" | "person"; entity_id: string; entity_label: string; created_at: string };
type TrashPage = { data: TrashItem[]; audit: AuditItem[]; pagination: { total: number } };

export default async function TrashPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const admin = await requireAdmin();
  const raw = (await searchParams).page ?? "1";
  if (typeof raw !== "string" || !/^[1-9]\d{0,5}$/.test(raw))
    return <p>页码无效。<Link href="/admin/trash" className="archive-link">返回回收站第一页</Link></p>;
  const page = Number(raw);
  let result: TrashPage;
  try { result = await adminRequest<TrashPage>(`/api/v1/admin/trash?page=${page}&pageSize=20`); }
  catch (error) { if (error instanceof ApiError) return <><AdminPageHeader eyebrow="档案 / 回收站" title="回收站" description="已删除记录会保留原始关联和文件，可在此恢复。" /><AdminUnavailable /></>; throw error; }
  return <><AdminPageHeader eyebrow="档案 / 回收站" title="回收站与操作记录" description={admin.role === "admin" ? "可提交恢复申请，由超级管理员审核；最近的删除与恢复操作会记录在这里。" : "已删除记录会保留原始关联和文件，可在此恢复；最近的删除与恢复操作也会记录在这里。"} />
    <AdminPanel title={`保留中的记录 · ${result.pagination.total}`}>
      {result.data.length ? <ul className="divide-y divide-line">{result.data.map(item => <li key={`${item.entity_type}-${item.entity_id}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0"><p className="break-words font-medium">{item.entity_label}</p><p className="mt-1 text-xs text-muted">{item.entity_type === "midi" ? "MIDI 档案" : "人物"} · 编号 {item.entity_id} · {new Date(item.deleted_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · 操作人 {item.deleted_by}</p></div>
        <div className="flex flex-wrap items-end gap-3"><RestoreButton type={item.entity_type} id={item.entity_id} reviewRequired={admin.role === "admin"} />{admin.role === "super_admin" && <PurgeButton type={item.entity_type} id={item.entity_id} />}</div>
      </li>)}</ul> : <p className="py-8 text-center text-sm text-muted">{page > 1 ? "本页没有记录，请返回第一页。" : "回收站为空。"}</p>}
    </AdminPanel>
    <nav aria-label="回收站分页" className="my-6 flex flex-wrap justify-between gap-4 text-sm"><span className="text-muted">第 {page} 页 · 共 {Math.max(1, Math.ceil(result.pagination.total / 20))} 页</span><div className="flex gap-5">{page > 1 && <Link href="/admin/trash" className="archive-link">第一页</Link>}{page > 1 && <Link href={`/admin/trash?page=${page - 1}`} className="archive-link">上一页</Link>}{page * 20 < result.pagination.total && <Link href={`/admin/trash?page=${page + 1}`} className="archive-link">下一页</Link>}</div></nav>
    <AdminPanel title="最近操作 · 最多 50 条">
      {result.audit.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><caption className="sr-only">后台删除与恢复操作记录</caption><thead className="border-b border-line text-xs text-muted"><tr>{["时间（UTC）", "操作", "记录", "操作人"].map(label => <th key={label} scope="col" className="px-3 py-3 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.audit.map((item, index) => <tr key={`${item.entity_type}-${item.entity_id}-${item.action}-${item.created_at}-${index}`}><td className="px-3 py-3 text-xs text-muted">{new Date(item.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })}</td><td className="px-3 py-3">{item.action === "delete" ? "移入回收站" : item.action === "purge" ? "彻底删除" : "恢复"}</td><td className="px-3 py-3">{item.entity_label}<span className="ml-2 text-xs text-muted">{item.entity_type === "midi" ? "MIDI" : "人物"} #{item.entity_id}</span></td><td className="px-3 py-3">{item.actor}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-muted">暂无删除或恢复记录。</p>}
    </AdminPanel>
  </>;
}
