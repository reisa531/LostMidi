import Link from "next/link";
import { ApiError } from "@/lib/api/client";
import { getCatalogOverview } from "@/lib/api/catalog";
import { Unavailable } from "@/components/archive";
import { DataNote, EntryActivity, OverviewMetrics, PageHeader, StatusSummary, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "首页总览", alternates: { canonical: "/" } };

export default async function Home() {
  let overview;
  try { overview = await getCatalogOverview(); } catch (error) {
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  return <>
    <PageHeader eyebrow="Archive / Overview" title="档案总览" description="从一首作品、一位作者或一个旧网站出发，继续整理早期网络 MIDI 的来处。这里是档案此刻的真实记录。" action={<Link href="/midis" className={secondaryLink}>浏览全部 MIDI <span aria-hidden="true" className="ml-4">→</span></Link>} />
    <OverviewMetrics stats={overview.stats} />
    <div className="mb-8 mt-3"><DataNote /></div>
    <section className="mb-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">寻回进度</h2><Link href="/recovery" className="archive-link text-xs">查看状态明细 →</Link></div><StatusSummary stats={overview.stats} /></section>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">最近更新</h2><p className="mt-1 text-xs text-muted">按修改时间排列 · 最多 6 条</p></div><Link href="/midis" className="archive-link text-xs">全部档案 →</Link></header><div className="p-5"><EntryActivity entries={overview.recent} empty="还没有收录档案。第一份作品资料将从这里开始。" /></div></section>
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">需要关注</h2><p className="mt-1 text-xs text-muted">尚未标记为已归档 · 最多 6 条</p></div><Link href="/recovery" className="archive-link text-xs">继续寻回 →</Link></header><div className="p-5"><EntryActivity entries={overview.needs_attention} empty="目前没有未归档的记录。归档状态与文件情况独立记录。" /></div></section>
    </div>
    <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-[#edf0e5] px-5 py-4"><div className="min-w-0"><h2 className="text-sm font-medium">从人物与网站，连接散落的作品</h2><p className="mt-1 text-xs leading-6 text-muted">Map 按作者或来源汇总档案，查看每组作品、文件和下载权限情况。</p></div><Link className="archive-link shrink-0 text-sm" href="/map">打开 Map →</Link></aside>
  </>;
}
