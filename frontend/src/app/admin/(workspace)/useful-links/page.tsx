import { adminRequest } from "@/lib/admin/auth";
import type { UsefulLink } from "@/lib/api/useful-links";
import { saveUsefulLink, deleteUsefulLink } from "@/lib/admin/useful-links-actions";
import { AdminPageHeader } from "@/components/admin/ui";

export const metadata = { title: "网址管理" };
export default async function UsefulLinksPage() {
  const links = await adminRequest<UsefulLink[]>("/api/v1/admin/useful-links");
  const input = "mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm";
  return <><AdminPageHeader eyebrow="工作台 / 网址管理" title="常用网址" description="管理加入我们页的探索入口，也可在填写来源网址时快速选用。" />
    <div className="space-y-4">{links.map(link => <div key={link.id} className="rounded-xl border border-line bg-white p-5"><form action={saveUsefulLink} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><input type="hidden" name="id" value={link.id} /><label className="text-sm">名称<input required name="title" maxLength={120} defaultValue={link.title} className={input} /></label><label className="text-sm">网址<input required type="url" name="url" maxLength={4096} defaultValue={link.url} className={input} /></label><label className="text-sm">排序<input type="number" name="sort_order" defaultValue={link.sort_order} className={`${input} w-24`} /></label><label className="text-sm md:col-span-3">简述<input name="description" maxLength={500} defaultValue={link.description} className={input} /></label><button className="rounded bg-accent px-4 py-2 text-sm text-white md:justify-self-start">保存修改</button></form><form action={deleteUsefulLink} className="mt-2"><input type="hidden" name="id" value={link.id} /><button className="text-sm text-red-800 underline">删除网址</button></form></div>)}
    <form action={saveUsefulLink} className="grid gap-3 rounded-xl border border-line bg-white p-5 md:grid-cols-[1fr_2fr_auto]"><h2 className="font-semibold md:col-span-3">添加网址</h2><label className="text-sm">名称<input required name="title" maxLength={120} className={input} /></label><label className="text-sm">网址<input required type="url" name="url" maxLength={4096} className={input} /></label><label className="text-sm">排序<input type="number" name="sort_order" defaultValue={links.length} className={`${input} w-24`} /></label><label className="text-sm md:col-span-3">简述<input name="description" maxLength={500} className={input} /></label><button className="rounded bg-accent px-4 py-2 text-sm text-white md:justify-self-start">添加</button></form></div></>;
}
