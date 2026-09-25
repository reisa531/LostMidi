import { ApiError } from "@/lib/api/client";
import { adminRequest } from "@/lib/admin/auth";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";
import { RestoreButton } from "@/components/admin/restore-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "回收站" };

type TrashItem = { entity_type: "midi" | "person"; entity_id: string; entity_label: string; deleted_at: string; deleted_by: string };
type AuditItem = { actor: string; action: "delete" | "restore"; entity_type: "midi" | "person"; entity_id: string; entity_label: string; created_at: string };
type TrashPage = { data: TrashItem[]; audit: AuditItem[]; pagination: { total: number } };

export default async function TrashPage() {
  const admin = await requireAdmin();
  let result: TrashPage;
  try { result = await adminRequest<TrashPage>("/api/v1/admin/trash?page=1&pageSize=100"); }
  catch (error) { if (error instanceof ApiError) return <><AdminPageHeader eyebrow="档案 / 回收站" title="回收站" description="已删除记录会保留原始关联和文件，可在此恢复。" /><AdminUnavailable /></>; throw error; }
  return <><AdminPageHeader eyebrow="档案 / 回收站" title="回收站与操作记录" description={admin.role === "admin" ? "可提交恢复申请，由超级管理员审核；最近的删除与恢复操作会记录在这里。" : "已删除记录会保留原始关联和文件，可在此恢复；最近的删除与恢复操作也会记录在这里。"} />
    <AdminPanel title={`保留中的记录 · ${result.pagination.total}`}>
      {result.data.length ? <ul className="divide-y divide-line">{result.data.map(item => <li key={`${item.entity_type}-${item.entity_id}`} className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div className="min-w-0"><p className="break-words font-medium">{item.entity_label}</p><p className="mt-1 text-xs text-muted">{item.entity_type === "midi" ? "MIDI 档案" : "人物"} · 编号 {item.entity_id} · {new Date(item.deleted_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · 操作人 {item.deleted_by}</p></div>
        <RestoreButton type={item.entity_type} id={item.entity_id} reviewRequired={admin.role === "admin"} />
      </li>)}</ul> : <p className="py-8 text-center text-sm text-muted">回收站为空。</p>}
    </AdminPanel>
    <AdminPanel title="最近操作 · 最多 50 条">
      {result.audit.length ? <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><caption className="sr-only">后台删除与恢复操作记录</caption><thead className="border-b border-line text-xs text-muted"><tr>{["时间（UTC）", "操作", "记录", "操作人"].map(label => <th key={label} scope="col" className="px-3 py-3 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.audit.map((item, index) => <tr key={`${item.entity_type}-${item.entity_id}-${item.action}-${item.created_at}-${index}`}><td className="px-3 py-3 text-xs text-muted">{new Date(item.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })}</td><td className="px-3 py-3">{item.action === "delete" ? "移入回收站" : "恢复"}</td><td className="px-3 py-3">{item.entity_label}<span className="ml-2 text-xs text-muted">{item.entity_type === "midi" ? "MIDI" : "人物"} #{item.entity_id}</span></td><td className="px-3 py-3">{item.actor}</td></tr>)}</tbody></table></div> : <p className="py-8 text-center text-sm text-muted">暂无删除或恢复记录。</p>}
    </AdminPanel>
  </>;
}
