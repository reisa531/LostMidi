"use client";

import { useActionState } from "react";
import { inviteAdminAction, updateAdminUserAction, type InviteState } from "@/lib/admin/user-actions";

type AdminUser = { id: string; username: string; email?: string; role: "super_admin" | "admin"; status: "invited" | "active" | "disabled"; created_by: string; created_at: string };
const initial: InviteState = { error: "" };

export function UserManagement({ users, currentUserId }: { users: AdminUser[]; currentUserId: string | null }) {
  const [state, action, pending] = useActionState(inviteAdminAction, initial);
  return <div className="space-y-6">
    <section className="rounded-xl border border-line bg-white p-5 sm:p-7">
      <h2 className="font-semibold">邀请管理员</h2>
      <p className="mt-2 text-sm leading-6 text-muted">访问者不需要账号，只能浏览公开内容。这里创建的管理员需要在 48 小时内设置自己的密码；邀请令牌只显示一次，请通过安全渠道交给对方。</p>
      <form action={action} className="mt-5 flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-sm">用户名<input name="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]+" className="mt-2 block w-full rounded border border-line p-3" /></label>
        <label className="text-sm">身份<select name="role" className="mt-2 block rounded border border-line bg-white p-3"><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select></label>
        <button disabled={pending} className="rounded bg-accent px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在创建…" : "生成邀请"}</button>
      </form>
      {state.error && <p role="alert" className="mt-4 text-sm text-red-800">{state.error}</p>}
      {state.token && <div role="status" className="mt-5 rounded-lg bg-green-50 p-4 text-sm text-green-950"><p>已为 {state.username} 创建邀请，有效期至 {state.expiresAt}。请现在复制令牌；离开页面后不会再次显示。</p><textarea readOnly aria-label="一次性邀请令牌" value={state.token} className="mt-3 block min-h-24 w-full break-all rounded border border-green-300 bg-white p-3 font-mono text-xs" /></div>}
    </section>
    <section className="rounded-xl border border-line bg-white p-5 sm:p-7">
      <h2 className="mb-4 font-semibold">用户账号 · {users.length}</h2>
      {users.length ? <ul className="divide-y divide-line">{users.map(user => <li key={user.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
        <div><p className="font-medium">{user.username}{user.id === currentUserId && <span className="ml-2 text-xs text-muted">（当前账号）</span>}</p><p className="mt-1 text-xs text-muted">{user.email && <>{user.email} · </>}{user.role === "super_admin" ? "超级管理员" : "管理员"} · {user.status === "active" ? "已启用" : user.status === "invited" ? "等待接受邀请" : "已停用"} · 创建于 {new Date(user.created_at).toLocaleString("zh-CN", { timeZone: "UTC" })} UTC</p></div>
        <form action={updateAdminUserAction} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={user.id} /><label className="sr-only" htmlFor={`role-${user.id}`}>调整 {user.username} 的身份</label><select id={`role-${user.id}`} name="role" defaultValue={user.role} className="rounded border border-line bg-white p-2 text-sm"><option value="admin">管理员</option><option value="super_admin">超级管理员</option></select><label className="sr-only" htmlFor={`status-${user.id}`}>调整 {user.username} 的状态</label><select id={`status-${user.id}`} name="status" defaultValue={user.status === "invited" ? "disabled" : user.status} className="rounded border border-line bg-white p-2 text-sm"><option value="active">已启用</option><option value="disabled">停用</option></select><button className="rounded border border-line px-3 py-2 text-sm">保存</button></form>
      </li>)}</ul> : <p className="py-5 text-sm text-muted">暂无账号。</p>}
    </section>
  </div>;
}
