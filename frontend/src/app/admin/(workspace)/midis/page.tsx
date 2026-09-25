import Link from "next/link";
import { getMidis } from "@/lib/api/midi";
import { ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/admin/auth";
import { Status, roleName } from "@/components/archive";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "MIDI 档案" };

export default async function AdminMidis({ searchParams }: { searchParams: Promise<{ page?: string | string[]; deleted?: string | string[] }> }) {
  await requireAdmin();
  const { page: raw = "1", deleted } = await searchParams;
  const header = <><AdminPageHeader eyebrow="Collection / MIDI" title="MIDI 档案" description="新增和编辑作品基础资料，维护归档状态与权利信息。" />
    {deleted === "1" && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">档案已移入回收站，可随时恢复。关联记录和文件均已保留。</p>}</>;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || Number(raw) > 1000000) return <>{header}<p>页码无效。<Link className="archive-link" href="/admin/midis">返回第一页</Link></p></>;
  const page = Number(raw);
  let result;
  try { result = await getMidis(page); } catch (error) {
    if (error instanceof ApiError) return <>{header}<AdminUnavailable /></>;
    throw error;
  }
  const pages = Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize));
  return <>{header}<AdminPanel title={`全部档案 · ${result.pagination.total}`} action={<Link className="rounded-lg bg-accent px-4 py-2 text-sm text-white" href="/admin/midis/new">新增档案</Link>}>
    {result.data.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><caption className="sr-only">MIDI 档案、年代、署名和状态</caption><thead className="border-b border-line text-xs text-muted"><tr>{["档案", "推测年代", "署名", "状态", "操作"].map(label => <th key={label} scope="col" className="px-3 pb-4 font-normal">{label}</th>)}</tr></thead><tbody className="divide-y divide-line">{result.data.map(entry => <tr key={entry.id} className="align-top"><td className="max-w-xs px-3 py-5"><p className="break-words font-medium">{entry.title}</p><p className="mt-2 break-all font-mono text-xs text-muted">{entry.slug}</p></td><td className="px-3 py-5 tabular-nums">{entry.estimated_year ?? "不详"}</td><td className="px-3 py-5 text-xs leading-6 text-muted">{entry.credits.length ? entry.credits.map(c => <p key={`${c.person_id}-${c.role}`}>{c.display_name}<br />{roleName(c.role)}</p>) : "尚待考证"}</td><td className="px-3 py-5"><Status status={entry.archive_status} /></td><td className="whitespace-nowrap px-3 py-5"><Link className="archive-link mr-3 text-xs" href={`/admin/midis/${entry.id}/edit`}>编辑</Link><Link className="archive-link text-xs" href={`/midis/${entry.slug}`}>公开详情 ↗</Link></td></tr>)}</tbody></table></div> : <p className="py-10 text-center text-sm text-muted">本页暂无档案。{page > 1 && <Link className="archive-link ml-2" href="/admin/midis">返回第一页</Link>}</p>}
    <nav aria-label="后台档案分页" className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5 text-xs"><span className="text-muted">第 {page} 页 / 共 {pages} 页</span><div className="flex gap-5">{page > 1 && <Link className="archive-link" href={`/admin/midis?page=${page - 1}`}>上一页</Link>}{page < pages && <Link className="archive-link" href={`/admin/midis?page=${page + 1}`}>下一页</Link>}</div></nav>
  </AdminPanel></>;
}
