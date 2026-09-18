import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { MidiEntry } from "@/lib/api/types";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { MidiForm } from "@/components/admin/midi-form";
export const metadata = { title: "编辑 MIDI 档案" };
export default async function EditMidi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id)) notFound();
  let entry: MidiEntry;
  try { entry = await adminRequest<MidiEntry>(`/api/v1/admin/midis/${id}`); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <AdminUnavailable />;
    throw error;
  }
  const { saved } = await searchParams;
  return <><AdminPageHeader eyebrow={`Collection / ${entry.id}`} title="编辑 MIDI 档案" description="维护作品基础资料。人物署名、历史来源和文件记录保持独立。" />
    {saved === "1" && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">档案已保存。<Link className="ml-3 underline" href={`/midis/${entry.slug}`}>查看公开详情 ↗</Link></p>}
    <p className="mb-6"><Link className="text-sm underline" href={`/admin/midis/${entry.id}/credits`}>管理作品署名 →</Link></p>
    <MidiForm key={`${entry.id}-${entry.revision}`} entry={entry} /></>;
}
