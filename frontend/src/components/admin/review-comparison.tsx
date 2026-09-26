"use client";

import { useState } from "react";
import { getReviewCurrent } from "@/lib/admin/review-actions";

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
function ReviewFields({ type, payload, current }: { type: string; payload: unknown; current: Record<string, unknown> | null }) {
  const proposed = fieldsOf(payload);
  const historyKind = type.startsWith("history.source") ? "historical_sources" : type.startsWith("history.event") ? "recovery_events" : "";
  const existing = historyKind ? (Array.isArray(current?.[historyKind]) ? (current[historyKind] as Record<string, unknown>[]).find(item => String(item.id) === String(proposed.record_id)) ?? null : null) : current;
  const rows = Object.entries(proposed).filter(([key]) => !ignoredFields.has(key) && key !== "file")
    .flatMap(([key, value]) => key === "profile" ? Object.entries(fieldsOf(value)).map(([field, fieldValue]) => ({ key: field, value: fieldValue, before: fieldsOf(existing?.profile)[field] })) : [{ key, value, before: existing?.[key] }])
    .filter(row => !existing || JSON.stringify(row.before) !== JSON.stringify(row.value));
  const deletion = type.endsWith(".delete");
  const restore = type.endsWith(".restore");
  return <div className="mt-4 space-y-3 text-sm">
    {(deletion || restore) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 font-medium text-amber-950">{deletion ? "批准后会删除这条记录。" : "批准后会恢复这条记录。"}请核对记录编号和版本。</p>}
    {rows.length > 0 && <dl className="divide-y divide-line rounded-lg border border-line">{rows.map(({ key, value, before }) => <div key={key} className="grid gap-2 p-3 sm:grid-cols-[10rem_minmax(0,1fr)]"><dt className="font-medium">{fieldLabels[key] ?? key}</dt><dd className="min-w-0 space-y-1 break-words">{existing && <p className="whitespace-pre-wrap text-muted">原值：{valueText(before)}</p>}<p className="whitespace-pre-wrap">拟改为：{valueText(value)}</p></dd></div>)}</dl>}
    {!rows.length && !deletion && !restore && <p className="text-muted">此申请没有可显示的文字字段；请展开原始申请核对附件或记录编号。</p>}
    {Boolean(proposed.file) && <p className="rounded-lg bg-background p-3">同时提交文件：{valueText(fieldsOf(proposed.file).filename)}</p>}
  </div>;
}

export function ReviewComparison({ type, entityId, payload, canCompare }: { type: string; entityId: number | null; payload: unknown; canCompare: boolean }) {
  const [current, setCurrent] = useState<Record<string, unknown> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  if (!canCompare || !entityId || !["midi.update", "person.update", "history.source.update", "history.event.update"].includes(type))
    return <ReviewFields type={type} payload={payload} current={null} />;
  return <details className="mt-4" onToggle={event => {
    if (!event.currentTarget.open || loaded || loading) return;
    setLoading(true);
    getReviewCurrent(type, entityId).then(value => { setCurrent(value); setLoaded(true); setError(false); })
      .catch(() => { setLoaded(true); setError(true); })
      .finally(() => setLoading(false));
  }}>
    <summary className="cursor-pointer text-sm font-medium text-accent">展开字段对比</summary>
    {loading && <p role="status" className="mt-3 text-sm text-muted">正在加载原档案…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-amber-900">原档案暂时无法加载；请核对版本后再审核。</p>}
    {loaded && <ReviewFields type={type} payload={payload} current={current} />}
  </details>;
}
