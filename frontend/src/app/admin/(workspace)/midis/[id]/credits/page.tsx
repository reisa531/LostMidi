import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { getPeople, type CreditEdit } from "@/lib/admin/people";
import type { MidiEntry } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";
import { CreditsForm } from "@/components/admin/credits-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
export const metadata = { title: "作品署名" };
export default async function CreditsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let data;
  let role: "admin" | "super_admin";
  try { [data, role] = await Promise.all([Promise.all([adminRequest<CreditEdit>(`/api/v1/admin/midis/${id}/credits`), getPeople(), adminRequest<MidiEntry>(`/api/v1/admin/midis/${id}`)]), adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session").then(session => session.role)]); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <AdminUnavailable />;
    throw error;
  }
  const [entry, people, midi] = data;
  const { saved } = await searchParams;
  return <><AdminPageHeader eyebrow={`Collection / ${id} / Credits`} title={`作品署名 · ${midi.title}`} description="维护作品中的作曲、编曲、音序制作及贡献者署名。署名与作品资料共用保存版本。" />
    {saved === "1" && <p role="status" className="mb-6 rounded bg-green-50 p-4 text-sm text-green-900">署名已保存。<Link href={`/midis/${midi.public_id}`} className="ml-4 underline">查看公开详情</Link></p>}
    <CreditsForm key={`${id}-${entry.revision}`} midiId={id} entry={entry} people={people} reviewRequired={role === "admin"} /></>;
}
