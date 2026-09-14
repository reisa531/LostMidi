import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonById } from "@/lib/api/person";
import { ApiError } from "@/lib/api/client";
import { Section, Unavailable, roleName } from "@/components/archive";

export const dynamic = "force-dynamic";
export const metadata = { title: "人物档案" };
export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let detail;
  try { detail = await getPersonById(id); } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <Unavailable />;
    throw error;
  }
  return <article className="mx-auto max-w-3xl"><p className="eyebrow">People of the archive</p>
    <h1 className="my-6 font-serif text-4xl">{detail.person.display_name}</h1>
    <p className="mb-10 whitespace-pre-wrap leading-8 text-muted">{detail.person.biography ?? "人物生平尚待补充。"}</p>
    <Section title="历史昵称"><p>{detail.aliases.join(" / ") || "尚未登记昵称。"}</p></Section>
    <Section title="相关作品">{detail.midis.length ? <ul className="space-y-4">{detail.midis.map(m => <li key={`${m.id}-${m.role}`}>
      <Link className="archive-link" href={`/midis/${m.slug}`}>{m.title}</Link><span className="ml-3 text-muted">{roleName(m.role)}</span>
    </li>)}</ul> : <p className="text-muted">尚无作品署名记录。</p>}</Section>
  </article>;
}
