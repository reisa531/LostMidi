import Link from "next/link";
import { getMidis } from "@/lib/api/midi";
import { ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/admin/auth";
import { Status } from "@/components/archive";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "工作台" };

export default async function AdminOverview() {
  await requireAdmin();
  let archive;
  try { archive = await getMidis(1, 5); } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  return <>
    <AdminPageHeader eyebrow="Workspace / Overview" title="管理工作台" description="查看档案概况，新增作品资料，更新归档状态与权利信息。" />
    <div className="mb-8 grid gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-line bg-white p-6"><p className="text-xs text-muted">已收录档案</p><p className="my-3 text-4xl font-semibold tabular-nums">{archive?.pagination.total ?? "—"}</p><p className="text-xs text-muted">{archive ? "来自档案数据库" : "数据暂不可用"}</p></div>
      <div className="rounded-xl border border-line bg-white p-6"><p className="text-xs text-muted">档案服务</p><p className="my-3 text-2xl font-semibold">{archive ? "连接正常" : "暂不可用"}</p><p className="text-xs text-muted">以本次档案查询结果为准</p></div>
      <div className="rounded-xl border border-line bg-[#e7eee2] p-6"><p className="text-xs text-muted">当前工作模式</p><p className="my-3 text-2xl font-semibold text-accent">档案维护</p><p className="text-xs text-muted">管理员会话已验证 · 可新增和编辑</p></div>
    </div>
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
      <AdminPanel title="档案速览" action={<Link href="/admin/midis" className="archive-link text-xs">查看全部 →</Link>}>
        {!archive ? <AdminUnavailable /> : archive.data.length ? <ul className="divide-y divide-line">{archive.data.map(entry => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 py-4 first:pt-0 last:pb-0"><div className="min-w-0"><Link href={`/midis/${entry.slug}`} className="break-words text-sm font-medium hover:text-accent hover:underline">{entry.title}</Link><p className="mt-2 text-xs text-muted">ID {entry.id} · {entry.estimated_year ?? "年代不详"}</p></div><Status status={entry.archive_status} /></li>)}</ul> : <p className="text-sm text-muted">尚未收录档案。</p>}
        <p className="mt-5 text-xs text-muted">按档案编号展示前五条记录，点击标题查看公开详情。</p>
      </AdminPanel>
      <div className="space-y-6"><AdminPanel title="工作入口"><Link href="/admin/midis" className="block rounded-lg bg-[#f2f4f0] p-4 text-sm font-medium hover:bg-[#e7eee2]">浏览 MIDI 档案 <span className="float-right">→</span></Link><Link href="/admin/modules" className="mt-3 block rounded-lg bg-[#f2f4f0] p-4 text-sm font-medium hover:bg-[#e7eee2]">查看模块目录 <span className="float-right">→</span></Link></AdminPanel>
      <AdminPanel title="资料维护"><p className="text-sm leading-7 text-muted">请依据可核实的来源填写资料，未确认的信息保持留空或标记为未知。保存后内容立即公开，修改档案地址前请核对现有引用。</p></AdminPanel></div>
    </div>
  </>;
}
