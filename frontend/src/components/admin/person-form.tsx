"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { savePersonAction } from "@/lib/admin/people-actions";
import type { PersonEdit } from "@/lib/admin/people";

export function PersonForm({ entry, reviewRequired = false }: { entry?: PersonEdit; reviewRequired?: boolean }) {
  const [state, action, pending] = useActionState(savePersonAction, { error: "" });
  const [name, setName] = useState(entry?.person.display_name ?? "");
  const [biography, setBiography] = useState(entry?.person.biography ?? "");
  const [aliases, setAliases] = useState(entry?.aliases.join("\n") ?? "");
  const profile = entry?.person.profile ?? {};
  const profileText = (key: string) => typeof profile[key] === "string" ? String(profile[key]) : "";
  const activePeriod = profile.activePeriod;
  const activePeriodValue = activePeriod && typeof activePeriod === "object" && !Array.isArray(activePeriod)
    ? (["start", "end", "note", "certainty", "source"] as const)
      .map(key => { const value = (activePeriod as Record<string, unknown>)[key]; return typeof value === "string" ? value : ""; })
      .join(" | ")
    : "";
  const input = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <form action={action} onReset={event => event.preventDefault()} className="space-y-6 rounded-xl border border-line bg-white p-6">
    {entry && <><input type="hidden" name="id" value={entry.person.id} /><input type="hidden" name="revision" value={entry.person.revision} /></>}
    <p className="text-sm text-muted">{reviewRequired ? "提交后由超级管理员审核，批准后才会公开。" : "保存后人物资料和昵称立即公开。同名人物可分别建立档案，请依据资料核对身份。"}</p>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">基本资料</legend>
      <label className="block text-sm">显示名称 *<input required maxLength={300} className={input} name="display_name" value={name} onChange={e => setName(e.target.value)} /><span className="text-xs text-muted">最多 300 UTF-8 字节，中文通常占 3 字节。</span></label>
      <label className="block text-sm">一句话摘要<input maxLength={500} className={input} name="summary" defaultValue={entry?.person.summary ?? ""} /><span className="text-xs text-muted">用于列表与搜索结果；最多 500 字节。</span></label>
      <details className="rounded-lg border border-line p-4"><summary className="cursor-pointer font-semibold">档案资料</summary><p className="mt-2 text-xs text-muted">使用逐行字段录入，格式为字段 | 字段，不需要编写 JSON。日期和不确定程度按原始来源填写。</p>
        <label className="mt-4 block text-sm">读音<input className={input} name="pronunciation" defaultValue={profileText("pronunciation")} /></label>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">{([["gender","性别"],["birth_text","出生信息原文"],["birthplace","出生地"],["residence","居住地"],["education","学历"],["birth_certainty","出生信息确定程度"]] as const).map(([key,label]) => <label key={key} className="block text-sm">{label}<input className={input} name={key} defaultValue={key === "birth_text" ? profileText("birthText") : key === "birth_certainty" ? profileText("birthCertainty") : profileText(key)} placeholder={key === "birth_certainty" ? "unknown / approximate / confirmed" : ""} /></label>)}</div>
        <label className="mt-4 block text-sm">其他名义<textarea rows={3} className={input} name="other_names" defaultValue={Array.isArray(profile.otherNames) ? profile.otherNames.join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">活动时期（开始 | 结束 | 说明 | 确定程度 | 出处）<textarea rows={2} className={input} name="active_period" defaultValue={activePeriodValue} /></label>
        <label className="mt-4 block text-sm">身份 / 乐器 / 工具<textarea rows={3} className={input} name="roles" defaultValue={Array.isArray(profile.roles) ? profile.roles.join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">站点（站点名称 | URL | 身份 | 现状）<textarea rows={3} className={input} name="sites" defaultValue={Array.isArray(profile.sites) ? profile.sites.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).url ?? "")} | ${String((item as Record<string, unknown>).role ?? "")} | ${String((item as Record<string, unknown>).status ?? "")}` : "").join("\n") : ""} placeholder="站点名称 | https://example.org | 作者 | 已存档" /></label>
        <label className="mt-4 block text-sm">年表（时间 | 事件 | 出处 | 确定程度）<textarea rows={4} className={input} name="timeline" defaultValue={Array.isArray(profile.timeline) ? profile.timeline.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).time ?? "")} | ${String((item as Record<string, unknown>).event ?? "")} | ${String((item as Record<string, unknown>).source ?? "")} | ${String((item as Record<string, unknown>).certainty ?? "unknown")}` : "").join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">出处（编号 | 标题 | URL | 档案说明）<textarea rows={3} className={input} name="sources" defaultValue={Array.isArray(profile.sources) ? profile.sources.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).id ?? "")} | ${String((item as Record<string, unknown>).title ?? "")} | ${String((item as Record<string, unknown>).url ?? "")} | ${String((item as Record<string, unknown>).archiveNote ?? "")}` : "").join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">外部身份链接（每行一个 https URL）<textarea rows={2} className={input} name="same_as" defaultValue={Array.isArray(profile.sameAs) ? profile.sameAs.join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">对外作品（站内作品公开 ID | 作品名 | 外部 URL | 署名角色 | 出处）<textarea rows={3} className={input} name="works" defaultValue={Array.isArray(profile.works) ? profile.works.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).midiId ?? "")} | ${String((item as Record<string, unknown>).title ?? "")} | ${String((item as Record<string, unknown>).url ?? "")} | ${String((item as Record<string, unknown>).role ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">合作者（人物编号 | 姓名 | 出处）<textarea rows={3} className={input} name="collaborators" defaultValue={Array.isArray(profile.collaborators) ? profile.collaborators.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).personId ?? "")} | ${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /></label>
        <label className="mt-4 block text-sm">权利说明（Markdown）<textarea rows={3} className={input} name="rights" defaultValue={profileText("rights")} /></label>
      </details>
    </fieldset>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">简介（支持 Markdown）</legend>
      <label className="block text-sm">人物简介（支持 Markdown）<textarea rows={7} maxLength={20000} className={input} name="biography" value={biography} onChange={e => setBiography(e.target.value)} /><span className="text-xs text-muted">最多 20,000 UTF-8 字节；可用 `## 小节`、列表、链接和表格；未知时留空。</span></label>
      <label className="block text-sm">详细昵称信息<textarea rows={5} maxLength={20000} className={input} name="alias_details" defaultValue={Array.isArray(profile.aliasDetails) ? profile.aliasDetails.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).note ?? "")} | ${String((item as Record<string, unknown>).period ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /><span className="text-xs text-muted">每行：昵称 | 用途备注 | 时期 | 出处；昵称须与下方登记一致。</span></label>
      <label className="block text-sm">历史昵称<textarea rows={5} className={input} name="aliases" value={aliases} onChange={e => setAliases(e.target.value)} /><span className="text-xs text-muted">每行一个，最多 50 个，每个最多 300 UTF-8 字节；不能重复。清空后保存会移除已登记昵称。</span></label>
    </fieldset>
    {state.error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900"><p>{state.error}</p><Link href="/admin/login" target="_blank" className="mr-4 underline">在新页面登录</Link>{entry && <Link href={`/admin/people/${entry.person.id}/edit`} target="_blank" className="underline">重新打开编辑页</Link>}</div>}
    <div className="flex gap-5"><button disabled={pending} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : entry ? "保存人物资料" : "创建人物"}</button><Link href="/admin/people" className="self-center text-sm underline">返回人物列表</Link></div>
  </form>;
}
