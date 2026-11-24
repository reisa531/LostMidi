import Link from "next/link";
import { getCatalogOverview } from "@/lib/api/catalog";
import { ApiError } from "@/lib/api/client";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminPageHeader, AdminPanel, AdminUnavailable } from "@/components/admin/ui";
import { EntryActivity, MetricGrid, primaryLink, secondaryLink } from "@/components/catalog/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "工作台" };

export default async function AdminOverview() {
  const admin = await requireAdmin();
  let overview;
  try { overview = await getCatalogOverview({ cache: "bypass" }); } catch (error) {
    if (!(error instanceof ApiError)) throw error;
  }
  const pending = overview ? overview.stats.statuses.verifying + overview.stats.statuses.lost : undefined;
  return <>
    <AdminPageHeader eyebrow="工作台 / 总览" title="管理工作台" description={"从待完善记录入手，补充作品资料、核对来源，逐条整理档案。"} />
    <nav aria-label="工作台操作" className="mb-6 flex flex-wrap gap-3"><Link href="/admin/midis/new" className={primaryLink}>新增音乐条目</Link><Link href="/admin/people/new" className={secondaryLink}>新增人物</Link><Link href={admin.role !== "maintainer" ? "/admin/changes" : "/admin/submissions"} className={secondaryLink}>{admin.role !== "maintainer" ? "查看待审核申请" : "查看我的申请"}</Link></nav>
    {admin.role === "maintainer" && <p className="mb-5">如需申请管理员，请<Link className="archive-link" href="/about#contact">联系站长</Link>，附上用户名与申请理由。</p>}
    {!overview ? <AdminUnavailable /> : <>
      <MetricGrid items={[
        { label: "已收录档案", value: overview.stats.entries, note: "全库作品总数", href: "/admin/midis" },
        { label: "尚未归档", value: pending!, note: "验证中或待寻回的作品" },
        { label: "尚无文件", value: overview.stats.entries - overview.stats.with_files, note: "未关联文件记录的作品" },
        { label: "人物资料", value: overview.stats.people, note: "作者及其他参与者", href: "/admin/people" },
      ]} />
      <div className="mt-7 grid items-start gap-5 xl:grid-cols-2">
        <AdminPanel title="需要关注" action={<Link href="/recovery" className="archive-link text-xs">查看公开状态 →</Link>}><p className="mb-5 text-xs leading-6 text-muted">未标记为已归档的记录，最多 6 条。点击标题直接编辑。</p><EntryActivity entries={overview.needs_attention} admin empty={"暂无未归档条目。可继续核对作品署名、来源与文件信息。"} /></AdminPanel>
        <AdminPanel title="最近修改" action={<Link href="/admin/midis" className="archive-link text-xs">全部档案 →</Link>}><EntryActivity entries={overview.recent} admin empty={"尚未收录档案。点击上方「新增音乐条目」开始建档。"} /></AdminPanel>
      </div>

    </>}
  </>;
}
