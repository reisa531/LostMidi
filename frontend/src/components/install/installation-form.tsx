"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { installAction } from "@/lib/install/actions";

const inputClass = "mt-2 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-3 text-sm focus:border-accent";
export function InstallationForm() {
  const [state, action, pending] = useActionState(installAction, { error: "", attempt: 0 });
  const [name, setName] = useState("Lost MIDI Archive");
  const [description, setDescription] = useState("记录早期网络 MIDI 的作品、人物、历史来源与寻回过程。");
  const [username, setUsername] = useState("admin");
  const [confirmed, setConfirmed] = useState(false);
  const token = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // Nonsecret text survives errors; credentials never return in action state.
    if (state.attempt) for (const ref of [token, password, confirmation]) if (ref.current) ref.current.value = "";
  }, [state.attempt]);
  return <form action={action} onReset={event => event.preventDefault()} className="space-y-8">
    <fieldset disabled={pending} className="space-y-5 disabled:opacity-60">
      <legend className="mb-5 text-lg font-semibold">02 / 设置站点</legend>
      <label className="block text-sm">站点名称<input name="site_name" required maxLength={200} className={inputClass} value={name} onChange={event => setName(event.target.value)} /><span className="mt-2 block text-xs text-muted">最多 200 UTF-8 字节，将用于站点标题和导航。</span></label>
      <label className="block text-sm">站点简介<textarea name="site_description" rows={3} maxLength={1000} className={inputClass} value={description} onChange={event => setDescription(event.target.value)} /><span className="mt-2 block text-xs text-muted">可留空，最多 1,000 UTF-8 字节。中文字符通常占 3 字节。</span></label>
    </fieldset>
    <fieldset disabled={pending} className="space-y-5 border-t border-line pt-6 disabled:opacity-60">
      <legend className="pr-4 text-lg font-semibold">03 / 创建管理员</legend>
      <label className="block text-sm">管理员用户名<input name="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.\-]{3,64}" autoComplete="username" className={inputClass} value={username} onChange={event => setUsername(event.target.value)} /><span className="mt-2 block text-xs text-muted">3–64 位英文字母、数字、下划线、点或连字符。</span></label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="min-w-0 text-sm">管理员密码<input ref={password} type="password" name="password" required maxLength={1024} autoComplete="new-password" className={inputClass} /><span className="mt-2 block text-xs leading-6 text-muted">至少 12 UTF-8 字节，建议使用密码管理器生成长密码；不保存明文。</span></label>
        <label className="min-w-0 text-sm">再次输入密码<input ref={confirmation} type="password" name="confirm_password" required maxLength={1024} autoComplete="new-password" className={inputClass} /></label>
      </div>
    </fieldset>
    <fieldset disabled={pending} className="space-y-5 border-t border-line pt-6 disabled:opacity-60">
      <legend className="pr-4 text-lg font-semibold">04 / 确认安装权限</legend>
      <label className="block text-sm">安装密钥<input ref={token} type="password" name="installation_token" required minLength={32} maxLength={128} autoComplete="off" spellCheck={false} className={inputClass} /><span className="mt-2 block text-xs leading-6 text-muted">填写后端部署时设置的 INSTALLATION_TOKEN，不是管理员密码。安装完成后此密钥不能用于重装。</span></label>
      <label className="flex items-start gap-3 text-sm leading-7"><input type="checkbox" required className="mt-2" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} /><span>我已确认这是需要初始化的后端；本次将创建唯一管理员并保存站点设置，不导入演示档案，也不删除已有档案。</span></label>
    </fieldset>
    {state.error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-7 text-red-900"><p>{state.error}</p><p className="mt-2">站点信息和用户名已保留，密码及安装密钥请重新输入。</p><a href="/install" className="mt-2 inline-block underline">重新检查安装状态</a></div>}
    <div className="border-t border-line pt-6">
      <button disabled={pending || !confirmed} className="w-full rounded-lg bg-accent px-6 py-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{pending ? "正在安全初始化…" : "完成安装并创建管理员"}</button>
      <p className="mt-3 text-xs leading-6 text-muted">配置持久保存到 PostgreSQL，重启或重新部署不会丢失。成功后请使用新账号登录；本页不提供覆盖安装或重置密码。</p>
    </div>
  </form>;
}
