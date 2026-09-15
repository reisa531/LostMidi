"use client";

import { useActionState } from "react";
import { logoutAction } from "@/lib/admin/actions";

export function LogoutForm() {
  const [state, action, pending] = useActionState(logoutAction, { error: "" });
  return <form action={action} className="max-w-64">
    <button disabled={pending} className="underline underline-offset-4 disabled:opacity-50">{pending ? "正在退出…" : "退出登录"}</button>
    {state.error && <p role="alert" className="mt-2 leading-5 text-red-800">退出未完成。{state.error}</p>}
  </form>;
}
