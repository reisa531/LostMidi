"use client";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MidiEntry } from "@/lib/api/types";
import { saveMidiAction, type MidiSaveState } from "@/lib/admin/actions";
import { createMidiWithFile, maxFileSize } from "@/lib/admin/files-actions";
import { MarkdownField } from "@/components/admin/markdown-field";

export function MidiForm({ entry, importEnabled = false, reviewRequired = false }: { entry?: MidiEntry; importEnabled?: boolean; reviewRequired?: boolean }) {
  const router = useRouter();
  const requestId = useRef("");
  const submitted = useRef<FormData | null>(null);
  const submitting = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const rightsInput = useRef<HTMLInputElement>(null);
  const [hasFile, setHasFile] = useState(false);
  const [clientError, setClientError] = useState("");
  const [state, action, pending] = useActionState<MidiSaveState, FormData>(async (previous, form) => {
    try {
      if (previous.retryOnly && submitted.current) form = submitted.current;
      if (!entry) {
        // An unselected browser file control is not an upload. Omit its empty
        // FormData placeholder before React serializes the server action.
        if (!previous.retryOnly && !fileInput.current?.files?.length) form.delete("file");
        requestId.current ||= crypto.randomUUID();
        form.set("request_id", requestId.current);
      }
      submitted.current = form;
      const next = !entry && form.has("file") ? await createMidiWithFile(form) : await saveMidiAction(previous, form);
      if (next.queued) {
        router.push("/admin/changes?submitted=1");
        return next;
      }
      if (next.savedId) {
        router.push(`/admin/midis/${next.savedId}/edit?saved=1`);
        router.refresh();
      }
      return { ...next, retryOnly: !next.savedId && (previous.retryOnly || next.retryOnly) };
    } catch {
      return { error: "连接中断，输入和文件已保留。请重试本次提交或在新页面核对档案记录。", retryOnly: !entry };
    } finally { submitting.current = false; }
  }, { error: "" });
  const [values, setValues] = useState({
    title: entry?.title ?? "", slug: entry?.slug ?? "", description: entry?.description ?? "",
    estimated_date: entry?.estimated_date ?? "", archive_status: entry?.archive_status ?? "lost",
    copyright_status: entry?.copyright_status ?? "unknown", distribution_permission: entry?.distribution_permission ?? "unknown",
    license: entry?.license ?? "", rights_holder: entry?.rights_holder ?? "",
  });
  const change = (name: keyof typeof values, value: string) => setValues(previous => ({ ...previous, [name]: value }));
  const inputClass = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  const input = (name: keyof typeof values, title: string, required = false) => <label className="block text-sm">{title}
    <input name={name} value={values[name]} onChange={event => change(name, event.target.value)} className={inputClass} required={required}
      maxLength={name === "slug" ? 160 : name === "title" ? 300 : 500} pattern={name === "slug" ? "[a-z0-9]+(-[a-z0-9]+)*" : undefined} />
  </label>;
  const select = (name: keyof typeof values, title: string, options: [string, string][]) => <label className="block text-sm">{title}
    <select className={inputClass} name={name} value={values[name]} onChange={event => change(name, event.target.value)}>{options.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
  </label>;
  function fileError(file: File | undefined) {
    if (!file) return "";
    if (file.size === 0) return "请选择一个非空文件。";
    return file.size > maxFileSize ? "文件过大；单个文件最大 15 MB（15,000,000 字节）。" : "";
  }
  return <form action={action} onReset={event => event.preventDefault()} onSubmit={event => {
    if (pending || submitting.current) { event.preventDefault(); return; }
    if (!state.retryOnly) {
      const error = fileError(fileInput.current?.files?.[0]);
      setClientError(error);
      if (error) { event.preventDefault(); return; }
    }
    submitting.current = true;
  }} aria-busy={pending} className="min-w-0 space-y-6 rounded-xl border border-line bg-white p-5 sm:p-8">
    <p className="text-sm leading-6 text-muted">{reviewRequired ? "提交后由超级管理员审核，批准后才会发布。" : entry ? "保存后，基础资料立即显示在公开档案中。" : "填写作品资料，也可以一起上传音乐文件；没有文件时仍可建立寻回档案。"}</p>
    {entry && <><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="revision" value={entry.revision} /></>}
    <fieldset disabled={pending || state.retryOnly} className="min-w-0 space-y-6 disabled:opacity-70"><legend className="sr-only">档案基础资料</legend>
      <div className="grid gap-6 md:grid-cols-2">{input("title", "标题 *", true)}{input("slug", "Slug（公开地址）*", true)}</div>
      <p className="text-xs leading-6 text-muted">Slug 使用小写字母、数字和词间连字符。更改后旧地址将失效。标题最多 300 UTF-8 字节，中文字符通常占 3 字节。</p>
      <MarkdownField name="description" label="描述（支持 Markdown）" rows={7} value={values.description} onChange={value => change("description", value)} disabled={pending || state.retryOnly} />
      <input type="hidden" name="estimated_year" value={values.estimated_date ? values.estimated_date.slice(0, 4) : !entry?.estimated_date ? entry?.estimated_year?.toString() ?? "" : ""} />
      <div className="grid gap-6 md:grid-cols-2"><label className="block text-sm">推测时间 · 日期<input className={inputClass} type="date" name="estimated_date" value={values.estimated_date} onChange={event => change("estimated_date", event.target.value)} /></label>
      {select("archive_status", "档案状态", [["lost","待寻回"],["verifying","验证中"],...(!reviewRequired ? [["archived","已归档"]] as [string,string][] : [])])}</div>
      <div className="grid gap-6 md:grid-cols-2">
      {select("copyright_status", "版权状态", [["unknown","未知"],["public_domain","公有领域"],["licensed","已许可"],["copyrighted","受版权保护"]])}
      {select("distribution_permission", "分发许可", [["unknown","未知"],["permission_granted","已获授权"],["metadata_only","仅元数据"],["restricted","受限"]])}
      {input("license", "许可证（最多 500 UTF-8 字节）")}{input("rights_holder", "权利人（最多 500 UTF-8 字节）")}</div>
      {!entry && !importEnabled && <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-950">文件导入尚未启用或已暂停，仍可创建档案资料。</p>}
      {!entry && importEnabled && <section className="min-w-0 space-y-4 rounded-lg border border-line bg-background p-4 sm:p-5">
        <div><h2 className="font-semibold">音乐文件 <span className="ml-2 text-xs font-normal text-muted">可选</span></h2><p id="create-file-help" className="mt-2 text-xs leading-6 text-muted">不限文件格式，单个文件最大 15 MB（15,000,000 字节）。原始文件和资料一起保存，失败不会留下半成品档案。</p></div>
        <label className="block text-sm">选择音乐文件<input ref={fileInput} name="file" type="file" aria-describedby="create-file-help" className={`${inputClass} min-w-0`} onChange={event => {
          const file = event.target.files?.[0];
          setHasFile(Boolean(file)); setClientError(fileError(file));
        }} /></label>
        {hasFile && <button type="button" className="text-xs text-muted underline" onClick={() => {
          if (fileInput.current) fileInput.current.value = "";
          if (rightsInput.current) rightsInput.current.checked = false;
          setHasFile(false); setClientError("");
        }}>移除文件，仅保存资料</button>}
        <label className="flex items-start gap-3 text-sm leading-7"><input ref={rightsInput} type="checkbox" name="rights_confirmed" value="true" required={hasFile} className="mt-2 shrink-0" />我确认有权公开分发此文件；上传后该文件可被任何人公开读取与下载。</label>
        {hasFile && <p className="text-xs leading-6 text-muted">上传不会自动改变归档状态或分发许可，请按实际情况填写。</p>}
      </section>}
    </fieldset>
    {clientError && <p role="alert" className="text-sm text-red-900">{clientError}</p>}
    {state.error && <div role="alert" className="rounded-lg bg-red-50 p-4 text-sm leading-7 text-red-900"><p>{state.error}</p><Link className="underline" href="/admin/login" target="_blank" rel="noopener noreferrer">在新页面登录</Link><Link className="ml-4 underline" href={entry ? `/admin/midis/${entry.id}/edit` : "/admin/midis"} target="_blank" rel="noopener noreferrer">{entry ? "重新打开编辑页" : "核对档案列表"}</Link></div>}
    <div className="flex flex-wrap items-center gap-5 border-t border-line pt-6"><button disabled={pending} className="rounded-lg bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : state.retryOnly ? "重试本次提交" : entry ? "保存修改" : "创建档案"}</button><Link className="text-sm text-muted underline" href="/admin/midis">返回列表</Link></div>
  </form>;
}
