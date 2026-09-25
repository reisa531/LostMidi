"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { savePersonAction } from "@/lib/admin/people-actions";
import type { PersonEdit } from "@/lib/admin/people";
import { MarkdownField } from "@/components/admin/markdown-field";

export function PersonForm({ entry, reviewRequired = false }: { entry?: PersonEdit; reviewRequired?: boolean }) {
  const [state, action, pending] = useActionState(savePersonAction, { error: "" });
  const [name, setName] = useState(entry?.person.display_name ?? "");
  const [biography, setBiography] = useState(entry?.person.biography ?? "");
  const [aliases, setAliases] = useState(entry?.aliases.join("\n") ?? "");
  const profile = entry?.person.profile ?? {};
  const profileText = (key: string) => typeof profile[key] === "string" ? String(profile[key]) : "";
  const activePeriod = profile.activePeriod;
  const activePeriodValue = activePeriod && typeof activePeriod === "object" && !Array.isArray(activePeriod)
    ? ["start", "end"].map(key => (activePeriod as Record<string, unknown>)[key]).filter(value => typeof value === "string" && value).join("—")
    : "";
  const input = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <form action={action} onReset={event => event.preventDefault()} className="space-y-6 rounded-xl border border-line bg-white p-6">
    {entry && <><input type="hidden" name="id" value={entry.person.id} /><input type="hidden" name="revision" value={entry.person.revision} /></>}
    <p className="text-sm text-muted">{reviewRequired ? "提交后由超级管理员审核，批准后才会公开。" : "保存后人物资料和昵称立即公开。同名人物可分别建立档案，请依据资料核对身份。"}</p>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">基本资料</legend>
      <label className="block text-sm">显示名称 *<input required maxLength={300} className={input} name="display_name" value={name} onChange={e => setName(e.target.value)} /><span className="text-xs text-muted">最多 300 UTF-8 字节，中文通常占 3 字节。</span></label>
      <label className="block text-sm">一句话摘要<input maxLength={500} className={input} name="summary" defaultValue={entry?.person.summary ?? ""} /><span className="text-xs text-muted">用于列表与搜索结果；最多 500 字节。</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">国家<input className={input} name="country" defaultValue={profileText("country")} /></label><label className="block text-sm">活动时间<input className={input} name="active_time" defaultValue={profileText("activeTime") || activePeriodValue} placeholder="如 1998—2005 年" /></label></div>
      <label className="block text-sm">相关链接（每行一个 https URL）<textarea rows={3} className={input} name="same_as" defaultValue={Array.isArray(profile.sameAs) ? profile.sameAs.join("\n") : ""} /></label>
      <label className="block text-sm">合作者（每行：姓名 | 人物编号 | 出处）<textarea rows={3} className={input} name="collaborators" defaultValue={Array.isArray(profile.collaborators) ? profile.collaborators.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).personId ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /></label>
    </fieldset>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">简介（支持 Markdown）</legend>
      <MarkdownField name="biography" label="人物简介（支持 Markdown）" rows={7} value={biography} onChange={setBiography} disabled={pending} />
      <label className="block text-sm">详细昵称信息<textarea rows={5} maxLength={20000} className={input} name="alias_details" defaultValue={Array.isArray(profile.aliasDetails) ? profile.aliasDetails.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).note ?? "")} | ${String((item as Record<string, unknown>).period ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /><span className="text-xs text-muted">每行：昵称 | 用途备注 | 时期 | 出处；昵称须与下方登记一致。</span></label>
      <label className="block text-sm">历史昵称<textarea rows={5} className={input} name="aliases" value={aliases} onChange={e => setAliases(e.target.value)} /><span className="text-xs text-muted">每行一个，最多 50 个，每个最多 300 UTF-8 字节；不能重复。清空后保存会移除已登记昵称。</span></label>
    </fieldset>
    {state.error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900"><p>{state.error}</p><Link href="/admin/login" target="_blank" className="mr-4 underline">在新页面登录</Link>{entry && <Link href={`/admin/people/${entry.person.id}/edit`} target="_blank" className="underline">重新打开编辑页</Link>}</div>}
    <div className="flex gap-5"><button disabled={pending} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : entry ? "保存人物资料" : "创建人物"}</button><Link href="/admin/people" className="self-center text-sm underline">返回人物列表</Link></div>
  </form>;
}
