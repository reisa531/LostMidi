import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { getPersonById } from "@/lib/api/person";
import { ApiError } from "@/lib/api/client";
import { Section, Unavailable, roleName } from "@/components/archive";
import type { Metadata } from "next";
import { Markdown, markdownSummary } from "@/components/markdown";
import { getPersonArticles } from "@/lib/api/articles";
import { RelatedArticles } from "@/components/related-articles";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await getPersonById(id);
    const title = detail.person.display_name;
    const description = markdownSummary(detail.person.summary || detail.person.biography || `${title} 的人物档案、历史昵称与相关 MIDI 作品。`, 155);
    const sameAs = Array.isArray(detail.person.profile.sameAs) ? detail.person.profile.sameAs.filter((url): url is string => typeof url === "string" && /^https:\/\//.test(url)) : [];
    return { title, description, alternates: { canonical: `/people/${detail.person.public_id}` }, openGraph: { type: "profile", title, description }, twitter: { card: "summary", title, description }, other: sameAs.length ? { "profile:same_as": sameAs } : undefined };
  } catch { return { title: "人物档案", robots: { index: false, follow: false } }; }
}
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stableId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id);
  const legacyId = /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807");
  if (!stableId && !legacyId) notFound();
  let detail;
  try { detail = await getPersonById(id); } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  if (!stableId) permanentRedirect(`/people/${detail.person.public_id}`);
  const relatedArticles = await getPersonArticles(detail.person.public_id);
  const profile = detail.person.profile;
  const summary = detail.person.summary || markdownSummary(detail.person.biography ?? `${detail.person.display_name} 的人物档案、历史昵称与相关 MIDI 作品。`, 155);
  const sameAs = Array.isArray(profile.sameAs) ? profile.sameAs.filter((url): url is string => typeof url === "string" && /^https:\/\//.test(url)) : [];
  const structuredData = { "@context": "https://schema.org", "@type": "Person", name: detail.person.display_name, description: summary, sameAs: sameAs.length ? sameAs : undefined, alternateName: detail.aliases.length ? detail.aliases : undefined, url: `${process.env.ADMIN_ORIGIN ?? ""}/people/${detail.person.public_id}` };
  const facts = ["country", "activeTime", "pronunciation", "birthText", "birthplace", "residence", "education", "gender", "roles"].filter(key => profile[key] && (!Array.isArray(profile[key]) || profile[key].length));
  const sites = Array.isArray(profile.sites) ? profile.sites : [];
  const midiGroups = [...detail.midis.reduce((map, midi) => { const current = map.get(midi.id) ?? { ...midi, roles: [] as string[] }; current.roles.push(midi.role); map.set(midi.id, current); return map; }, new Map<string, { id: string; public_id: string; slug: string; title: string; roles: string[] }>()).values()];
  const headingCounts = new Map<string, number>();
  const headings = (detail.person.biography ?? "").split(/\r?\n/).flatMap(line => { const match = line.match(/^\s*(?:#{1,6}\s+|【)(.*?)(?:】)?\s*$/); if (!match?.[1]) return []; const title = match[1].trim(), base = title.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/g, "-").replace(/^-|-$/g, "") || "section", count = headingCounts.get(base) ?? 0; headingCounts.set(base, count + 1); return [{ title, id: count ? `${base}-${count + 1}` : base }]; });
  const neighbors = [detail.previous, detail.next].filter(Boolean);
  return <article className="mx-auto max-w-6xl"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><p className="eyebrow"><Link href="/people" className="archive-link">人物</Link> / 档案</p>
    <h1 className="my-6 font-serif text-4xl">{detail.person.display_name}</h1><p className="mb-8 max-w-3xl text-lg leading-8 text-muted">{summary}</p>
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]"><div className="min-w-0 space-y-8">
    <section aria-labelledby="bio-title"><h2 id="bio-title" className="mb-4 font-serif text-2xl">人物简介</h2>{detail.person.biography ? <Markdown source={detail.person.biography} /> : <p className="text-muted">人物生平尚待补充。</p>}</section>
    {headings.length > 0 && <nav aria-label="简介目录" className="rounded-xl border border-line bg-white/70 p-5"><h2 className="mb-3 font-semibold">本页目录</h2><ol className="space-y-2">{headings.map(item => <li key={item.id}><a className="archive-link" href={`#${item.id}`}>{item.title}</a></li>)}</ol></nav>}
    <Section title="历史昵称"><p>{detail.aliases.join(" / ") || "尚未登记昵称。"}</p>{Array.isArray(profile.aliasDetails) && <ul className="mt-3 space-y-2 text-sm">{profile.aliasDetails.map((item, index) => typeof item === "object" && item && <li key={index}><strong>{String((item as Record<string, unknown>).name ?? "")}</strong> · {String((item as Record<string, unknown>).note ?? "")} {String((item as Record<string, unknown>).period ?? "")} {String((item as Record<string, unknown>).source ?? "")}</li>)}</ul>}</Section>
    {Array.isArray(profile.timeline) && profile.timeline.length > 0 && <Section title="年表"><ol className="space-y-4">{profile.timeline.map((item, index) => typeof item === "object" && item && <li key={index} className="border-l-2 border-line pl-4"><p className="text-xs text-muted">{String((item as Record<string, unknown>).time ?? "时间未确认")}</p><Markdown source={String((item as Record<string, unknown>).event ?? "")} /></li>)}</ol></Section>}
    {Array.isArray(profile.sources) && profile.sources.length > 0 && <Section title="出处"><ul className="space-y-3">{profile.sources.map((item, index) => typeof item === "object" && item && <li key={index}>{String((item as Record<string, unknown>).title ?? "未命名来源")} {typeof (item as Record<string, unknown>).url === "string" && <a className="archive-link" href={String((item as Record<string, unknown>).url)} rel="noopener noreferrer" target="_blank">查看来源</a>}</li>)}</ul></Section>}
    {typeof profile.rights === "string" && profile.rights && <Section title="权利说明"><Markdown source={profile.rights} /></Section>}
    {Array.isArray(profile.works) && profile.works.length > 0 && <Section title="对外署名作品"><ul className="space-y-3">{profile.works.map((item, index) => { if (typeof item !== "object" || !item) return null; const work = item as Record<string, unknown>, title = String(work.title ?? "作品"), internal = typeof work.midiId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(work.midiId); return <li key={index}>{internal ? <Link className="archive-link" href={`/midis/${work.midiId}`}>{title}</Link> : typeof work.url === "string" ? <a className="archive-link" href={work.url} target="_blank" rel="noopener noreferrer">{title}</a> : title} {String(work.role ?? "")}</li>; })}</ul></Section>}
    {Array.isArray(profile.collaborators) && profile.collaborators.length > 0 && <Section title="合作者"><ul className="flex flex-wrap gap-3">{profile.collaborators.map((item, index) => typeof item === "object" && item && <li key={index}>{String((item as Record<string, unknown>).name ?? "合作者")}</li>)}</ul></Section>}
    {sameAs.length > 0 && <Section title="相关链接"><ul className="space-y-2">{sameAs.map(url => <li key={url}><a className="archive-link break-all" href={url} target="_blank" rel="noopener noreferrer">{url}</a></li>)}</ul></Section>}
    <Section title="相关作品">{midiGroups.length ? <ul className="space-y-4">{midiGroups.map(m => <li key={m.id}>
      <Link className="archive-link" href={`/midis/${m.slug}`}>{m.title}</Link><span className="ml-3 text-muted">{m.roles.map(roleName).join("、")}</span>
    </li>)}</ul> : <div className="space-y-2"><p className="text-muted">尚无作品署名记录。</p><Link href={`/search?person=${encodeURIComponent(detail.person.id)}`} className="archive-link">按此人物筛选 MIDI 目录 →</Link></div>}</Section>
    </div><aside className="h-fit rounded-xl border border-line bg-white/70 p-5"><h2 className="font-semibold">人物资料</h2><dl className="mt-4 space-y-4 text-sm">{facts.map(key => <div key={key}><dt className="text-xs text-muted">{({country:"国家",activeTime:"活动时间",pronunciation:"读音",birthText:"出生信息",birthplace:"出生地",residence:"居住地",education:"学历",gender:"性别",roles:"身份 / 乐器 / 工具"} as Record<string,string>)[key] ?? key}</dt><dd>{Array.isArray(profile[key]) ? (profile[key] as unknown[]).join("、") : String(profile[key])}{key === "birthText" && profile.birthCertainty && profile.birthCertainty !== "confirmed" ? `（${profile.birthCertainty === "approximate" ? "推测" : "未确认"}）` : ""}</dd></div>)}{sites.map((item, index) => typeof item === "object" && item && <div key={`site-${index}`}><dt className="text-xs text-muted">站点</dt><dd>{typeof (item as Record<string, unknown>).url === "string" ? <a className="archive-link" href={String((item as Record<string, unknown>).url)} target="_blank" rel="noopener noreferrer">{String((item as Record<string, unknown>).name ?? "站点")}</a> : String((item as Record<string, unknown>).name ?? "站点")}</dd></div>)}<div><dt className="text-xs text-muted">更新时间 · 版本</dt><dd>{detail.person.updated_at} · {detail.person.revision}</dd></div></dl><Link className="mt-5 inline-block text-sm archive-link" href={`/search?person=${encodeURIComponent(detail.person.id)}`}>相关作品搜索 →</Link><div className="mt-3 flex flex-wrap gap-3 text-xs"><Link className="archive-link" href={`/map?group=${encodeURIComponent(detail.person.id)}`}>来源图谱</Link><Link className="archive-link" href="/recovery">寻回记录</Link><Link className="archive-link" href="/midis">MIDI 目录</Link></div></aside></div>
    <div className="mt-10"><RelatedArticles articles={relatedArticles} /></div>
    {neighbors.length > 0 && <nav aria-label="相邻人物" className="mt-10 flex justify-between border-t border-line pt-5 text-sm">{detail.previous ? <Link className="archive-link" href={`/people/${detail.previous.public_id}`}>← {detail.previous.display_name}</Link> : <span />}{detail.next ? <Link className="archive-link" href={`/people/${detail.next.public_id}`}>{detail.next.display_name} →</Link> : <span />}</nav>}
  </article>;
}
