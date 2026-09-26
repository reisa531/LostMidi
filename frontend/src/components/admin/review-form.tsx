"use client";

import { useActionState } from "react";
import { closeFailedChangeState, reviewChangeState } from "@/lib/admin/review-actions";

export function ReviewForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(reviewChangeState, { error: "", success: false });
  return <form action={action} className="flex flex-wrap items-center gap-2">
    <input type="hidden" name="id" value={id} />
    <input name="note" maxLength={2000} placeholder="审核备注（可选）" className="rounded border border-line px-3 py-2 text-sm" />
    <button disabled={pending} name="decision" value="reject" className="rounded border border-line px-3 py-2 text-sm disabled:opacity-50">拒绝</button>
    <button disabled={pending} name="decision" value="approve" className="rounded bg-accent px-3 py-2 text-sm text-white disabled:opacity-50">{pending ? "处理中…" : "批准并发布"}</button>
    {state.error && <p role="alert" className="w-full text-xs text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="w-full text-xs text-green-800">审核操作已完成。</p>}
  </form>;
}

export function CloseFailedForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(closeFailedChangeState, { error: "", success: false });
  return <form action={action} className="mt-3 flex flex-wrap gap-2"><input type="hidden" name="id" value={id} />
    <input name="note" required maxLength={2000} placeholder="关闭原因（必填）" className="min-w-40 flex-1 rounded border border-line px-3 py-2" />
    <button disabled={pending} className="rounded border border-line bg-white px-3 py-2 disabled:opacity-50">{pending ? "处理中…" : "关闭失败项"}</button>
    {state.error && <p role="alert" className="w-full text-xs text-red-800">{state.error}</p>}
    {state.success && <p role="status" className="w-full text-xs text-green-800">已关闭。</p>}
  </form>;
}
