"use client";

import Link from "next/link";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { saveHistoryAction } from "@/lib/admin/history-actions";
import { uploadEvidenceAction } from "@/lib/admin/history-actions";
import { loadPeopleAction } from "@/lib/admin/people-actions";
import type { HistoricalSource, HistoryEdit, RecoveryEvent } from "@/lib/admin/history";
import type { PeopleList } from "@/lib/admin/people";
import { ExternalSource } from "@/components/archive";

type Selection = { kind: "source"; record?: HistoricalSource } | { kind: "event"; record?: RecoveryEvent };
const inputClass = "mt-2 block w-full min-w-0 max-w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
const buttonClass = "text-sm underline disabled:cursor-not-allowed disabled:opacity-50";
function localUTC(value: string | null | undefined) { return value?.replace(/Z$/, "") ?? ""; }
function utcLabel(value: string | null) { return value ? `${localUTC(value).replace("T", " ")} UTC` : "日期不详"; }

function UTCInput({ name, label, value, onChange }: { name: string; label: string; value: string; onChange: (value: string) => void }) {
  const helpId = useId();
  // Native datetime-local controls may reject more than three fractional digits.
  // Keep the full value separately, including when only the date or seconds change.
  const displayed = value.replace(/(\.\d{3})\d+$/, "$1");
  function change(next: string) {
    const oldFraction = value.split(".")[1] ?? "";
    const nextFraction = next.split(".")[1] ?? "";
    if (next && oldFraction.length > 3 && oldFraction.slice(0, 3) === nextFraction.padEnd(3, "0")) {
      const seconds = next.split(".")[0];
      onChange(`${seconds.length === 16 ? `${seconds}:00` : seconds}.${oldFraction}`);
    } else onChange(next);
  }
  return <label className="block min-w-0 text-sm">{label}（UTC，可留空）
    <input type="hidden" name={name} value={value} />
    <input type="datetime-local" step="any" className={inputClass} value={displayed} onChange={event => change(event.target.value)} aria-describedby={helpId} />
    <span id={helpId} className="mt-2 block text-xs leading-6 text-muted [overflow-wrap:anywhere]">{value ? `完整 UTC 值：${value}${value.length === 16 ? ":00" : ""}Z` : "留空表示日期不详。"}</span>
  </label>;
}

function HistoryRecordForm({ midiId, revision, selection, people, onCancel }: {
  midiId: string; revision: number; selection: Selection; people: PeopleList; onCancel: () => void;
}) {
  const source = selection.kind === "source" ? selection.record : undefined;
  const event = selection.kind === "event" ? selection.record : undefined;
  const label = selection.kind === "source" ? "历史来源" : "寻回记录";
  const [state, action, pending] = useActionState(saveHistoryAction, { error: "" });
  const [confirming, setConfirming] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const [values, setValues] = useState({
    website_name: source?.website_name ?? "", original_url: source?.original_url ?? "", wayback_url: source?.wayback_url ?? "",
    first_seen_at: localUTC(source?.first_seen_at), last_seen_at: localUTC(source?.last_seen_at), notes: source?.notes ?? "",
    source_type: source?.source_type ?? "other", credibility: String(source?.credibility ?? 3), checked_at: localUTC(source?.checked_at),
    recovered_at: localUTC(event?.recovered_at), recovered_by: event?.recovered_by ?? "", story: event?.story ?? "", evidence: event?.evidence ?? "",
  });
  const change = (name: keyof typeof values, value: string) => setValues(old => ({ ...old, [name]: value }));
  const [choices, setChoices] = useState(() => {
    const options = new Map(people.data.map(person => [person.id, person.display_name]));
    if (event?.recovered_by && !options.has(event.recovered_by)) options.set(event.recovered_by, event.recovered_by_name ?? "姓名不详");
    return [...options].map(([id, name]) => ({ id, name }));
  });
  const [page, setPage] = useState(people.pagination.page);
  const [pageSize, setPageSize] = useState(people.pagination.pageSize);
  const [total, setTotal] = useState(people.pagination.total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  async function loadPeople(refresh: boolean) {
    if (loading || pending) return;
    setLoading(true); setLoadError("");
    try {
      const result = await loadPeopleAction(refresh ? 1 : page + 1);
      setChoices(old => {
        const options = new Map((refresh ? old.filter(person => person.id === values.recovered_by || person.id === event?.recovered_by) : old).map(person => [person.id, person.name]));
        for (const person of result.data) options.set(person.id, person.display_name);
        return [...options].map(([id, name]) => ({ id, name }));
      });
      setPage(result.pagination.page); setPageSize(result.pagination.pageSize); setTotal(result.pagination.total);
    } catch { setLoadError("人物列表加载失败，已有选项与当前输入已保留。请重试；若会话过期，请在新页面登录后刷新人物列表。"); }
    finally { setLoading(false); }
  }
  const textarea = (name: "notes" | "story" | "evidence", title: string, required = false) => <label className="block text-sm">{title}{required ? " *" : "（可留空）"}
    <textarea className={inputClass} name={name} value={values[name]} onChange={event => change(name, event.target.value)} rows={name === "story" ? 7 : 5} required={required} maxLength={20000} />
    <span className="mt-2 block text-xs text-muted">最多 20,000 UTF-8 字节，中文字符通常占 3 字节。</span>
  </label>;

  // React resets native controls even when an action returns a handled error.
  // Keep the selected person intact; successful saves redirect and remount this form.
  return <form action={action} onReset={event => event.preventDefault()} onSubmit={event => { if (pending || loading) event.preventDefault(); }} className="min-w-0 space-y-6 rounded-xl border border-accent bg-white p-5 sm:p-6 [overflow-wrap:anywhere]">
    <h2 ref={heading} tabIndex={-1} className="text-lg font-semibold">{selection.record ? "编辑" : "新增"}{label}{selection.record ? ` · 编号 ${selection.record.id}` : ""}</h2>
    <input type="hidden" name="midi_id" value={midiId} />
    <input type="hidden" name="revision" value={revision} />
    <input type="hidden" name="kind" value={selection.kind} />
    <input type="hidden" name="record_id" value={selection.record?.id ?? ""} />
    <p className="text-sm leading-7 text-muted">本次仅保存这一条记录，保存后立即公开。时间均按 UTC 填写，不转换本地时区；不知道完整日期时请留空，将已知年份写入{selection.kind === "source" ? "备注" : "证据说明"}。已有微秒精度会保留；改动毫秒或清空重填会重置更细精度。</p>
    <fieldset disabled={pending || confirming} className="min-w-0 space-y-5 disabled:opacity-60"><legend className="sr-only">{label}资料</legend>
      {selection.kind === "source" ? <>
        <label className="block text-sm">网站名称 *<input name="website_name" className={inputClass} required maxLength={300} value={values.website_name} onChange={event => change("website_name", event.target.value)} /><span className="mt-2 block text-xs text-muted">最多 300 UTF-8 字节，中文字符通常占 3 字节。</span></label>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <label className="block min-w-0 text-sm">原始网址（可留空）<input type="url" name="original_url" className={inputClass} maxLength={4096} value={values.original_url} onChange={event => change("original_url", event.target.value)} /></label>
          <label className="block min-w-0 text-sm">存档网址（可留空）<input type="url" name="wayback_url" className={inputClass} maxLength={4096} value={values.wayback_url} onChange={event => change("wayback_url", event.target.value)} /></label>
        </div>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <label className="block min-w-0 text-sm">来源类型<select name="source_type" className={inputClass} value={values.source_type} onChange={event => change("source_type", event.target.value)}>
            <option value="original_site">原始网站</option><option value="forum">论坛</option><option value="mailing_list">邮件列表</option><option value="archive">网页档案</option><option value="search_index">搜索索引</option><option value="personal_collection">个人收藏</option><option value="other">其他 / 未知</option>
          </select></label>
          <label className="block min-w-0 text-sm">人工可信度（1–5）<select name="credibility" className={inputClass} value={values.credibility} onChange={event => change("credibility", event.target.value)}>
            <option value="1">1 · 未核实</option><option value="2">2 · 较弱线索</option><option value="3">3 · 有支持资料</option><option value="4">4 · 多项资料吻合</option><option value="5">5 · 一手来源</option>
          </select></label>
        </div>
        <UTCInput name="checked_at" label="最近核验时间" value={values.checked_at} onChange={value => change("checked_at", value)} />
        <p className="text-xs leading-6 text-muted">可信度是整理者的人工评估，不是系统自动判断的事实分数。保存来源后可上传 PDF、PNG、JPEG 或纯文本证据（每份不超过 1 MiB）。</p>
        <p className="text-xs leading-6 text-muted">网址须为完整的 http/https 地址，不含账户信息或控制符，最多 4,096 UTF-8 字节；未知时留空。</p>
        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
          <UTCInput name="first_seen_at" label="首次记录时间" value={values.first_seen_at} onChange={value => change("first_seen_at", value)} />
          <UTCInput name="last_seen_at" label="最后记录时间" value={values.last_seen_at} onChange={value => change("last_seen_at", value)} />
        </div>
        <p className="text-xs text-muted">首次记录时间不能晚于最后记录时间。</p>
        {textarea("notes", "备注")}
      </> : <>
        <UTCInput name="recovered_at" label="寻回时间" value={values.recovered_at} onChange={value => change("recovered_at", value)} />
        <label className="block min-w-0 text-sm">寻回人（可不选）<select name="recovered_by" className={inputClass} value={values.recovered_by} disabled={loading} onChange={event => change("recovered_by", event.target.value)}><option value="">人物不详</option>{choices.map(person => <option key={person.id} value={person.id}>{person.name}（编号 {person.id}）</option>)}</select></label>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link href="/admin/people/new" target="_blank" rel="noopener noreferrer" className="underline">在新页面创建人物</Link>
          <button type="button" disabled={loading} onClick={() => loadPeople(true)} className={buttonClass}>刷新人物列表</button>
          {page * pageSize < total && <button type="button" disabled={loading} onClick={() => loadPeople(false)} className={buttonClass}>加载更多人物</button>}
          {loading && <span role="status" className="text-muted">正在加载人物…</span>}
        </div>
        {loadError && <div role="alert" className="text-sm leading-7 text-red-800"><p>{loadError}</p><Link href="/admin/login" target="_blank" rel="noopener noreferrer" className="underline">在新页面登录</Link></div>}
        {textarea("story", "寻回经过", true)}
        {textarea("evidence", "证据说明")}
      </>}
    </fieldset>
    {state.error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm leading-7 text-red-900">
      <p>{state.error}</p><div className="flex flex-wrap gap-x-4"><Link href="/admin/login" target="_blank" rel="noopener noreferrer" className="underline">在新页面登录</Link><Link href={`/admin/midis/${midiId}/history`} target="_blank" rel="noopener noreferrer" className="underline">重新打开来源与寻回页核对 / 合并</Link></div>
    </div>}
    {confirming ? <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4">
      <p role="alert" className="text-sm leading-7 text-red-900">确认删除这条{label}（编号 {selection.record?.id}）？这会立即移除公开资料，不能撤销，当前表单的修改不会保存。取消删除会保留输入。</p>
      <div className="flex flex-wrap gap-5">
        <button type="submit" name="operation" value="delete" disabled={pending || loading} className="rounded bg-red-800 px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在删除…" : "确认永久删除本条记录"}</button>
        <button type="button" disabled={pending} className={buttonClass} onClick={() => setConfirming(false)}>取消删除，继续编辑</button>
      </div>
    </div> : <div className="flex flex-wrap items-center gap-5 border-t border-line pt-5">
      <button type="submit" name="operation" value="save" disabled={pending || loading} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : `保存本条${label}`}</button>
      <button type="button" disabled={pending || loading} className={buttonClass} onClick={onCancel}>放弃本条编辑</button>
      {selection.record && <button type="button" disabled={pending || loading} className={`${buttonClass} text-red-800`} onClick={() => setConfirming(true)}>删除本条记录…</button>}
    </div>}
  </form>;
}

export function HistoryForm({ history, people }: { history: HistoryEdit; people: PeopleList }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const busy = selection !== null;
  return <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
    <p className="text-sm leading-7 text-muted" role="status">{busy ? "正在编辑一条记录。请先保存或放弃本条编辑，再操作其他记录。其他记录暂不可编辑。" : "每次仅编辑一条历史来源或寻回记录；保存后会重新读取作品版本。来源、寻回、署名与基础资料共用版本，请勿在多个页面同时修改。"}</p>
    {selection && <HistoryRecordForm key={`${selection.kind}-${selection.record?.id ?? "new"}`} midiId={history.entry.id} revision={history.entry.revision} selection={selection} people={people} onCancel={() => setSelection(null)} />}
    <section aria-labelledby="history-sources" className="min-w-0 rounded-xl border border-line bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 id="history-sources" className="text-lg font-semibold">历史来源</h2><button type="button" disabled={busy} onClick={() => setSelection({ kind: "source" })} className={buttonClass}>新增历史来源</button></div>
      {history.historical_sources.length ? <ul className="space-y-6">{history.historical_sources.map(source => <li key={source.id} className="min-w-0 space-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="min-w-0 font-semibold">{source.website_name}</h3><button type="button" disabled={busy} className={buttonClass} onClick={() => setSelection({ kind: "source", record: source })} aria-label={`编辑历史来源 ${source.website_name}（编号 ${source.id}）`}>编辑 / 删除</button></div>
        <p className="text-xs leading-6 text-muted">编号 {source.id} · {sourceTypeLabels[source.source_type] ?? "其他 / 未知"} · 人工可信度 {source.credibility}/5 · 最近核验：{utcLabel(source.checked_at)}<br />首次记录：{utcLabel(source.first_seen_at)} · 最后记录：{utcLabel(source.last_seen_at)}</p>
        <div className="flex flex-wrap gap-4 text-sm">{source.original_url ? <ExternalSource url={source.original_url} label="原始网址" /> : <span className="text-muted">原始网址未登记</span>}{source.wayback_url ? <ExternalSource url={source.wayback_url} label="历史快照" /> : <span className="text-muted">存档网址未登记</span>}</div>
        <p className="whitespace-pre-wrap text-sm leading-7">{source.notes ?? "暂无补充说明。"}</p>
        <EvidenceFiles midiId={history.entry.id} revision={history.entry.revision} kind="source" recordId={source.id} files={source.evidence_files ?? []} />
      </li>)}</ul> : <p className="text-sm text-muted">尚未登记历史来源。可新增网站、原始网址及存档线索。</p>}
    </section>
    <section aria-labelledby="history-events" className="min-w-0 rounded-xl border border-line bg-white p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><h2 id="history-events" className="text-lg font-semibold">寻回记录</h2><button type="button" disabled={busy} onClick={() => setSelection({ kind: "event" })} className={buttonClass}>新增寻回记录</button></div>
      {history.recovery_events.length ? <ul className="space-y-6">{history.recovery_events.map(event => <li key={event.id} className="min-w-0 space-y-3 border-t border-line pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><h3 className="text-sm font-semibold">寻回记录 · 编号 {event.id}</h3><button type="button" disabled={busy} className={buttonClass} onClick={() => setSelection({ kind: "event", record: event })} aria-label={`编辑寻回记录 ${event.id}`}>编辑 / 删除</button></div>
        <p className="text-xs leading-6 text-muted">寻回时间：{utcLabel(event.recovered_at)} · 寻回人：{event.recovered_by ? <Link href={`/people/${event.recovered_by}`} target="_blank" rel="noopener noreferrer" className="underline">{event.recovered_by_name ?? "姓名不详"}（编号 {event.recovered_by}）</Link> : "人物不详"}</p>
        <p className="whitespace-pre-wrap text-sm leading-7">{event.story}</p>
        <p className="whitespace-pre-wrap text-sm leading-7 text-muted">证据说明：{event.evidence ?? "尚未补充"}</p>
        <EvidenceFiles midiId={history.entry.id} revision={history.entry.revision} kind="event" recordId={event.id} files={event.evidence_files ?? []} />
      </li>)}</ul> : <p className="text-sm text-muted">尚无寻回记录。可新增寻回经过、人物及证据说明。</p>}
    </section>
  </div>;
}

function EvidenceFiles({ midiId, revision, kind, recordId, files }: { midiId: string; revision: number; kind: "source" | "event"; recordId: string; files: { id: string; filename: string; sha256: string; file_size: number; created_at: string }[] }) {
  return <div className="space-y-3 rounded-lg bg-surface p-4">
    <h4 className="text-sm font-semibold">证据附件</h4>
    {files.length ? <ul className="space-y-2 text-sm">{files.map(file => <li key={file.id} className="break-all">
      <a className="underline" href={`/api/admin/midis/${midiId}/evidence/${file.id}`}>{file.filename}</a>
      <span className="ml-2 text-xs text-muted">{file.file_size.toLocaleString("zh-CN")} 字节 · SHA-256 {file.sha256}</span>
    </li>)}</ul> : <p className="text-xs text-muted">尚无附件。附件仅限登录管理员下载。</p>}
    <form action={uploadEvidenceAction} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="midi_id" value={midiId} /><input type="hidden" name="revision" value={revision} />
      <input type="hidden" name="kind" value={kind} /><input type="hidden" name="record_id" value={recordId} />
      <label className="text-xs">选择证据文件<input required type="file" name="evidence_file" accept=".pdf,.png,.jpg,.jpeg,.txt,application/pdf,image/png,image/jpeg,text/plain" className="mt-2 block max-w-full text-xs" /></label>
      <button type="submit" className={buttonClass}>上传并计算 SHA-256</button>
    </form>
  </div>;
}

const sourceTypeLabels: Record<string, string> = {
  original_site: "原始网站", forum: "论坛", mailing_list: "邮件列表", archive: "网页档案",
  search_index: "搜索索引", personal_collection: "个人收藏", other: "其他 / 未知",
};
