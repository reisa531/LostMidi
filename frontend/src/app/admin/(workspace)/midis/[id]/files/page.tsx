import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { MidiDetail, MidiEntry } from "@/lib/api/types";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { MidiFilesForm } from "@/components/admin/midi-files-form";

export const metadata = { title: "MIDI 文件归档" };

export default async function MidiFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let data: { entry: MidiEntry; files: MidiDetail["files"]; max_file_size: number; enabled: boolean };
  try { data = await adminRequest(`/api/v1/admin/midis/${id}/files`, { redirect: "error" }); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <AdminUnavailable />;
    throw error;
  }
  return <>
    <AdminPageHeader eyebrow={`Collection / ${id} / Files`} title={`MIDI 文件 · ${data.entry.title}`} description="为当前作品上传单个 MIDI 文件（上传即同意公开分发），核对已有文件与去重结果。本页仅展示文件元数据，不在此处提供下载链接或对象地址。" />
    <nav aria-label="作品资料管理" className="mb-6 flex flex-wrap gap-5 text-sm">
      <Link className="underline" href={`/admin/midis/${id}/edit`}>返回基础资料</Link>
      <Link className="underline" href={`/admin/midis/${id}/credits`}>管理作品署名</Link>
      <Link className="underline" href={`/admin/midis/${id}/history`}>管理来源与寻回</Link>
    </nav>
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <MidiFilesForm key={id} midiId={id} revision={data.entry.revision} maxFileSize={data.max_file_size} enabled={data.enabled} />
      <section aria-labelledby="midi-files-heading" className="min-w-0 rounded-xl border border-line bg-white p-5 sm:p-6">
        <h2 id="midi-files-heading" className="mb-5 text-lg font-semibold">已存文件（{data.files.length}）</h2>
        {data.files.length ? <ul className="space-y-5">{data.files.map(file => <li key={file.id} className="min-w-0 space-y-2 border-t border-line pt-5">
          <h3 className="font-semibold">{file.original_filename}</h3>
          <p className="text-xs leading-6 text-muted">编号 {file.id} · {file.file_size.toLocaleString("zh-CN")} 字节<br />上传时间：{file.created_at}</p>
          <p className="text-xs leading-6 text-muted">SHA-256：<span className="font-mono">{file.sha256}</span></p>
        </li>)}</ul> : <p className="text-sm text-muted">当前档案尚无已存文件。</p>}
      </section>
    </div>
  </>;
}
