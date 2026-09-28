"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { savePersonAction } from "@/lib/admin/people-actions";
import type { PersonEdit } from "@/lib/admin/people";
import { MarkdownField } from "@/components/admin/markdown-field";
import { DraftNotice, useFormDraft } from "@/components/admin/use-form-draft";
import Image from "next/image";
import type { UsefulLink } from "@/lib/api/useful-links";

export function PersonForm({ entry, reviewRequired = false, usefulLinks = [] }: { entry?: PersonEdit; reviewRequired?: boolean; usefulLinks?: UsefulLink[] }) {
  const router = useRouter();
  const { attachForm, dirty, hasDraft, saveDraft, clearDraft, discardDraft, restoreDraft } = useFormDraft(`person:${entry?.person.id ?? "new"}:${entry?.person.revision ?? 0}`);
  const [state, action, pending] = useActionState(async (previous: { error: string }, form: FormData) => {
    const next = await savePersonAction(previous, form);
    if (next.target) { clearDraft(); router.push(next.target); router.refresh(); }
    return next;
  }, { error: "" });
  const [name, setName] = useState(entry?.person.display_name ?? "");
  const [biography, setBiography] = useState(entry?.person.biography ?? "");
  const [rights, setRights] = useState(typeof entry?.person.profile.rights === "string" ? entry.person.profile.rights : "");
  const [aliases, setAliases] = useState(entry?.aliases.join("\n") ?? "");
  const [avatar, setAvatar] = useState(typeof entry?.person.profile.avatar === "string" ? entry.person.profile.avatar : "");
  const [avatarError, setAvatarError] = useState("");
  const [sameAs, setSameAs] = useState(Array.isArray(entry?.person.profile.sameAs) ? entry.person.profile.sameAs.join("\n") : "");
  const profile = entry?.person.profile ?? {};
  const profileText = (key: string) => typeof profile[key] === "string" ? String(profile[key]) : "";
  const activePeriod = profile.activePeriod;
  const activePeriodValue = activePeriod && typeof activePeriod === "object" && !Array.isArray(activePeriod)
    ? ["start", "end"].map(key => (activePeriod as Record<string, unknown>)[key]).filter(value => typeof value === "string" && value).join("—")
    : "";
  const input = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <form ref={attachForm} action={action} onInputCapture={saveDraft} onChangeCapture={saveDraft} onReset={event => event.preventDefault()} className="space-y-6 rounded-xl border border-line bg-white p-6">
    {entry && <><input type="hidden" name="id" value={entry.person.id} /><input type="hidden" name="revision" value={entry.person.revision} /></>}
    <p className="text-sm text-muted">{reviewRequired ? "提交后由超级管理员审核，批准后才会公开。" : "保存后人物资料和昵称立即公开。同名人物可分别建立档案，请依据资料核对身份。"}</p>
    <DraftNotice hasDraft={hasDraft} dirty={dirty} restore={restoreDraft} discard={discardDraft} />
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">基本资料</legend>
      <div className="flex flex-wrap items-center gap-5 rounded-xl border border-line bg-surface/40 p-4"><div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-[#e8eee2]">{avatar ? <Image src={avatar} alt="人物头像预览" width={80} height={80} unoptimized className="h-full w-full object-cover" /> : <span aria-hidden="true" className="font-serif text-3xl text-accent">人</span>}</div><div className="min-w-0 flex-1"><label className="block text-sm font-medium">人物头像<input type="file" accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-xs" onChange={async event => { const file = event.target.files?.[0]; if (!file) return; if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2_000_000) { setAvatarError("请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。"); return; } try { const bitmap = await createImageBitmap(file); const canvas = document.createElement("canvas"); canvas.width = 192; canvas.height = 192; const context = canvas.getContext("2d"); if (!context) throw new Error(); const side = Math.min(bitmap.width, bitmap.height); context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 192, 192); bitmap.close(); const result = canvas.toDataURL("image/jpeg", 0.8); if (result.length > 90000) throw new Error(); setAvatar(result); setAvatarError(""); } catch { setAvatarError("图片处理失败，请换一张图片。"); } }} /></label><p className="mt-1 text-xs text-muted">自动裁成方形并压缩；未上传时使用默认头像。</p>{avatar && <button type="button" className="mt-2 text-xs underline" onClick={() => setAvatar("")}>移除头像</button>}{avatarError && <p role="alert" className="mt-2 text-xs text-red-800">{avatarError}</p>}</div><input type="hidden" name="avatar" value={avatar} /></div>
      <label className="block text-sm">显示名称 *<input required maxLength={300} className={input} name="display_name" value={name} onChange={e => setName(e.target.value)} /><span className="text-xs text-muted">最多 300 UTF-8 字节，中文通常占 3 字节。</span></label>
      <label className="block text-sm">一句话摘要<input maxLength={500} className={input} name="summary" defaultValue={entry?.person.summary ?? ""} /><span className="text-xs text-muted">用于列表与搜索结果；最多 500 字节。</span></label>
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">国家<input className={input} name="country" defaultValue={profileText("country")} /></label><label className="block text-sm">活动时间<input className={input} name="active_time" defaultValue={profileText("activeTime") || activePeriodValue} placeholder="如 1998—2005 年" /></label></div>
      <label className="block text-sm">相关链接（每行一个 https URL）<textarea rows={3} className={input} name="same_as" value={sameAs} onChange={event => setSameAs(event.target.value)} /><span className="text-xs text-muted">每条链接最多 8192 UTF-8 字节。</span></label>
      {usefulLinks.length > 0 && <label className="block text-sm">从常用网址快速添加<select className={input} defaultValue="" onChange={event => { const link = usefulLinks.find(item => item.id === event.target.value); if (link?.url.startsWith("https://")) setSameAs(previous => [...new Set([...previous.split(/\r?\n/).filter(Boolean), link.url])].join("\n")); event.target.value = ""; }}><option value="">选择网址…</option>{usefulLinks.map(link => <option key={link.id} value={link.id}>{link.title}</option>)}</select></label>}
      <label className="block text-sm">联系方式<textarea rows={3} maxLength={2000} className={input} name="contact" defaultValue={profileText("contact")} placeholder="如邮箱、社交账号；仅填写允许公开的联系方式" /><span className="text-xs text-muted">保存后会在公开人物档案展示。</span></label>
      <label className="block text-sm">合作者（每行：姓名 | 人物编号 | 出处）<textarea rows={3} className={input} name="collaborators" defaultValue={Array.isArray(profile.collaborators) ? profile.collaborators.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).personId ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /></label>
    </fieldset>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="font-semibold">简介（支持 Markdown）</legend>
      <MarkdownField name="biography" label="人物简介（支持 Markdown）" rows={7} value={biography} onChange={setBiography} disabled={pending} />
      <MarkdownField name="rights" label="作者指定的使用条约（支持 Markdown）" rows={5} value={rights} onChange={setRights} disabled={pending} />
      <label className="block text-sm">详细昵称信息<textarea rows={5} maxLength={20000} className={input} name="alias_details" defaultValue={Array.isArray(profile.aliasDetails) ? profile.aliasDetails.map(item => typeof item === "object" && item ? `${String((item as Record<string, unknown>).name ?? "")} | ${String((item as Record<string, unknown>).note ?? "")} | ${String((item as Record<string, unknown>).period ?? "")} | ${String((item as Record<string, unknown>).source ?? "")}` : "").join("\n") : ""} /><span className="text-xs text-muted">每行：昵称 | 用途备注 | 时期 | 出处；昵称须与下方登记一致。</span></label>
      <label className="block text-sm">历史昵称<textarea rows={5} className={input} name="aliases" value={aliases} onChange={e => setAliases(e.target.value)} /><span className="text-xs text-muted">每行一个，最多 50 个，每个最多 300 UTF-8 字节；不能重复。清空后保存会移除已登记昵称。</span></label>
    </fieldset>
    {state.error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900"><p>{state.error}</p><Link href="/admin/login" target="_blank" className="mr-4 underline">在新页面登录</Link>{entry && <Link href={`/admin/people/${entry.person.id}/edit`} target="_blank" className="underline">重新打开编辑页</Link>}</div>}
    <div className="flex gap-5"><button disabled={pending} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : entry ? "保存人物资料" : "创建人物"}</button><Link href="/admin/people" className="self-center text-sm underline">返回人物列表</Link></div>
  </form>;
}
