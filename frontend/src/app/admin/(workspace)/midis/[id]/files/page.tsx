import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { MidiDetail, MidiEntry } from "@/lib/api/types";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { MidiSectionNav } from "@/components/admin/midi-section-nav";
import { MidiFilesForm } from "@/components/admin/midi-files-form";

export const metadata = { title: "音乐文件归档" };

export default async function MidiFilesPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session");
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
    <AdminPageHeader eyebrow={`档案 / ${id} / 文件`} title={`音乐文件 · ${data.entry.title}`} description={session.role === "admin" ? "管理员上传会提交给超级管理员审核；批准后才会公开分发。" : "为当前作品上传单个音乐文件（上传即同意公开分发），核对已有文件与去重结果。本页仅展示文件元数据，不在此处提供下载链接或对象地址。"} />
    <MidiSectionNav id={id} publicId={data.entry.public_id} current="files" />
    <div className="min-w-0 space-y-6 [overflow-wrap:anywhere]">
      <MidiFilesForm key={id} midiId={id} revision={data.entry.revision} maxFileSize={data.max_file_size} enabled={data.enabled} reviewRequired={session.role === "admin"} />
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
