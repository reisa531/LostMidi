import Link from "next/link";
import { notFound } from "next/navigation";
import { getMidiBySlug } from "@/lib/api/midi";
import { ApiError } from "@/lib/api/client";
import { Credits, Status, Section, Unavailable, ExternalSource, dateLabel, copyrightLabel, distributionLabel } from "@/components/archive";

export const dynamic = "force-dynamic";
export const metadata = { title: "档案详情" };
export default async function MidiDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 160) notFound();
  let detail;
  try { detail = await getMidiBySlug(slug); } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const { entry, credits, historical_sources, recovery_events, files } = detail;
  return <article className="mx-auto max-w-3xl">
    <Link href="/midis" className="archive-link text-sm">← 全部 MIDI 档案</Link>
    <p className="eyebrow mt-10">Archive record / {entry.id}</p>
    <h1 className="mb-5 mt-4 break-words font-serif text-4xl leading-tight">{entry.title}</h1>
    <div className="mb-7 flex items-center gap-4"><Status status={entry.archive_status} /><span className="text-sm text-muted">推测年代：{entry.estimated_year ?? "不详"}</span></div>
    <p className="mb-9 whitespace-pre-wrap leading-8 text-muted">{entry.description ?? "尚无描述。"}</p>
    <Section title="人物与署名"><Credits credits={credits} /></Section>
    <Section title="历史来源">{historical_sources.length ? historical_sources.map(source => <div key={source.id}>
      <h3 className="font-semibold">{source.website_name}</h3>
      <p className="text-xs text-muted">首次记录 {dateLabel(source.first_seen_at)} · 最后记录 {dateLabel(source.last_seen_at)}</p>
      <div className="flex flex-wrap gap-5"><ExternalSource url={source.original_url} label="原始网址" /><ExternalSource url={source.wayback_url} label="历史快照" /></div>
      <p className="whitespace-pre-wrap">{source.notes ?? "暂无补充说明。"}</p>
    </div>) : <p className="text-muted">尚未登记历史来源。</p>}</Section>
    <Section title="寻回记录">{recovery_events.length ? recovery_events.map(event => <div className="border-l-2 border-line pl-5" key={event.id}>
      <p className="mb-2 text-xs text-muted">{dateLabel(event.recovered_at)} · {event.recovered_by ? <Link className="archive-link" href={`/people/${event.recovered_by}`}>{event.recovered_by_name ?? "贡献者"}</Link> : "贡献者不详"}</p>
      <p className="whitespace-pre-wrap">{event.story}</p><p className="mt-3 whitespace-pre-wrap text-muted">证据说明：{event.evidence ?? "尚未补充"}</p>
    </div>) : <p className="text-muted">尚无寻回记录。</p>}</Section>
    <Section title="文件信息">{files.length ? files.map(file => <dl key={file.id} className="space-y-2">
      <div><dt className="text-muted">原始文件名</dt><dd className="break-all">{file.original_filename}</dd></div>
      <div><dt className="text-muted">大小</dt><dd>{file.file_size.toLocaleString("zh-CN")} 字节</dd></div>
      <div><dt className="text-muted">SHA-256</dt><dd className="break-all font-mono text-xs">{file.sha256}</dd></div>
      <div><dt className="text-muted">发现时间</dt><dd>{dateLabel(file.discovered_at)}</dd></div>
    </dl>) : <p className="text-muted">尚无已登记的 MIDI 文件。此档案目前仅保存文字资料。</p>}</Section>
    <Section title="权利信息"><dl className="grid gap-4 sm:grid-cols-2">
      <div><dt className="text-muted">版权状态</dt><dd>{copyrightLabel(entry.copyright_status)}</dd></div>
      <div><dt className="text-muted">分发许可</dt><dd>{distributionLabel(entry.distribution_permission)}</dd></div>
      <div><dt className="text-muted">许可证</dt><dd>{entry.license ?? "尚未确认"}</dd></div>
      <div><dt className="text-muted">权利人</dt><dd>{entry.rights_holder ?? "尚未确认"}</dd></div>
    </dl></Section>
  </article>;
}
