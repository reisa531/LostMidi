import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMidiByPublicId, getMidiBySlug } from "@/lib/api/midi";
import { ApiError } from "@/lib/api/client";
import { Status, Section, Unavailable, ExternalSource, dateLabel, copyrightLabel, distributionLabel, roleName } from "@/components/archive";
import { MidiFileInformation } from "@/components/midi-file-information";
import { UsageTerms } from "@/components/usage-terms";
import { EvidenceAttachments } from "@/components/evidence-attachments";
import type { Metadata } from "next";
import { Markdown, markdownSummary } from "@/components/markdown";
import { Suspense } from "react";
import { RelatedArticlesFor } from "@/components/related-articles";
import { RelatedEntries } from "@/components/related-entries";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { absoluteUrl, jsonLd, siteOrigin } from "@/lib/seo";
import { musicCompositionSchema, type Crumb } from "@/lib/schema";
import { extractMidiFileMetadata } from "@/lib/midi-file-metadata";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug);
    const detail = stableId ? await getMidiByPublicId(slug) : await getMidiBySlug(slug);
    const title = detail.entry.title;
    const description = markdownSummary(detail.entry.description || `查看 ${title} 的 MIDI 作品、署名、来源与寻回记录。`, 155);
    const path = `/midis/${detail.entry.slug}`;
    return { title, description, alternates: { canonical: path },
      openGraph: { type: "article", title, description, url: absoluteUrl(path) ?? undefined, modifiedTime: detail.entry.updated_at },
      twitter: { card: "summary_large_image", title, description } };
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
  if (slug !== detail.entry.slug) redirect(`/midis/${detail.entry.slug}`);
  const { entry, historical_sources, recovery_events, files } = detail;
  const fileMetadata = extractMidiFileMetadata(entry.description ?? "");
  const credits = detail.credits.filter(credit => credit.role !== "contributor");
  const authors = new Map(detail.people.map(person => [person.id, person]));
  const personPath = (personId: string) => `/people/${authors.get(personId)?.public_id ?? personId}`;
  const composer = credits.find(credit => credit.role === "composer");
  const sourceNames = [...new Set(historical_sources.map(source => source.website_name))];
  const structuredData = musicCompositionSchema({
    origin: siteOrigin() ?? undefined, path: `/midis/${detail.entry.slug}`, title: entry.title,
    description: entry.description ? markdownSummary(entry.description, 155) : undefined,
    identifier: entry.public_id,
    dateCreated: entry.estimated_date ?? (entry.estimated_year ? String(entry.estimated_year) : undefined),
    dateModified: entry.updated_at,
    composers: credits.filter(credit => credit.role === "composer").map(credit => ({ name: credit.display_name, path: personPath(credit.person_id) })),
    contributors: credits.filter(credit => credit.role !== "composer").map(credit => ({ name: credit.display_name, path: personPath(credit.person_id) })),
  });
  const crumbs: Crumb[] = [
    { name: "首页", path: "/" },
    { name: "MIDI 档案", path: "/midis" },
    { name: entry.title, path: `/midis/${detail.entry.slug}` },
  ];
  return <article className="record-page">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }} />
    <Breadcrumbs items={crumbs} />
    <header className="record-header"><p className="eyebrow">档案编号 / {entry.id}</p>
    <h1 className="mb-5 mt-4 break-words font-serif text-4xl leading-tight">{entry.title}</h1>
    <div className="mb-7 flex items-center gap-4"><Status status={entry.archive_status} /><span className="text-sm text-muted">推测时间：{entry.estimated_date ? `约 ${entry.estimated_date}` : entry.estimated_year ? `约 ${entry.estimated_year} 年` : "不详"}</span></div>
    </header>
    <div className="record-grid">
      <nav className="record-index" aria-label="本页目录"><p>本页目录</p>
        <a href="#record-credits">人物与署名</a>
        <a href="#record-contributors">档案贡献者</a>
        <a href="#record-sources">来源</a>
        <a href="#record-recovery">寻回记录</a>
        <a href="#record-files">文件信息</a>
        <a href="#record-rights">权利信息</a>
      </nav>
      <div className="record-body">
    {fileMetadata.description ? <Markdown source={fileMetadata.description} className="mb-9" /> : <p className="mb-9 text-muted">尚无描述。</p>}
    <Section id="record-credits" title="人物与署名">{credits.length ? <ul className="grid gap-3 sm:grid-cols-2">{credits.map(credit => {
      const rights = authors.get(credit.person_id)?.profile.rights;
      return <li key={`${credit.person_id}-${credit.role}`} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-white/70 px-4 py-3">
        <Link className="archive-link min-w-0 break-words font-medium" href={`/people/${authors.get(credit.person_id)?.public_id ?? credit.person_id}`}>{credit.display_name}</Link>
        <span className="text-xs text-muted">{roleName(credit.role)}</span>
        {typeof rights === "string" && rights.trim() && <UsageTerms author={credit.display_name} terms={rights} />}
      </li>;
    })}</ul> : <p className="text-muted">作者尚待考证。</p>}</Section>
    <Section id="record-contributors" title="档案贡献者"><p className="text-muted">提交或完善本条目的后台用户。</p>{detail.contributors?.length ? <ul className="flex flex-wrap gap-2">{detail.contributors.map(username => <li key={username} className="rounded-full border border-line bg-white px-3 py-1 text-sm">{username}</li>)}</ul> : <p className="text-muted">暂无可核实的用户贡献记录。</p>}</Section>
    <Section id="record-sources" title={"来源"}>{historical_sources.length ? <><p className="text-xs text-muted">共 {historical_sources.length} 条线索；点击条目查看详情。</p><div className="space-y-3">{historical_sources.map(source => <details className="group min-w-0 rounded-lg border border-line bg-white/70 [overflow-wrap:anywhere]" key={source.id} open={historical_sources.length === 1}>
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 marker:hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><span className="min-w-0 font-medium">{source.website_name}<span className="ml-3 text-xs font-normal text-muted">{dateLabel(source.first_seen_at)}{source.evidence_files?.length ? ` · ${source.evidence_files.length} 个附件` : ""}</span></span><span aria-hidden="true" className="shrink-0 text-accent transition-transform group-open:rotate-180">⌄</span></summary>
      <div className="space-y-3 border-t border-line px-4 py-4"><p className="text-xs text-muted">首次记录 {dateLabel(source.first_seen_at)} · 最后记录 {dateLabel(source.last_seen_at)}</p>
      <div className="flex flex-wrap gap-5"><ExternalSource url={source.original_url} label="原始网址" /><ExternalSource url={source.wayback_url} label="历史快照" /></div>
      {source.notes ? <Markdown source={source.notes} /> : <p className="text-muted">暂无补充说明。</p>}
      <EvidenceAttachments midiId={entry.id} files={source.evidence_files ?? []} /></div>
    </details>)}</div></> : <p className="text-muted">尚未登记来源。</p>}</Section>
    <Section id="record-recovery" title="寻回记录">{recovery_events.length ? recovery_events.map(event => <div className="min-w-0 border-l-2 border-line pl-5 [overflow-wrap:anywhere]" key={event.id}>
      <p className="mb-2 text-xs text-muted">{dateLabel(event.recovered_at)} · {event.recovered_by_name ?? "寻回人不详"}</p>
      <Markdown source={event.story} /><div className="mt-3"><p className="text-xs text-muted">证据说明</p>{event.evidence ? <Markdown source={event.evidence} /> : <p className="text-muted">尚未补充</p>}</div>
      <div className="mt-4"><EvidenceAttachments midiId={entry.id} files={event.evidence_files ?? []} /></div>
    </div>) : <p className="text-muted">尚无寻回记录。</p>}</Section>
    <MidiFileInformation slug={entry.slug} stored={files} metadata={fileMetadata.files}
      redistributionProhibited={Boolean(entry.description?.includes("《音乐利用規約》禁止未经许可的 MIDI 再分发"))} />
    <Section id="record-rights" title="权利信息"><dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-muted">版权状态</dt><dd>{copyrightLabel(entry.copyright_status)}</dd></div>
      <div><dt className="text-muted">分发许可</dt><dd>{distributionLabel(entry.distribution_permission)}</dd></div>
      <div><dt className="text-muted">许可证</dt><dd>{entry.license ?? "尚未确认"}</dd></div>
      <div><dt className="text-muted">权利人</dt><dd>{entry.rights_holder ?? "尚未确认"}</dd></div>
    </dl></Section>
    <Suspense fallback={<p className="border-t border-line pt-5 text-sm text-muted">正在加载相关档案…</p>}>
      <RelatedEntries sources={sourceNames} person={composer ? { id: composer.person_id, name: composer.display_name } : undefined} excludeSlug={entry.slug} />
    </Suspense>
    <Suspense fallback={<p className="text-sm text-muted">正在加载相关文章…</p>}><RelatedArticlesFor kind="midi" id={detail.entry.public_id} /></Suspense>
      </div>
    </div>
  </article>;
}
