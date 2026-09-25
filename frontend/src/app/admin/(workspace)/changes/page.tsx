import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getChangeRequests, reviewChangeAction } from "@/lib/admin/review-actions";

const labels: Record<string, string> = {
  "midi.create": "新增 MIDI 档案", "midi.update": "修改 MIDI 档案", "person.create": "新增人物",
  "midi.delete": "删除 MIDI 档案", "midi.restore": "恢复 MIDI 档案", "person.update": "修改人物",
  "person.delete": "删除人物", "person.restore": "恢复人物", "credits.update": "修改作品署名",
  "history.source.create": "新增历史来源", "history.source.update": "修改历史来源", "history.source.delete": "删除历史来源",
  "history.event.create": "新增寻回记录", "history.event.update": "修改寻回记录", "history.event.delete": "删除寻回记录",
  "evidence.upload": "上传历史证据附件", "file.import": "导入 MIDI 文件",
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
    if (typeof clean.content_base64 === "string") clean.content_base64 = `[MIDI 文件，${Math.floor(clean.content_base64.length * 3 / 4).toLocaleString("zh-CN")} 字节，审批时验证]`;
    payload.file = clean;
  }
  return payload;
}

export default async function ChangeReviewPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const admin = await requireAdmin();
  const { submitted } = await searchParams;
  const requests = await getChangeRequests();
  return <>
    <AdminPageHeader eyebrow="审核" title="内容审核" description={admin.role === "super_admin" ? "审核管理员提交的内容申请。批准后会执行申请并按对应权限公开。" : "查看自己提交的内容申请及审核结果。"} />
    {submitted === "1" && <p role="status" className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">申请已提交，超级管理员审核通过后才会执行。</p>}
    <div className="space-y-4">
      {requests.length === 0 ? <AdminPanel title="审核队列"><p className="text-sm text-muted">目前没有变更申请。</p></AdminPanel> : requests.map(request => {
        let payload: unknown = request.payload;
        try { payload = reviewPayload(JSON.parse(request.payload)); } catch { /* preserve the stored text for diagnosis */ }
        return <AdminPanel key={request.id} title={labels[request.type] ?? request.type}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-muted">提交者 {request.proposed_by} · {new Date(request.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · {statusLabels[request.status] ?? request.status}</p></div>
            {admin.role === "super_admin" && request.status === "pending" && <form action={reviewChangeAction} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={request.id} />
              <input name="note" maxLength={2000} placeholder="审核备注（可选）" className="rounded border border-line px-3 py-2 text-sm" />
              <button name="decision" value="reject" className="rounded border border-line px-3 py-2 text-sm">拒绝</button>
              <button name="decision" value="approve" className="rounded bg-accent px-3 py-2 text-sm text-white">批准并发布</button>
            </form>}
          </div>
          <pre className="mt-4 overflow-auto rounded bg-background p-4 text-xs leading-6">{JSON.stringify(payload, null, 2)}</pre>
          {request.review_note && <p className="mt-3 text-sm text-muted">审核备注：{request.review_note}</p>}
        </AdminPanel>;
      })}
    </div>
  </>;
}
