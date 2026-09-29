import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { ReviewComparison } from "@/components/admin/review-comparison";
import { requireAdmin } from "@/lib/admin/auth";
import { getOwnSubmissions } from "@/lib/admin/review-actions";

export const metadata = { title: "我的申请" };

const statuses: Record<string, string> = {
  pending: "待审核", reviewing: "审核执行中", approved: "已批准", rejected: "已拒绝",
  stale: "版本已过期", failed: "执行失败",
};
const labels: Record<string, string> = {
  "midi.create": "新增音乐条目", "midi.update": "修改音乐条目", "midi.delete": "删除音乐条目", "midi.restore": "恢复音乐条目",
  "person.create": "新增人物", "person.update": "修改人物", "person.delete": "删除人物", "person.restore": "恢复人物",
  "credits.update": "修改作品署名", "history.source.create": "新增历史来源", "history.source.update": "修改历史来源", "history.source.delete": "删除历史来源",
  "history.event.create": "新增寻回记录", "history.event.update": "修改寻回记录", "history.event.delete": "删除寻回记录",
  "evidence.upload": "上传历史证据附件", "evidence.delete": "删除历史证据附件",
  "file.import": "导入音乐文件", "file.visibility": "修改文件下载权限", "file.delete": "移除音乐文件",
};

export default async function SubmissionsPage({ searchParams }: { searchParams: Promise<{ submitted?: string; page?: string; status?: string }> }) {
  const admin = await requireAdmin();
  if (admin.role === "super_admin") redirect("/admin/changes");
  const { submitted, page: rawPage, status: rawStatus } = await searchParams;
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000000 ? Number(rawPage) : 1;
  const status = ["all", "pending", "reviewing", "failed", "approved", "rejected", "stale"].includes(rawStatus ?? "") ? rawStatus! : "all";
  const response = await getOwnSubmissions(page, status).catch(() => null);
  const result = response && Array.isArray(response.data) && typeof response.pagination?.total === "number" ? response : null;
  return <>
    <AdminPageHeader eyebrow="工作台 / 我的申请" title="我的申请" description="查看自己提交的档案变更及审核结果；只有超级管理员可以批准或拒绝申请。" />
    {submitted === "1" && <p role="status" className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">申请已提交，超级管理员审核通过后才会执行。</p>}
    {!result ? <AdminPanel title="申请暂不可读取"><p role="alert" className="text-sm text-muted">请稍后重新加载；如果问题持续，请确认后端已更新到包含申请查询接口的版本。</p></AdminPanel> : <>
      <nav aria-label="申请状态" className="mb-5 flex flex-wrap gap-2 text-sm">{[["all", "全部"], ["pending", "待审核"], ["approved", "已批准"], ["failed", "执行失败"]].map(([value, label]) => <Link key={value} href={`/admin/submissions?status=${value}`} aria-current={status === value ? "page" : undefined} className={`rounded-lg border px-3 py-2 ${status === value ? "border-accent bg-accent text-white" : "border-line"}`}>{label}</Link>)}</nav>
      <p className="mb-4 text-sm text-muted">共 {result.pagination.total} 项 · 第 {page} 页</p>
      <div className="space-y-4">{result.data.length ? result.data.map(request => {
        let payload: unknown = request.payload;
        try { payload = JSON.parse(request.payload); } catch { /* Keep malformed stored text visible. */ }
        return <AdminPanel key={request.id} title={labels[request.type] ?? request.type}>
          <p className="text-xs text-muted">{new Date(request.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · {statuses[request.status] ?? request.status}</p>
          <ReviewComparison type={request.type} entityId={request.entity_id} payload={payload} canCompare={false} />
          {request.status === "failed" && <p className="mt-3 text-sm text-amber-900">执行失败。请根据审核备注核对档案版本和字段，修改后重新提交。</p>}
          {request.review_note && <p className="mt-3 text-sm text-muted">审核备注：{request.review_note}</p>}
        </AdminPanel>;
      }) : <AdminPanel title="我的申请"><p className="text-sm text-muted">{page > 1 ? "本页没有申请，请返回第一页。" : "当前筛选下没有申请。"}</p></AdminPanel>}</div>
      <nav aria-label="申请分页" className="mt-6 flex gap-5 text-sm">{page > 1 && <Link className="underline" href={`/admin/submissions?status=${status}&page=${page - 1}`}>上一页</Link>}{page * result.pagination.pageSize < result.pagination.total && <Link className="underline" href={`/admin/submissions?status=${status}&page=${page + 1}`}>下一页</Link>}{page > 1 && !result.data.length && <Link className="underline" href={`/admin/submissions?status=${status}`}>返回第一页</Link>}</nav>
    </>}
  </>;
}
