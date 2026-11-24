"use client";
import { useSyncExternalStore } from "react";
const key = "lostmidi-cookie-notice=1";
const event = "lostmidi:cookie-notice";
function subscribe(listener: () => void) {
  window.addEventListener(event, listener);
  return () => window.removeEventListener(event, listener);
}
export function CookieNotice() {
  const acknowledged = useSyncExternalStore(subscribe, () => document.cookie.split("; ").includes(key), () => true);
  return acknowledged ? null : <aside className="cookie-slip" aria-label="Cookie 告知"><strong>关于 Cookie</strong>
    <p>本站用 Cookie 维持登录、记住这张告知单。文章中的 B 站播放器在你点击后才会连接外站。</p>
    <button type="button" onClick={e => {
      document.cookie = key+"; Path=/; Max-Age=31536000; SameSite=Lax"+(location.protocol === "https:" ? "; Secure" : "");
      if (!document.cookie.split("; ").includes(key)) e.currentTarget.closest("aside")?.setAttribute("hidden","");
      window.dispatchEvent(new Event(event));
    }}>知道了</button></aside>;
}
export function CookieDetails() {
  return <button type="button" onClick={() => {
    document.cookie="lostmidi-cookie-notice=; Path=/; Max-Age=0; SameSite=Lax";
    window.dispatchEvent(new Event(event));
  }}>Cookie 说明</button>;
}
