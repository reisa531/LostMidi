"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerAction } from "@/lib/admin/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, { error: "" });
  if (state.registered) return <div role="status" className="rounded-xl border border-line bg-white p-6 text-sm leading-7">
    注册成功，账号等待超级管理员启用。请通过<Link className="archive-link mx-1" href="/about">关于我们</Link>页面联系超级管理员。
  </div>;
  return <form action={action} className="space-y-5 rounded-xl border border-line bg-white p-6">
    <label className="block text-sm">账号<input name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]+" className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">邮箱<input type="email" name="email" autoComplete="email" required maxLength={254} className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">密码（至少 12 位）<input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={1024} className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">确认密码<input type="password" name="password_confirmation" autoComplete="new-password" required minLength={12} maxLength={1024} className="mt-2 block w-full rounded border border-line p-3" /></label>
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    <button disabled={pending} className="w-full rounded-lg bg-accent px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在注册…" : "注册账号"}</button>
  </form>;
}
