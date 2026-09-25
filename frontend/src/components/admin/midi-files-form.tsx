"use client";

import Link from "next/link";
import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importMidiFileAction, type MidiFileImportState } from "@/lib/admin/files-actions";

export function MidiFilesForm({ midiId, revision, maxFileSize, enabled, reviewRequired = false }: {
  midiId: string; revision: number; maxFileSize: number; enabled: boolean; reviewRequired?: boolean;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const rightsInput = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const [clientError, setClientError] = useState("");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [state, action, pending] = useActionState<MidiFileImportState, FormData>(async (previous, form) => {
    try {
      const next = await importMidiFileAction(previous, form);
      if (next.result || next.queued) {
        if (fileInput.current) fileInput.current.value = "";
        if (rightsInput.current) rightsInput.current.checked = false;
      }
      // Keep the latest acknowledged revision even if a later request fails.
      return { ...next, result: next.result ?? previous.result };
    } catch {
      return { error: "连接中断或请求超时，无法确认导入结果。已保留所选文件，请先刷新检查已存记录，文件可能已经保存。", result: previous.result };
    } finally { submitting.current = false; }
  }, { error: "" });
  const busy = pending || refreshing;
  const limit = Math.min(maxFileSize, 1048576);
  const currentRevision = Math.max(revision, state.result?.revision ?? 0);

  function fileError(file: File | undefined) {
    if (!file || !/\.midi?$/i.test(file.name) || file.size === 0) return "请选择一个非空的 .mid 或 .midi 文件。";
    if (file.size > limit) return `文件过大；最多 ${limit.toLocaleString("zh-CN")} 字节（不超过 1 MiB）。`;
    return "";
  }

  return <form action={action} onReset={event => event.preventDefault()} onSubmit={event => {
    if (busy || submitting.current || !enabled) { event.preventDefault(); return; }
    const error = fileError(fileInput.current?.files?.[0]);
    setClientError(error);
    if (error) { event.preventDefault(); return; }
    submitting.current = true;
  }} className="min-w-0 space-y-6 rounded-xl border border-line bg-white p-5 sm:p-6 [overflow-wrap:anywhere]" aria-busy={busy}>
    <h2 className="text-lg font-semibold">导入单个 MIDI 文件</h2>
    <input type="hidden" name="id" value={midiId} />
    <input type="hidden" name="revision" value={currentRevision} />
    <p className="text-sm leading-7 text-muted">上传即表示确认有权公开分发。{reviewRequired ? "文件会先提交审核，批准后存入公开对象存储。" : "文件会存入对象存储并可被任何人公开读取。"}不会修改作品的归档状态或权利字段。文件、署名、来源与基础资料共用版本，请勿同时在其他页面修改。</p>
    {!enabled && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">文件导入尚未启用或已暂停，已有文件仍可查看。</p>}
    <fieldset disabled={busy || !enabled} className="min-w-0 space-y-5 disabled:opacity-60">
      <legend className="sr-only">公开分发文件</legend>
      <label className="block text-sm">MIDI 文件 *
        <input ref={fileInput} type="file" name="file" accept=".mid,.midi" required aria-describedby="midi-file-help" onChange={event => setClientError(fileError(event.target.files?.[0]))} className="mt-2 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-2.5 text-sm" />
      </label>
      <p id="midi-file-help" className="text-xs leading-6 text-muted">单个文件最大 1 MiB（1,048,576 字节），仅支持 .mid / .midi。服务器还会校验 SMF 0 / 1 / 2 结构；不支持批量、ZIP 或远程网址。</p>
      <label className="flex items-start gap-3 text-sm leading-7"><input ref={rightsInput} type="checkbox" name="rights_confirmed" value="true" required className="mt-2 shrink-0" />我确认有权公开分发此文件；上传后该文件可被任何人公开读取与下载。</label>
    </fieldset>
    {clientError && <p role="alert" className="text-sm text-red-900">{clientError}</p>}
    {state.error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-4 text-sm leading-7 text-red-900">
      <p>{state.error}</p>
      <div className="flex flex-wrap gap-x-4">
        {state.unauthorized && <Link href="/admin/login" target="_blank" rel="noopener noreferrer" className="underline">在新页面登录</Link>}
        <Link href={`/admin/midis/${midiId}/files`} target="_blank" rel="noopener noreferrer" className="underline">在新页面核对文件记录</Link>
      </div>
    </div>}
    {!state.error && state.result && <p role="status" className="rounded-lg bg-green-50 p-4 text-sm leading-7 text-green-900">
      {state.result.duplicate ? "当前档案已存在相同文件，已去重，未重复新增。" : "文件已成功上传并公开分发。"}
      <br />{state.result.filename} · 文件编号 {state.result.fileId} · 返回版本 {state.result.revision}
    </p>}
    {!state.error && state.queued && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-950">文件导入申请已提交，批准后才会公开分发。<Link className="ml-2 underline" href="/admin/changes">查看审核进度</Link></p>}
    <div className="flex flex-wrap items-center gap-5 border-t border-line pt-5">
      <button type="submit" disabled={busy || !enabled} className="rounded bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在提交，请勿重复操作…" : reviewRequired ? "提交文件审核" : "确认并公开上传"}</button>
      <button type="button" disabled={busy} onClick={() => { if (!submitting.current) startRefresh(() => router.refresh()); }} className="text-sm underline disabled:opacity-50">{refreshing ? "正在刷新…" : "刷新版本与文件列表"}</button>
      <span className="text-xs text-muted">当前版本 {currentRevision}</span>
    </div>
  </form>;
}
