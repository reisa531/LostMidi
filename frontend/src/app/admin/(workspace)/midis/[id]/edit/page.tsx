import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { MidiEntry } from "@/lib/api/types";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { MidiForm } from "@/components/admin/midi-form";
import { DeleteConfirmation } from "@/components/admin/delete-confirmation";
import { MidiSectionNav } from "@/components/admin/midi-section-nav";
export const metadata = { title: "编辑 MIDI 档案" };
export default async function EditMidi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const session = await adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session");
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
  return <><AdminPageHeader eyebrow={`档案 / ${entry.id}`} title="编辑 MIDI 档案" description="维护作品基础资料。作品署名、历史来源与寻回记录通过独立页面管理，并与基础资料共用保存版本；前往其他页面前请先保存当前修改。" />
    {saved === "1" && <p role="status" className="mb-6 rounded-lg bg-green-50 p-4 text-sm text-green-900">档案已保存。<Link className="ml-3 underline" href={`/midis/${entry.public_id}`}>查看公开详情 ↗</Link></p>}
    <MidiSectionNav id={entry.id} publicId={entry.public_id} current="edit" />
    <MidiForm key={`${entry.id}-${entry.revision}`} entry={entry} reviewRequired={session.role === "admin"} />
    <DeleteConfirmation key={`delete-${entry.id}-${entry.revision}`} resource="midis" id={entry.id} revision={entry.revision} name={entry.title} reviewRequired={session.role === "admin"} />
  </>;
}
