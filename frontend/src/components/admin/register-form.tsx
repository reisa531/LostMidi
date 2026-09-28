"use client";
import Link from "next/link";
import Image from "next/image";
import { useActionState, useEffect, useState } from "react";
import { registerAction } from "@/lib/admin/actions";

export function RegisterForm() {
  const [state, action, pending] = useActionState(registerAction, { error: "" });
  const [captcha, setCaptcha] = useState<{ id: string; svg: string; attempt: number } | null>(null);
  const [captchaError, setCaptchaError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const currentCaptcha = captcha?.attempt === (state.attempt ?? 0) ? captcha : null;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/register-captcha", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("unavailable");
        return response.json() as Promise<{ id: string; svg: string }>;
      })
      .then(value => { setCaptcha({ ...value, attempt: state.attempt ?? 0 }); setCaptchaError(""); })
      .catch(() => { if (!controller.signal.aborted) setCaptchaError("验证码暂时无法加载，请稍后重试。"); });
    return () => controller.abort();
  }, [refresh, state.attempt]);
  if (state.registered) return <div role="status" className="rounded-xl border border-line bg-white p-6 text-sm leading-7">
    注册成功，账号等待超级管理员启用。请通过<Link className="archive-link mx-1" href="/about">关于我们</Link>页面联系超级管理员。
  </div>;
  return <form action={action} className="space-y-5 rounded-xl border border-line bg-white p-6">
    <label className="block text-sm">账号<input name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[A-Za-z0-9_.-]+" className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">邮箱<input type="email" name="email" autoComplete="email" required maxLength={254} className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">密码（至少 12 位）<input type="password" name="password" autoComplete="new-password" required minLength={12} maxLength={1024} className="mt-2 block w-full rounded border border-line p-3" /></label>
    <label className="block text-sm">确认密码<input type="password" name="password_confirmation" autoComplete="new-password" required minLength={12} maxLength={1024} className="mt-2 block w-full rounded border border-line p-3" /></label>
    <div className="rounded-lg border border-line bg-stone-50 p-4">
      <label className="block text-sm" htmlFor="captcha-answer">图片验证码</label>
      <div className="mt-2 flex items-center gap-3">
        {currentCaptcha ? <Image unoptimized src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(currentCaptcha.svg)}`} alt="六位图片验证码" width={200} height={64} className="h-16 w-[200px] rounded border border-line" /> : <span className="flex h-16 w-[200px] items-center justify-center text-xs text-muted">加载验证码中…</span>}
        <button type="button" onClick={() => { setCaptcha(null); setRefresh(value => value + 1); }} className="rounded border border-line bg-white px-3 py-2 text-sm">换一张</button>
      </div>
      <input type="hidden" name="captcha_id" value={currentCaptcha?.id ?? ""} />
      <input id="captcha-answer" name="captcha_answer" required minLength={6} maxLength={6} autoComplete="off" inputMode="text" className="mt-3 block w-full rounded border border-line p-3 uppercase tracking-[0.25em]" placeholder="输入图中六位字符" />
      {captchaError && <p role="alert" className="mt-2 text-xs text-red-800">{captchaError}</p>}
    </div>
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    <button disabled={pending || !currentCaptcha} className="w-full rounded-lg bg-accent px-5 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在注册…" : "注册账号"}</button>
  </form>;
}
