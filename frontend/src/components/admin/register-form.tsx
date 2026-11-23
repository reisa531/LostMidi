"use client";

import Link from "next/link";
import Script from "next/script";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { registerAction } from "@/lib/admin/actions";
import { registrationCopy as copy } from "@/lib/admin/registration-copy";

type CheckStatus = "checking" | "passed" | "expired" | "failed";
type WidgetOptions = {
  sitekey: string;
  action: string;
  size: "flexible" | "compact";
  theme: "auto";
  language: string;
  "response-field": false;
  retry: "never";
  "refresh-expired": "manual";
  callback: (token: string) => void;
  "error-callback": () => boolean;
  "expired-callback": () => void;
  "timeout-callback": () => void;
};
declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: WidgetOptions) => string;
      remove: (id: string) => void;
      reset: (id: string) => void;
    };
  }
}

function RegistrationCheck({ siteKey, setToken }: { siteKey: string; setToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<CheckStatus>("checking");

  useEffect(() => {
    const api = window.turnstile;
    if (!loaded || !api || !container.current) return;
    const update = (state: CheckStatus, token = "") => { setStatus(state); setToken(token); };
    widget.current = api.render(container.current, {
      sitekey: siteKey, action: "register",
      size: container.current.clientWidth < 300 ? "compact" : "flexible", theme: "auto", language: "zh-cn",
      "response-field": false, retry: "never", "refresh-expired": "manual",
      callback: (token) => update("passed", token),
      "expired-callback": () => update("expired"),
      "timeout-callback": () => update("expired"),
      "error-callback": () => { update("failed"); return true; },
    });
    return () => { if (widget.current !== null) api.remove(widget.current); widget.current = null; };
  }, [loaded, siteKey, setToken]);

  const canRetry = (status === "expired" || status === "failed") && loaded;
  return <fieldset className="registration-check min-w-0 rounded border border-line bg-wash px-3 pb-3 pt-2">
    <legend className="px-2 font-serif text-base">{copy.checkLegend}</legend>
    <p className="mb-3 text-xs leading-5 text-muted">{copy.checkIntro}</p>
    <div ref={container} className="min-h-16" />
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setLoaded(true)} onError={() => { setStatus("failed"); setToken(""); }} />
    <div className="mt-3 flex items-start gap-2">
      <span className="verification-roll" data-passed={status === "passed"} aria-hidden="true"><i /><i /><i /><i /></span>
      <p id="registration-check-status" tabIndex={-1} role="status" className="min-w-0 text-xs leading-5 text-muted">
        {copy[status]}
      </p>
    </div>
    {canRetry && <button type="button" className="archive-link mt-2 text-sm" onClick={() => {
      if (widget.current === null) return;
      setStatus("checking");
      setToken("");
      window.turnstile?.reset(widget.current);
    }}>{copy.retry}</button>}
    {status === "failed" && <p className="mt-2 text-xs"><Link className="archive-link" href="/about#contact">{copy.contact}</Link></p>}
  </fieldset>;
}

const inputStyle = "mt-2 block w-full rounded border border-line p-3";
export function RegisterForm({ siteKey }: { siteKey: string }) {
  const [state, action, pending] = useActionState(registerAction, { error: "" });
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [verification, setVerification] = useState<{ attempt: number; token: string }>({ attempt: 0, token: "" });
  const attempt = state.attempt ?? 0;
  const setToken = useCallback((token: string) => setVerification({ attempt, token }), [attempt]);
  const token = verification.attempt === attempt ? verification.token : "";
  const status = useRef<HTMLParagraphElement>(null);

  if (state.registered) return <div role="status" className="rounded-xl border border-line bg-white p-6 text-sm leading-7">
    <p>{copy.success}</p>
    <Link className="archive-link" href="/about#contact">{copy.contact}</Link>
  </div>;

  return <form action={action} className="space-y-5 rounded-xl border border-line bg-white p-4 sm:p-6"
    onSubmit={event => {
      if (token && !pending) return;
      event.preventDefault();
      if (!pending) status.current?.focus();
    }}>
    <label className="block text-sm">用户名<input name="username" autoComplete="username" required minLength={3} maxLength={64}
      pattern={"[A-Za-z0-9_.\\-]+"} aria-describedby="register-user-hint" value={username} onChange={event => setUsername(event.target.value)} className={inputStyle} />
      <span id="register-user-hint" className="mt-1 block text-xs leading-5 text-muted">{copy.usernameHint}</span>
    </label>
    <label className="block text-sm">邮箱<input type="email" name="email" autoComplete="email" required maxLength={254}
      value={email} onChange={event => setEmail(event.target.value)} className={inputStyle} /></label>
    <label className="block text-sm">{copy.passwordLabel}<input type="password" name="password" autoComplete="new-password" required
      minLength={12} maxLength={1024} aria-describedby="register-password-hint" className={inputStyle} />
      <span id="register-password-hint" className="mt-1 block text-xs text-muted">{copy.passwordHint}</span>
    </label>
    <label className="block text-sm">{copy.confirmPassword}<input type="password" name="password_confirmation" autoComplete="new-password" required
      minLength={12} maxLength={1024} className={inputStyle} /></label>
    <RegistrationCheck key={attempt} siteKey={siteKey} setToken={setToken} />
    <input type="hidden" name="captcha_token" value={token} />
    {state.error && <p role="alert" className="text-sm text-red-800">{state.error}</p>}
    {!token && <p ref={status} tabIndex={-1} className="sr-only focus:not-sr-only">{copy.missing}</p>}
    <button type="submit" aria-disabled={pending || !token} aria-describedby="registration-check-status"
      className="w-full rounded-lg bg-accent px-5 py-3 text-sm text-white aria-disabled:opacity-50">{pending ? copy.submitting : copy.submit}</button>
  </form>;
}
