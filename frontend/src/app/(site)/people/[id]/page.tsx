import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/api/person";
import { ApiError } from "@/lib/api/client";
import { Section, Unavailable, roleName } from "@/components/archive";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  try {
    const detail = await getPersonById(id);
    const title = detail.person.display_name;
    const description = detail.person.biography?.slice(0, 155) || `${title} 的人物档案、历史昵称与相关 MIDI 作品。`;
    return { title, description, alternates: { canonical: `/people/${id}` }, openGraph: { type: "profile", title, description } };
  } catch { return { title: "人物档案", robots: { index: false, follow: false } }; }
}
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let detail;
  try { detail = await getPersonById(id); } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  const structuredData = { "@context": "https://schema.org", "@type": "Person", name: detail.person.display_name, description: detail.person.biography || undefined, url: `${process.env.ADMIN_ORIGIN ?? ""}/people/${id}` };
  return <article className="mx-auto max-w-3xl"><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} /><p className="eyebrow">People of the archive</p>
    <h1 className="my-6 font-serif text-4xl">{detail.person.display_name}</h1>
    <p className="mb-10 whitespace-pre-wrap leading-8 text-muted">{detail.person.biography ?? "人物生平尚待补充。"}</p>
    <Section title="历史昵称"><p>{detail.aliases.join(" / ") || "尚未登记昵称。"}</p></Section>
    <Section title="相关作品">{detail.midis.length ? <ul className="space-y-4">{detail.midis.map(m => <li key={`${m.id}-${m.role}`}>
      <Link className="archive-link" href={`/midis/${m.slug}`}>{m.title}</Link><span className="ml-3 text-muted">{roleName(m.role)}</span>
    </li>)}</ul> : <p className="text-muted">尚无作品署名记录。</p>}</Section>
  </article>;
}
