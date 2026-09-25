"use client";
import { useActionState, useState } from "react";
import { loginAction } from "@/lib/admin/actions";
import Link from "next/link";
export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  const [username, setUsername] = useState("");
  return <form action={action} className="space-y-5 rounded-xl border border-line bg-white p-6">
    <label className="block text-sm">用户名<input className="mt-2 block w-full rounded border border-line p-3" name="username" autoComplete="username" required maxLength={100} value={username} onChange={event => setUsername(event.target.value)} /></label>
    <label className="block text-sm">密码<input className="mt-2 block w-full rounded border border-line p-3" type="password" name="password" autoComplete="current-password" required maxLength={1024} /></label>
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}{state.error.includes("关于我们") && <Link href="/about" className="ml-1 underline">前往关于我们</Link>}</p>}
    <button className="w-full rounded-lg bg-accent px-5 py-3 text-sm text-white disabled:opacity-50" disabled={pending}>{pending ? "正在登录…" : "登录"}</button>
  </form>;
}
