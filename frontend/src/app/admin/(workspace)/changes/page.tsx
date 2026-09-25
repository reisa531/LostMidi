import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getChangeRequests, reviewChangeAction } from "@/lib/admin/review-actions";

const labels: Record<string, string> = {
  "midi.create": "新增 MIDI 档案", "midi.update": "修改 MIDI 档案", "person.create": "新增人物",
  "person.update": "修改人物", "credits.update": "修改作品署名",
};

export default async function ChangeReviewPage() {
  const admin = await requireAdmin();
  const requests = await getChangeRequests();
  return <>
    <AdminPageHeader eyebrow="Review" title="内容审核" description={admin.role === "super_admin" ? "审核管理员提交的档案、人物与署名变更。批准后会立即发布。" : "查看自己提交的变更及审核结果。"} />
    <div className="space-y-4">
      {requests.length === 0 ? <AdminPanel title="审核队列"><p className="text-sm text-muted">目前没有变更申请。</p></AdminPanel> : requests.map(request => {
        let payload: unknown = request.payload;
        try { payload = JSON.parse(request.payload); } catch { /* preserve the stored text for diagnosis */ }
        return <AdminPanel key={request.id} title={labels[request.type] ?? request.type}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-xs text-muted">提交者 {request.proposed_by} · {new Date(request.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC · {request.status}</p></div>
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
