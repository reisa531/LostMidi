import Link from "next/link";
import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getChangeRequests } from "@/lib/admin/review-actions";
import { CloseFailedForm, ReviewForm } from "@/components/admin/review-form";
import { ReviewComparison } from "@/components/admin/review-comparison";

const labels: Record<string, string> = {
  "midi.create": "新增 MIDI 档案", "midi.update": "修改 MIDI 档案", "person.create": "新增人物",
  "midi.delete": "删除 MIDI 档案", "midi.restore": "恢复 MIDI 档案", "person.update": "修改人物",
  "person.delete": "删除人物", "person.restore": "恢复人物", "credits.update": "修改作品署名",
  "history.source.create": "新增历史来源", "history.source.update": "修改历史来源", "history.source.delete": "删除历史来源",
  "history.event.create": "新增寻回记录", "history.event.update": "修改寻回记录", "history.event.delete": "删除寻回记录",
  "evidence.upload": "上传历史证据附件", "file.import": "导入音乐文件",
};
const statusLabels: Record<string, string> = {
  pending: "待审核", reviewing: "审核执行中", approved: "已批准", rejected: "已拒绝",
  stale: "版本已过期", failed: "执行失败",
};
function reviewPayload(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const payload = { ...(raw as Record<string, unknown>) };
  for (const key of ["content_base64"]) {
    const value = payload[key];
    if (typeof value === "string") payload[key] = `[已提交附件 ${String(payload.filename ?? "")}，${Math.floor(value.length * 3 / 4).toLocaleString("zh-CN")} 字节，SHA-256 ${String(payload.sha256 ?? "由审批时复核")}]`;
  }
  const file = payload.file;
  if (file && typeof file === "object" && !Array.isArray(file)) {
    const clean = { ...(file as Record<string, unknown>) };
    if (typeof clean.content_base64 === "string") clean.content_base64 = `[音乐文件，${Math.floor(clean.content_base64.length * 3 / 4).toLocaleString("zh-CN")} 字节，审批时验证]`;
    payload.file = clean;
  }
  return payload;
}

export default async function ChangeReviewPage({ searchParams }: { searchParams: Promise<{ submitted?: string; page?: string; status?: string }> }) {
  const admin = await requireAdmin();
  const { submitted, page: rawPage, status: rawStatus } = await searchParams;
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) && Number(rawPage) <= 1000000 ? Number(rawPage) : 1;
  const status = ["all", "pending", "reviewing", "failed", "approved", "rejected", "stale"].includes(rawStatus ?? "") ? rawStatus! : admin.role === "super_admin" ? "pending" : "all";
  const result = await getChangeRequests(page, status);
  const requests = result.data;
  return <>
    <AdminPageHeader eyebrow="审核" title="内容审核" description={admin.role === "super_admin" ? "审核管理员提交的内容申请。批准后会执行申请并按对应权限公开。" : "查看自己提交的内容申请及审核结果。"} />
    {submitted === "1" && <p role="status" className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">申请已提交，超级管理员审核通过后才会执行。</p>}
    <nav aria-label="审核状态" className="mb-5 flex flex-wrap gap-2 text-sm">{[["pending", "待审核"], ["reviewing", "执行中"], ["failed", "执行失败"], ["all", "全部"]].map(([value, label]) => <Link key={value} href={`/admin/changes?status=${value}`} aria-current={status === value ? "page" : undefined} className={`rounded-lg border px-3 py-2 ${status === value ? "border-accent bg-accent text-white" : "border-line"}`}>{label}</Link>)}</nav>
    <p className="mb-4 text-sm text-muted">共 {result.pagination.total} 项 · 第 {page} 页</p>
    <div className="space-y-4">
      {requests.length === 0 ? <AdminPanel title="审核队列"><p className="text-sm text-muted">{page > 1 ? "本页没有申请，请返回第一页。" : "当前筛选下没有变更申请。"}</p></AdminPanel> : requests.map(request => {
        let payload: unknown = request.payload;
        try { payload = reviewPayload(JSON.parse(request.payload)); } catch { /* preserve the stored text for diagnosis */ }
        return <AdminPanel key={request.id} title={labels[request.type] ?? request.type}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-muted">提交者 {request.proposed_by} · {new Date(request.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · {statusLabels[request.status] ?? request.status}</p></div>
            {admin.role === "super_admin" && request.status === "pending" && <ReviewForm id={request.id} />}
          </div>
          <ReviewComparison type={request.type} entityId={request.entity_id} payload={payload} canCompare={admin.role === "super_admin" && request.status === "pending"} />
          {request.status === "failed" && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>执行未成功。请根据审核备注核对原档案版本和字段；需要修改时请在原档案重新提交申请。</p>{admin.role === "super_admin" && <CloseFailedForm id={request.id} />}</div>}
          <details className="mt-3"><summary className="cursor-pointer text-xs text-muted">查看原始申请字段</summary><pre className="mt-2 overflow-auto rounded bg-background p-4 text-xs leading-6">{JSON.stringify(payload, null, 2)}</pre></details>
          {request.review_note && <p className="mt-3 text-sm text-muted">审核备注：{request.review_note}</p>}
        </AdminPanel>;
      })}
    </div>
    <nav aria-label="审核分页" className="mt-6 flex gap-5 text-sm">{page > 1 && <Link href={`/admin/changes?status=${status}&page=${page - 1}`} className="underline">上一页</Link>}{page * result.pagination.pageSize < result.pagination.total && <Link href={`/admin/changes?status=${status}&page=${page + 1}`} className="underline">下一页</Link>}{page > 1 && !requests.length && <Link href={`/admin/changes?status=${status}`} className="underline">返回第一页</Link>}</nav>
  </>;
}
