"use client";

import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";
import type { BeforeSendEvent } from "@vercel/analytics";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

const cookie = "lostmidi_consent";
const changed = "lostmidi:consent-change";
const lifetime = 180 * 86400;
type Choices = { analytics: boolean; video: boolean };
const necessary = { analytics: false, video: false };
const everything = { analytics: true, video: true };

function receipt() {
  const raw = document.cookie.split("; ").find(part => part.startsWith(cookie + "="))?.slice(cookie.length + 1);
  if (!raw || !/^v1\.[01][01]\.\d{10}$/.test(raw)) return "";
  const age = Date.now() / 1000 - Number(raw.split(".")[2]);
  return age >= 0 && age < lifetime ? raw : "";
}

function subscribe(listener: () => void) {
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel(changed) : null;
  channel?.addEventListener("message", listener);
  window.addEventListener(changed, listener);
  window.addEventListener("focus", listener);
  window.addEventListener("pageshow", listener);
  return () => {
    channel?.close();
    window.removeEventListener(changed, listener);
    window.removeEventListener("focus", listener);
    window.removeEventListener("pageshow", listener);
  };
}

function filterEvent(event: BeforeSendEvent) {
  return receipt().split(".")[1]?.[0] === "1" ? event : null;
}

const Consent = createContext({ video: false, openSettings: () => {} });
export const useCookiePreferences = () => useContext(Consent);

export function CookieDetails() {
  const { openSettings } = useCookiePreferences();
  return <button type="button" className="underline underline-offset-4" onClick={openSettings}>Cookie 设置</button>;
}

export function CookiePreferences({ children }: { children: ReactNode }) {
  const saved = useSyncExternalStore(subscribe, receipt, () => "");
  const flags = saved.split(".")[1];
  const analytics = flags?.[0] === "1";
  const video = flags?.[1] === "1";
  const [draft, setDraft] = useState<Choices>(necessary);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const panel = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!saved) return;
    const expires = (Number(saved.split(".")[2]) + lifetime) * 1000;
    // Browser timeouts are capped at about 25 days.
    const timer = window.setInterval(() => {
      if (Date.now() >= expires) window.dispatchEvent(new Event(changed));
    }, 60000);
    return () => window.clearInterval(timer);
  }, [saved]);

  function openSettings() {
    setDraft({ analytics, video });
    setError("");
    panel.current?.showModal();
  }

  function save(choices: Choices) {
    const value = `v1.${Number(choices.analytics)}${Number(choices.video)}.${Math.floor(Date.now() / 1000)}`;
    const attrs = "; Path=/; SameSite=Lax" + (location.protocol === "https:" ? "; Secure" : "");
    document.cookie = cookie + "=" + value + "; Max-Age=" + lifetime + attrs;
    document.cookie = "lostmidi-cookie-notice=; Max-Age=0" + attrs;
    if (receipt() !== value && (choices.analytics || choices.video)) {
      setError("浏览器未能保存偏好。可选功能仍然关闭。");
      return;
    }
    setError("");
    setDismissed(!receipt());
    panel.current?.close();
    window.dispatchEvent(new Event(changed));
    if (typeof BroadcastChannel === "function") {
      const channel = new BroadcastChannel(changed);
      channel.postMessage("updated");
      channel.close();
    }
  }

  return <Consent.Provider value={{ video, openSettings }}>
    {children}
    {analytics && <Analytics beforeSend={filterEvent} />}
    {!saved && !dismissed && <aside className="cookie-banner" aria-labelledby="cookie-heading">
      <div className="cookie-wrap"><div>
        <h2 id="cookie-heading">关于本站的 Cookie</h2>
        <p>LostMidi 用必要 Cookie 维持登录、记住你的选择。Vercel 访问统计和哔哩哔哩播放器由你决定是否启用。你可以随时在页脚更改选择。 <Link href="/privacy">Cookie 与隐私说明</Link></p>
      </div><div className="cookie-actions">
        <button type="button" onClick={() => save(everything)}>全部接受</button>
        <button type="button" onClick={() => save(necessary)}>全部拒绝</button>
        <button type="button" onClick={openSettings}>自定义</button>
      </div></div>
      {error && <p role="alert">{error}</p>}
    </aside>}
    <dialog ref={panel} className="cookie-panel" aria-labelledby="cookie-settings-title">
      <h2 id="cookie-settings-title">Cookie 设置</h2>
      <p>选好后点「保存选择」。你也可以只用必要功能浏览档案。</p>
      <div className="cookie-option"><strong>必要功能</strong><span>始终开启</span><p>维持登录、保存隐私偏好，并在注册时完成安全验证。</p></div>
      <label className="cookie-option"><strong>访问统计</strong><input type="checkbox" checked={draft.analytics} onChange={e => setDraft({ ...draft, analytics: e.target.checked })} />
        <span className="cookie-desc">允许 Vercel 统计页面访问量。这项统计不使用统计 Cookie。</span></label>
      <label className="cookie-option"><strong>外部视频</strong><input type="checkbox" checked={draft.video} onChange={e => setDraft({ ...draft, video: e.target.checked })} />
        <span className="cookie-desc">允许使用哔哩哔哩播放器。点击视频后，浏览器才会连接哔哩哔哩。</span></label>
      <Link href="/privacy" onClick={() => panel.current?.close()}>Cookie 与隐私说明</Link>
      {error && <p role="alert">{error}</p>}
      <div className="cookie-actions"><button type="button" onClick={() => save(draft)}>保存选择</button>
        <button type="button" onClick={() => save(necessary)}>全部拒绝</button>
        <button type="button" onClick={() => panel.current?.close()}>取消</button></div>
    </dialog>
  </Consent.Provider>;
}
