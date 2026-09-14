"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import type { MidiEntry } from "@/lib/api/types";
import { saveMidiAction } from "@/lib/admin/actions";

export function MidiForm({ entry }: { entry?: MidiEntry }) {
  const [state, action, pending] = useActionState(saveMidiAction, { error: "" });
  const [values, setValues] = useState({
    title: entry?.title ?? "", slug: entry?.slug ?? "", description: entry?.description ?? "",
    estimated_year: entry?.estimated_year?.toString() ?? "", archive_status: entry?.archive_status ?? "uncertain",
    copyright_status: entry?.copyright_status ?? "unknown", distribution_permission: entry?.distribution_permission ?? "unknown",
    license: entry?.license ?? "", rights_holder: entry?.rights_holder ?? "",
  });
  const change = (name: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [name]: value }));
  const inputClass = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  const input = (name: keyof typeof values, title: string, required = false) => <label className="block text-sm">{title}
    <input name={name} value={values[name]} onChange={event => change(name, event.target.value)} className={inputClass} required={required}
      maxLength={name === "slug" ? 160 : name === "title" ? 300 : 500} pattern={name === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined} />
  </label>;
  const select = (name: keyof typeof values, title: string, options: [string, string][]) => <label className="block text-sm">{title}
    <select className={inputClass} name={name} value={values[name]} onChange={event => change(name, event.target.value)}>{options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
  </label>;
  return <form action={action} className="space-y-6 rounded-xl border border-line bg-white p-6 sm:p-8">
    {entry && <><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} /></>}
    <fieldset disabled={pending} className="space-y-6 disabled:opacity-70"><legend className="sr-only">档案基础资料</legend>
      <div className="grid gap-6 md:grid-cols-2">{input("title", "标题 *", true)}{input("slug", "Slug（公开地址）*", true)}</div>
      <p className="text-xs leading-6 text-muted">Slug 使用小写字母、数字和词间连字符。更改后旧地址将失效。标题最多 300 UTF-8 字节，中文字符通常占 3 字节。</p>
      <label className="block text-sm">描述<textarea name="description" rows={7} maxLength={20000} className={inputClass} value={values.description} onChange={event => change("description", event.target.value)} /><span className="mt-2 block text-xs text-muted">最多 20,000 UTF-8 字节。</span></label>
      <div className="grid gap-6 md:grid-cols-2"><label className="block text-sm">推测年份<input className={inputClass} type="number" min={1} max={9999} step={1} name="estimated_year" value={values.estimated_year} onChange={event => change("estimated_year", event.target.value)} /><span className="mt-2 block text-xs text-muted">未知时留空。</span></label>
      {select("archive_status", "档案状态", [["uncertain","尚待确认"],["lost","待寻回"],["partially_recovered","部分寻回"],["archived","已归档"]])}</div>
      <div className="grid gap-6 md:grid-cols-2">
      {select("copyright_status", "版权状态", [["unknown","未知"],["public_domain","公有领域"],["licensed","已许可"],["copyrighted","受版权保护"]])}
      {select("distribution_permission", "分发许可", [["unknown","未知"],["permission_granted","已获授权"],["metadata_only","仅元数据"],["restricted","受限"]])}
      {input("license", "许可证（最多 500 UTF-8 字节）")}{input("rights_holder", "权利人（最多 500 UTF-8 字节）")}</div>
    </fieldset>
    {state.error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm leading-7 text-red-900"><p>{state.error}</p><Link className="underline" href="/admin/login" target="_blank">在新页面登录</Link>{entry && <Link className="ml-4 underline" href={`/admin/midis/${entry.id}/edit`} target="_blank">重新打开编辑页</Link>}</div>}
    <div className="flex items-center gap-5 border-t border-line pt-6"><button disabled={pending} className="rounded-lg bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : entry ? "保存修改" : "创建档案"}</button><Link className="text-sm text-muted underline" href="/admin/midis">返回列表</Link></div>
  </form>;
}
