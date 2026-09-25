import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getMidiByPublicId, getMidiBySlug } from "@/lib/api/midi";
import { ApiError } from "@/lib/api/client";
import { Credits, Status, Section, Unavailable, ExternalSource, dateLabel, copyrightLabel, distributionLabel } from "@/components/archive";
import { MidiDownload } from "@/components/midi-download";
import type { Metadata } from "next";
import { Markdown, markdownSummary } from "@/components/markdown";
import { getMidiArticles } from "@/lib/api/articles";
import { RelatedArticles } from "@/components/related-articles";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug);
    const detail = stableId ? await getMidiByPublicId(slug) : await getMidiBySlug(slug);
    const title = detail.entry.title;
    const description = markdownSummary(detail.entry.description || `查看 ${title} 的 MIDI 作品、署名、历史来源与寻回记录。`, 155);
    return { title, description, alternates: { canonical: `/midis/${detail.entry.slug}` }, openGraph: { type: "article", title, description }, twitter: { card: "summary", title, description } };
  } catch { return { title: "档案详情", robots: { index: false, follow: false } }; }
}
export default async function MidiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug);
  if (!stableId && (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 160)) notFound();
  let detail;
  try { detail = stableId ? await getMidiByPublicId(slug) : await getMidiBySlug(slug); } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  if (stableId) permanentRedirect(`/midis/${detail.entry.slug}`);
  const relatedArticles = await getMidiArticles(detail.entry.public_id);
  const { entry, credits, historical_sources, recovery_events, files } = detail;
  const structuredData = {
    "@context": "https://schema.org", "@type": "MusicComposition", name: entry.title,
    description: entry.description ? markdownSummary(entry.description, 155) : undefined, dateCreated: entry.estimated_date ?? (entry.estimated_year ? String(entry.estimated_year) : undefined),
    url: `${process.env.ADMIN_ORIGIN ?? ""}/midis/${detail.entry.slug}`,
    author: credits.map(credit => ({ "@type": "Person", name: credit.display_name })),
  };
  return <article className="mx-auto max-w-3xl">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <Link href="/midis" className="archive-link text-sm">← 全部 MIDI 档案</Link>
    <p className="eyebrow mt-10">档案编号 / {entry.id}</p>
    <h1 className="mb-5 mt-4 break-words font-serif text-4xl leading-tight">{entry.title}</h1>
    <div className="mb-7 flex items-center gap-4"><Status status={entry.archive_status} /><span className="text-sm text-muted">推测时间：{entry.estimated_date ? `约 ${entry.estimated_date}` : entry.estimated_year ? `约 ${entry.estimated_year} 年` : "不详"}</span></div>
    {entry.description ? <Markdown source={entry.description} className="mb-9" /> : <p className="mb-9 text-muted">尚无描述。</p>}
    <Section title="人物与署名"><Credits credits={credits} /></Section>
    <Section title="历史来源">{historical_sources.length ? historical_sources.map(source => <div className="min-w-0 [overflow-wrap:anywhere]" key={source.id}>
      <h3 className="font-semibold">{source.website_name}</h3>
      <p className="text-xs text-muted">首次记录 {dateLabel(source.first_seen_at)} · 最后记录 {dateLabel(source.last_seen_at)}</p>
      <div className="flex flex-wrap gap-5"><ExternalSource url={source.original_url} label="原始网址" /><ExternalSource url={source.wayback_url} label="历史快照" /></div>
      {source.notes ? <Markdown source={source.notes} /> : <p className="text-muted">暂无补充说明。</p>}
    </div>) : <p className="text-muted">尚未登记历史来源。</p>}</Section>
    <Section title="寻回记录">{recovery_events.length ? recovery_events.map(event => <div className="min-w-0 border-l-2 border-line pl-5 [overflow-wrap:anywhere]" key={event.id}>
      <p className="mb-2 text-xs text-muted">{dateLabel(event.recovered_at)} · {event.recovered_by_name ?? "寻回人不详"}</p>
      <Markdown source={event.story} /><div className="mt-3"><p className="text-xs text-muted">证据说明</p>{event.evidence ? <Markdown source={event.evidence} /> : <p className="text-muted">尚未补充</p>}</div>
    </div>) : <p className="text-muted">尚无寻回记录。</p>}</Section>
    <Section title="文件信息">{files.length ? <>
      <p className="text-muted">文件是否可下载以具体档案权限为准。公开分发不转让版权，使用时请遵守下方许可与署名要求。</p>
      {files.map(file => <div key={file.id} className="min-w-0 rounded-sm border border-line p-4 sm:p-5">
        <dl className="space-y-3">
          <div><dt className="text-muted">原始文件名</dt><dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{file.original_filename}</dd></div>
          <div><dt className="text-muted">大小</dt><dd>{file.file_size.toLocaleString("zh-CN")} 字节</dd></div>
          <div><dt className="text-muted">SHA-256</dt><dd className="min-w-0 break-all font-mono text-xs">{file.sha256}</dd></div>
          <div><dt className="text-muted">发现时间</dt><dd>{dateLabel(file.discovered_at)}</dd></div>
        </dl>
        {file.download_available === true ? <MidiDownload slug={entry.slug} id={file.id} filename={file.original_filename} /> : <div className="mt-5 space-y-2">
          <button type="button" disabled className="w-full cursor-not-allowed rounded-sm border border-line px-4 py-2 text-sm text-muted sm:w-auto">暂不可下载</button>
          <p className="text-muted">{entry.distribution_permission === "restricted" ? "此档案限制分发，暂不提供文件下载。"
            : entry.distribution_permission === "metadata_only" ? "此档案仅公开文字资料，不提供文件下载。"
            : "尚未确认此文件可公开分发，暂不提供下载。"}</p><p className="text-sm">如需申请获取，请通过<Link href="/about#contact" className="archive-link">联系我们</Link>说明用途；能否提供需结合授权条款确认。</p>
        </div>}
      </div>)}
    </> : <p className="text-muted">尚未收录文件。此档案目前仅保存文字资料。</p>}</Section>
    <Section title="权利信息"><dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-muted">版权状态</dt><dd>{copyrightLabel(entry.copyright_status)}</dd></div>
      <div><dt className="text-muted">分发许可</dt><dd>{distributionLabel(entry.distribution_permission)}</dd></div>
      <div><dt className="text-muted">许可证</dt><dd>{entry.license ?? "尚未确认"}</dd></div>
      <div><dt className="text-muted">权利人</dt><dd>{entry.rights_holder ?? "尚未确认"}</dd></div>
    </dl></Section>
    <RelatedArticles articles={relatedArticles} />
  </article>;
}
