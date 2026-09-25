"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { restoreTrashAction, type RestoreState } from "@/lib/admin/trash-actions";

export function RestoreButton({ type, id, reviewRequired = false }: { type: "midi" | "person"; id: string; reviewRequired?: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<RestoreState, FormData>(async (previous, form) => {
    const result = await restoreTrashAction(previous, form);
    if (!result.error && result.queuedId === id) router.push("/admin/changes?submitted=1");
    else if (!result.error && result.restoredId === id) router.refresh();
    return result;
  }, { error: "" });
  return <form action={action} className="flex flex-wrap items-center gap-3">
    <input type="hidden" name="type" value={type} /><input type="hidden" name="id" value={id} />
    <button disabled={pending} className="rounded-lg border border-line px-4 py-2 text-sm text-accent hover:bg-[#edf0e5] disabled:opacity-50">{pending ? "正在提交…" : reviewRequired ? "申请恢复" : "恢复"}</button>
    {state.error && <span role="alert" className="text-xs text-red-800">{state.error}</span>}
  </form>;
}
