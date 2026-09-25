"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { loadPeopleAction, saveCreditsAction } from "@/lib/admin/people-actions";
import type { CreditEdit, PeopleList } from "@/lib/admin/people";

export function CreditsForm({ midiId, entry, people, reviewRequired = false }: { midiId: string; entry: CreditEdit; people: PeopleList; reviewRequired?: boolean }) {
  const [state, action, pending] = useActionState(saveCreditsAction, { error: "" });
  const [rows, setRows] = useState(entry.credits.map(credit => ({ person_id: credit.person_id, role: credit.role })));
  const [choices, setChoices] = useState(people.data.map(person => ({ id: person.id, name: person.display_name })));
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(people.pagination.total);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const options = new Map(choices.map(person => [person.id, person.name]));
  for (const credit of entry.credits) if (!options.has(credit.person_id)) options.set(credit.person_id, credit.display_name);
  async function loadMore() {
    setLoading(true); setLoadError("");
    try { const result = await loadPeopleAction(page + 1); setChoices(old => [...old, ...result.data.map(person => ({ id: person.id, name: person.display_name }))]); setPage(page + 1); setTotal(result.pagination.total); }
    catch { setLoadError("人物列表加载失败，请重试；会话过期时请在新页面登录。"); }
    finally { setLoading(false); }
  }
  return <form action={action} className="space-y-6 rounded-xl border border-line bg-white p-6">
    <input type="hidden" name="midi_id" value={midiId} /><input type="hidden" name="revision" value={entry.revision} />
    <p className="text-sm leading-7 text-muted">选择人物和署名角色；同一人物可承担不同角色。移除行后需保存才生效，清空并保存会移除全部署名。{reviewRequired ? "提交后由超级管理员审核并发布。" : "资料立即公开。"}</p>
    <fieldset disabled={pending} className="space-y-4 disabled:opacity-60"><legend className="sr-only">作品署名</legend>
      {rows.map((row, index) => <div key={index} className="flex flex-wrap items-end gap-3 border-b border-line pb-4">
        <label className="min-w-48 flex-1 text-sm">人物<select required name="person_id" className="mt-2 block w-full rounded border border-line p-3" value={row.person_id} onChange={e => setRows(old => old.map((item, i) => i === index ? { ...item, person_id: e.target.value } : item))}><option value="">请选择人物</option>{Array.from(options, ([id, name]) => <option key={id} value={id}>{name}（编号 {id}）</option>)}</select></label>
        <label className="text-sm">角色<select name="role" className="mt-2 block rounded border border-line p-3" value={row.role} onChange={e => setRows(old => old.map((item, i) => i === index ? { ...item, role: e.target.value } : item))}>{[["composer", "作曲"], ["arranger", "编曲"], ["sequencer", "音序制作"], ["contributor", "贡献者"]].map(([role, label]) => <option value={role} key={role}>{label}</option>)}</select></label>
        <button type="button" className="p-3 text-sm text-red-800 underline" aria-label={`移除第 ${index + 1} 条署名`} onClick={() => setRows(old => old.filter((_, i) => i !== index))}>移除</button>
      </div>)}
      {!rows.length && <p className="text-sm text-muted">尚未设置署名。</p>}
      <button type="button" disabled={rows.length >= 100} className="text-sm underline disabled:opacity-50" onClick={() => setRows(old => [...old, { person_id: "", role: "sequencer" }])}>添加署名</button>
      <div className="flex flex-wrap gap-4 text-sm"><Link href="/admin/people/new" target="_blank" className="underline">在新页面创建人物</Link><button type="button" disabled={loading} className="underline disabled:opacity-50" onClick={async () => { setLoading(true); setLoadError(""); try { const result = await loadPeopleAction(1); setChoices(old => { const updated = new Map(old.filter(person => rows.some(row => row.person_id === person.id)).map(person => [person.id, person])); for (const person of result.data) updated.set(person.id, { id: person.id, name: person.display_name }); return [...updated.values()]; }); setPage(1); setTotal(result.pagination.total); } catch { setLoadError("人物列表刷新失败，请重试。"); } finally { setLoading(false); } }}>刷新人物列表</button>
      {page * 100 < total && <button type="button" disabled={loading} className="underline" onClick={loadMore}>{loading ? "正在加载…" : "加载更多人物"}</button>}</div>
    </fieldset>
    {loadError && <p role="alert" className="text-sm text-red-800">{loadError}</p>}
    {state.error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900"><p>{state.error}</p><Link href="/admin/login" target="_blank" className="mr-4 underline">在新页面登录</Link><Link href={`/admin/midis/${midiId}/credits`} target="_blank" className="underline">重新打开署名页</Link></div>}
    <div className="flex gap-5"><button disabled={pending || loading} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : "保存署名"}</button><Link href={`/admin/midis/${midiId}/edit`} className="self-center text-sm underline">返回作品编辑</Link></div>
  </form>;
}
