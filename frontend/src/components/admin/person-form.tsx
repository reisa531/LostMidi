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
  const input = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <form action={action} className="space-y-6 rounded-xl border border-line bg-white p-6">
    {entry && <><input type="hidden" name="id" value={entry.person.id} /><input type="hidden" name="revision" value={entry.person.revision} /></>}
    <p className="text-sm text-muted">{reviewRequired ? "提交后由超级管理员审核，批准后才会公开。" : "保存后人物资料和昵称立即公开。同名人物可分别建立档案，请依据资料核对身份。"}</p>
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-60"><legend className="sr-only">人物资料</legend>
      <label className="block text-sm">显示名称 *<input required maxLength={300} className={input} name="display_name" value={name} onChange={e => setName(e.target.value)} /><span className="text-xs text-muted">最多 300 UTF-8 字节，中文通常占 3 字节。</span></label>
      <label className="block text-sm">人物简介<textarea rows={7} maxLength={20000} className={input} name="biography" value={biography} onChange={e => setBiography(e.target.value)} /><span className="text-xs text-muted">最多 20,000 UTF-8 字节；未知时留空。</span></label>
      <label className="block text-sm">历史昵称<textarea rows={5} className={input} name="aliases" value={aliases} onChange={e => setAliases(e.target.value)} /><span className="text-xs text-muted">每行一个，最多 50 个，每个最多 300 UTF-8 字节；不能重复。清空后保存会移除已登记昵称。</span></label>
    </fieldset>
    {state.error && <div role="alert" className="rounded bg-red-50 p-4 text-sm text-red-900"><p>{state.error}</p><Link href="/admin/login" target="_blank" className="mr-4 underline">在新页面登录</Link>{entry && <Link href={`/admin/people/${entry.person.id}/edit`} target="_blank" className="underline">重新打开编辑页</Link>}</div>}
    <div className="flex gap-5"><button disabled={pending} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : entry ? "保存人物资料" : "创建人物"}</button><Link href="/admin/people" className="self-center text-sm underline">返回人物列表</Link></div>
  </form>;
}
