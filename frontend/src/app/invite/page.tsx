"use client";

import { AccountPage } from "@/components/account-page";
import { useActionState } from "react";
import { acceptAdminInviteAction } from "@/lib/admin/user-actions";

export default function AcceptInvitePage() {
  const [state, action, pending] = useActionState(acceptAdminInviteAction, { error: "" });
  return <AccountPage title="接受管理后台邀请" description={"使用超级管理员提供的一次性令牌设置密码，至少 12 个字符。"}>
    <form action={action} className="mt-8 space-y-5 rounded-xl border border-line bg-white p-6"><label className="block text-sm">邀请令牌<textarea name="token" required minLength={64} maxLength={64} className="mt-2 block min-h-24 w-full rounded border border-line p-3 font-mono text-xs" /></label><label className="block text-sm">新密码<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={1024} className="mt-2 block w-full rounded border border-line p-3" /></label>{state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}<button disabled={pending} className="rounded bg-accent px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在设置…" : "设置密码并启用账号"}</button></form>
  </AccountPage>;
}
