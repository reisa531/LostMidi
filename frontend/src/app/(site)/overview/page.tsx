import Link from "next/link";
import { loadOverview } from "@/lib/api/overview";
import { Unavailable } from "@/components/archive";
import { EntryActivity, OverviewMetrics, PageHeader, StatusSummary, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "档案总览",
  description: "汇总全库作品、人物、文件与来源统计，以及最近更新和需关注的条目。",
  alternates: { canonical: "/overview" },
};

export default async function Overview() {
  const state = await loadOverview();
  if ("unavailable" in state) return <Unavailable />;
  const overview = state.overview;
  return <>
    <PageHeader title="档案总览" description={"从一首作品、一位作者或一个旧站点出发，追溯早期网络 MIDI 的来处。以下为档案当前记录。"} action={<Link href="/midis" className={secondaryLink}>浏览全部 MIDI <span aria-hidden="true" className="ml-4">→</span></Link>} />
    <OverviewMetrics stats={overview.stats} />
    <section className="mb-8 mt-8"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl">寻回进度</h2><Link href="/recovery" className="archive-link text-xs">查看状态明细 →</Link></div><StatusSummary stats={overview.stats} /></section>
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">最近更新</h2><p className="mt-1 text-xs text-muted">按修改时间排列 · 最多 6 条</p></div><Link href="/midis" className="archive-link text-xs">全部档案 →</Link></header><div className="p-5"><EntryActivity entries={overview.recent} empty={"暂未收录档案，第一份作品条目将从这里开始。"} /></div></section>
      <section className="min-w-0 rounded-xl border border-line bg-white/60"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><h2 className="font-serif text-xl">需要关注</h2><p className="mt-1 text-xs text-muted">尚未标记为已归档 · 最多 6 条</p></div><Link href="/recovery" className="archive-link text-xs">继续寻回 →</Link></header><div className="p-5"><EntryActivity entries={overview.needs_attention} empty={"当前没有未归档条目。归档状态与文件留存分开记录。"} /></div></section>
    </div>
    <aside className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-wash px-5 py-4"><div className="min-w-0"><h2 className="text-sm font-medium">按人物与站点，连接散落的作品</h2><p className="mt-1 text-xs leading-6 text-muted">按作者或来源汇总条目，查看各组作品、文件留存与下载权限。</p></div><Link className="archive-link shrink-0 text-sm" href="/map">打开关系图谱 →</Link></aside>
  </>;
}
