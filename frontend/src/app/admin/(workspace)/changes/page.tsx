import { AdminPageHeader, AdminPanel } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";
import { getChangeRequests, reviewChangeAction } from "@/lib/admin/review-actions";
import { adminRequest } from "@/lib/admin/auth";
import type { MidiEntry } from "@/lib/api/types";
import type { PersonEdit } from "@/lib/admin/people";
import type { HistoryEdit } from "@/lib/admin/history";

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
const fieldLabels: Record<string, string> = {
  title: "标题", slug: "公开地址", description: "描述", estimated_year: "推测年份", estimated_date: "推测日期",
  archive_status: "归档状态", copyright_status: "版权状态", distribution_permission: "分发许可",
  license: "许可证", rights_holder: "权利人", display_name: "显示名称", biography: "人物简介",
  summary: "一句话摘要", aliases: "历史昵称", profile: "人物资料", website_name: "网站名称",
  original_url: "原始网址", wayback_url: "存档网址", first_seen_at: "首次记录时间",
  last_seen_at: "最后记录时间", source_type: "来源类型", credibility: "人工可信度",
  checked_at: "最近核验时间", notes: "备注", recovered_at: "寻回时间",
  recovered_by_name: "寻回人", story: "寻回经过", evidence: "证据说明",
  credits: "作品署名", filename: "文件名", rights_confirmed: "公开分发确认",
  country: "国家", activeTime: "活动时间", sameAs: "相关链接", collaborators: "合作者",
};
const ignoredFields = new Set(["revision", "request_id", "record_id", "content_base64"]);
function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "（空）";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}
function fieldsOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
async function currentFor(request: { type: string; entity_id: number | null }, cache: Map<string, Record<string, unknown> | null>) {
  if (!request.entity_id || !request.type.endsWith("update")) return null;
  const kind = request.type.split(".")[0];
  const key = `${kind}:${request.entity_id}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  let current: Record<string, unknown> | null = null;
  try {
    if (kind === "midi") current = await adminRequest<MidiEntry>(`/api/v1/admin/midis/${request.entity_id}`) as unknown as Record<string, unknown>;
    else if (kind === "person") {
      const person = await adminRequest<PersonEdit>(`/api/v1/admin/people/${request.entity_id}`);
      current = { ...person.person, aliases: person.aliases };
    } else if (kind === "history") {
      const history = await adminRequest<HistoryEdit>(`/api/v1/admin/midis/${request.entity_id}/history`);
      current = { historical_sources: history.historical_sources, recovery_events: history.recovery_events };
    }
  } catch { /* Show proposed fields even when the current record is unavailable. */ }
  cache.set(key, current);
  return current;
}
function ReviewFields({ request, payload, current }: { request: { type: string }; payload: unknown; current: Record<string, unknown> | null }) {
  const proposed = fieldsOf(payload);
  const historyKind = request.type.startsWith("history.source") ? "historical_sources" : request.type.startsWith("history.event") ? "recovery_events" : "";
  const existing = historyKind ? (Array.isArray(current?.[historyKind]) ? (current[historyKind] as Record<string, unknown>[]).find(item => String(item.id) === String(proposed.record_id)) ?? null : null) : current;
  const rows = Object.entries(proposed).filter(([key]) => !ignoredFields.has(key) && key !== "file")
    .flatMap(([key, value]) => key === "profile" ? Object.entries(fieldsOf(value)).map(([field, fieldValue]) => ({ key: field, value: fieldValue, before: fieldsOf(existing?.profile)[field] })) : [{ key, value, before: existing?.[key] }])
    .filter(row => !existing || JSON.stringify(row.before) !== JSON.stringify(row.value));
  const deletion = request.type.endsWith(".delete");
  const restore = request.type.endsWith(".restore");
  return <div className="mt-4 space-y-3 text-sm">
    {(deletion || restore) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-medium text-amber-950">{deletion ? "批准后会删除这条记录。" : "批准后会恢复这条记录。"}请核对记录编号和版本。</p>}
    {rows.length > 0 && <dl className="divide-y divide-line rounded-lg border border-line">{rows.map(({ key, value, before }) => <div key={key} className="grid gap-2 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt className="font-medium">{fieldLabels[key] ?? key}</dt><dd className="min-w-0 space-y-1 break-words">{existing && <p className="whitespace-pre-wrap text-muted">原值：{valueText(before)}</p>}<p className="whitespace-pre-wrap">拟改为：{valueText(value)}</p></dd></div>)}</dl>}
    {!rows.length && !deletion && !restore && <p className="text-muted">此申请没有可显示的文字字段；请展开原始申请核对附件或记录编号。</p>}
    {Boolean(proposed.file) && <p className="rounded-lg bg-background p-3">同时提交文件：{valueText(fieldsOf(proposed.file).filename)}</p>}
  </div>;
}

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

export default async function ChangeReviewPage({ searchParams }: { searchParams: Promise<{ submitted?: string }> }) {
  const admin = await requireAdmin();
  const { submitted } = await searchParams;
  const requests = await getChangeRequests();
  const currentCache = new Map<string, Record<string, unknown> | null>();
  const currentRecords: (Record<string, unknown> | null)[] = [];
  for (let start = 0; start < requests.length; start += 6)
    currentRecords.push(...await Promise.all(requests.slice(start, start + 6).map(request =>
      admin.role === "super_admin" && request.status === "pending" ? currentFor(request, currentCache) : Promise.resolve(null)
    )));
  return <>
    <AdminPageHeader eyebrow="审核" title="内容审核" description={admin.role === "super_admin" ? "审核管理员提交的内容申请。批准后会执行申请并按对应权限公开。" : "查看自己提交的内容申请及审核结果。"} />
    {submitted === "1" && <p role="status" className="mb-6 rounded-lg bg-amber-50 p-4 text-sm text-amber-950">申请已提交，超级管理员审核通过后才会执行。</p>}
    <div className="space-y-4">
      {requests.length === 0 ? <AdminPanel title="审核队列"><p className="text-sm text-muted">目前没有变更申请。</p></AdminPanel> : requests.map((request, index) => {
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
          <ReviewFields request={request} payload={payload} current={currentRecords[index]} />
          <details className="mt-3"><summary className="cursor-pointer text-xs text-muted">查看原始申请字段</summary><pre className="mt-2 overflow-auto rounded bg-background p-4 text-xs leading-6">{JSON.stringify(payload, null, 2)}</pre></details>
          {request.review_note && <p className="mt-3 text-sm text-muted">审核备注：{request.review_note}</p>}
        </AdminPanel>;
      })}
    </div>
  </>;
}
