"use client";

import Link from "next/link";
import { useActionState, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteEntryAction, type DeleteState } from "@/lib/admin/delete-actions";

export function DeleteConfirmation({ resource, id, revision, name }: {
  resource: "midis" | "people"; id: string; revision: number; name: string;
}) {
  const router = useRouter();
  const headingId = useId();
  const submitting = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const listPath = `/admin/${resource}`;
  const label = resource === "midis" ? "MIDI 档案" : "人物";
  const [state, action, pending] = useActionState<DeleteState, FormData>(async (previous, form) => {
    let next: DeleteState;
    try {
      next = await deleteEntryAction(previous, form);
    } catch {
      return { error: "连接中断，无法确认删除结果，记录可能已删除。请先在新页面核对列表，再决定是否重试。" };
    } finally { submitting.current = false; }
    // Navigate only after acknowledgement, outside the request error handler.
    if (!next.error && next.deletedId === id) {
      router.replace(`${listPath}?deleted=1`);
      router.refresh();
    }
    return next;
  }, { error: "" });
  const busy = pending || Boolean(state.deletedId);

  return <section aria-labelledby={headingId} className="mt-10 min-w-0 space-y-4 rounded-xl border border-red-200 bg-white p-5 sm:p-6">
    <h2 id={headingId} className="text-lg font-semibold text-red-900">危险操作：删除{label}</h2>
    <p className="break-words text-sm leading-7">即将删除「{name}」（编号 {id}）。此操作不可撤销，不会保存上方表单中尚未提交的修改。</p>
    {resource === "midis" ? <div className="space-y-2 text-sm leading-7 text-muted">
      <p>将一并删除本档案的作品署名、历史来源、寻回记录和文件登记；关联人物不会被删除。</p>
      <p>外部文件仅写入待清理日志（journal），至少 24 小时后才可通过现有显式维护清理；不会立即物理删除。桶内匿名可读对象在清理前仍可能被访问。</p>
    </div> : <p className="text-sm leading-7 text-muted">仍被作品署名或寻回记录引用的人物不能删除，必须先手动解除所有相关引用；不会自动级联解除。</p>}
    <form action={action} onReset={event => event.preventDefault()} onSubmit={event => {
      if (busy || submitting.current || !confirming || !confirmed) { event.preventDefault(); return; }
      submitting.current = true;
    }} aria-busy={pending} className="space-y-4">
      <input type="hidden" name="resource" value={resource} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="revision" value={revision} />
      {confirming ? <fieldset disabled={busy} className="min-w-0 space-y-4 disabled:opacity-60">
        <legend className="sr-only">确认删除{label}</legend>
        <label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" name="confirmed" value="true" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-2 shrink-0" /><span className="min-w-0 break-words">我确认删除{label}「{name}」（编号 {id}），已了解上述影响及此操作不可撤销。</span></label>
        <div className="flex flex-wrap gap-5">
          <button type="submit" disabled={busy || !confirmed} className="rounded-lg bg-red-700 px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在删除，请勿重复操作…" : "确认删除"}</button>
          <button type="button" disabled={busy} onClick={() => {
            if (!submitting.current) { setConfirming(false); setConfirmed(false); }
          }} className="text-sm underline disabled:opacity-50">取消</button>
        </div>
      </fieldset> : <button type="button" disabled={busy} onClick={() => setConfirming(true)} className="rounded-lg border border-red-300 px-5 py-3 text-sm text-red-900 disabled:opacity-50">删除{label}</button>}
      {state.error && <div role="alert" className="space-y-2 rounded-lg bg-red-50 p-4 text-sm leading-7 text-red-900">
        <p>{state.error}</p>
        <div className="flex flex-wrap gap-x-4">
          {state.unauthorized && <Link href="/admin/login" target="_blank" rel="noopener noreferrer" className="underline">在新页面登录</Link>}
          <Link href={`${listPath}/${id}/edit`} target="_blank" rel="noopener noreferrer" className="underline">在新页面核对最新版本</Link>
          <Link href={listPath} target="_blank" rel="noopener noreferrer" className="underline">在新页面核对列表</Link>
        </div>
      </div>}
      {state.deletedId && <p role="status" className="text-sm text-green-900">删除已完成，正在返回列表。<Link href={`${listPath}?deleted=1`} className="ml-2 underline">前往列表</Link></p>}
    </form>
  </section>;
}
