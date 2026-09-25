"use client";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { purgeTrashAction } from "@/lib/admin/trash-actions";

export function PurgeButton({ type, id }: { type: "midi" | "person"; id: string }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (previous: { error: string; purged?: boolean; cleanupPending?: boolean }, form: FormData) => {
    const next = await purgeTrashAction(previous, form);
    if (next.purged) router.refresh();
    return next;
  }, { error: "" });
  return <form action={action} className="flex flex-wrap items-end gap-2">
    <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
    <label className="text-xs text-muted">输入“我确认删除档案编号{id}”
      <input name="confirmation" required autoComplete="off" className="mt-1 block w-full rounded border border-line px-2 py-1.5 text-sm" />
    </label>
    <button disabled={pending} className="rounded border border-red-300 px-3 py-2 text-xs text-red-800 disabled:opacity-50">{pending ? "正在删除…" : "彻底删除"}</button>
    {state.error && <span role="alert" className="w-full text-xs text-red-800">{state.error}</span>}
    {state.cleanupPending && <span role="status" className="w-full text-xs text-muted">档案已删除；文件清理将在维护时重试。</span>}
  </form>;
}
