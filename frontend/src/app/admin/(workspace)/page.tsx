import Link from "next/link";
import { getCatalogOverview } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";
import { EntryActivity, MetricGrid, primaryLink, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "工作台" };

export default async function AdminOverview() {
  await requireAdmin();
  let overview;
  try { overview = await getCatalogOverview(); } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  const pending = overview ? overview.stats.statuses.partially_recovered + overview.stats.statuses.lost + overview.stats.statuses.uncertain : undefined;
  return <>
    <AdminPageHeader eyebrow="Workspace / Overview" title="管理工作台" description="从待完善的记录开始，补充作品资料、核对历史来源，继续整理每一份档案。" />
    <div className="mb-6 flex flex-wrap gap-3"><Link href="/admin/midis/new" className={primaryLink}>新增 MIDI 档案</Link><Link href="/admin/people/new" className={secondaryLink}>新增人物</Link><Link href="/admin/midis" className="px-2 py-2.5 text-sm text-muted hover:text-accent hover:underline">管理全部档案 →</Link></div>
    {!overview ? <AdminUnavailable /> : <>
      <MetricGrid items={[
        { label: "已收录档案", value: overview.stats.entries, note: "全库作品总数", href: "/admin/midis" },
        { label: "尚未归档", value: pending!, note: "部分寻回、待寻回与尚待确认" },
        { label: "尚无文件", value: overview.stats.entries - overview.stats.with_files, note: "没有关联文件记录的作品" },
        { label: "人物资料", value: overview.stats.people, note: "作者及其他参与者", href: "/admin/people" },
      ]} />
      <div className="mt-7 grid items-start gap-5 xl:grid-cols-2">
        <AdminPanel title="需要关注" action={<Link href="/recovery" className="archive-link text-xs">查看公开状态 →</Link>}><p className="mb-5 text-xs leading-6 text-muted">未标记为已归档的记录，最多 6 条。点击标题直接编辑。</p><EntryActivity entries={overview.needs_attention} admin empty="目前没有未归档的记录。可以继续核对作品的署名、来源与文件信息。" /></AdminPanel>
        <AdminPanel title="最近修改" action={<Link href="/admin/midis" className="archive-link text-xs">全部档案 →</Link>}><p className="mb-5 text-xs leading-6 text-muted">按修改时间倒序展示最近 6 条记录。点击标题继续维护。</p><EntryActivity entries={overview.recent} admin empty="尚未收录档案。使用上方「新增 MIDI 档案」开始建档。" /></AdminPanel>
      </div>
      <aside className="mt-6 rounded-xl border border-line bg-white/50 px-5 py-4 text-xs leading-6 text-muted"><h2 className="mb-1 font-medium text-foreground">整理提示</h2><p>归档状态、文件记录和分发权限分别维护。尚无文件只表示未关联文件记录，不代表作品一定失传；修改资料时请保留可核实的来源，未知信息保持留空或标记为待确认。</p></aside>
    </>}
  </>;
}
