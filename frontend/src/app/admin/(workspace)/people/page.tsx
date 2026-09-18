import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { getPeople } from "@/lib/admin/people";
import { ApiError } from "@/lib/api/client";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";
export const metadata = { title: "人物管理" };
export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requireAdmin();
  const { page: raw = "1" } = await searchParams;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || Number(raw) > 1000000) return <p>页码无效。<Link href="/admin/people" className="underline">返回第一页</Link></p>;
  const page = Number(raw);
  let result;
  try { result = await getPeople(page); } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError) return <AdminUnavailable />;
    throw error;
  }
  const pages = Math.max(1, Math.ceil(result.pagination.total / result.pagination.pageSize));
  return <><AdminPageHeader eyebrow="Collection / People" title="人物管理" description="维护人物名称、简介和历史昵称。在作品编辑页维护人物与作品的署名关系。" />
    <AdminPanel title={`人物 · ${result.pagination.total}`} action={<Link href="/admin/people/new" className="rounded bg-accent px-4 py-2 text-sm text-white">新增人物</Link>}>
      {result.data.length ? <ul className="divide-y divide-line">{result.data.map(person => <li key={person.id} className="flex flex-wrap items-center justify-between gap-4 py-5"><div><h2 className="font-medium">{person.display_name}</h2><p className="mt-2 text-xs text-muted">人物编号 {person.id}</p></div><div className="flex gap-4 text-sm"><Link href={`/admin/people/${person.id}/edit`} className="underline">编辑</Link><Link href={`/people/${person.id}`} className="underline">公开资料</Link></div></li>)}</ul> : <p className="py-8 text-sm text-muted">本页暂无人物资料。</p>}
      <nav aria-label="人物分页" className="mt-6 flex justify-between gap-4 text-sm"><span>第 {page} 页 / 共 {pages} 页</span><div className="flex gap-4">{page > 1 && <Link href={`/admin/people?page=${page - 1}`}>上一页</Link>}{page < pages && <Link href={`/admin/people?page=${page + 1}`}>下一页</Link>}</div></nav>
    </AdminPanel></>;
}
