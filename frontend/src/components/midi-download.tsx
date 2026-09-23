"use client";

import { useEffect, useRef, useState } from "react";

const errorMessages: Record<number, string> = {
  403: "此文件尚未确认可公开分发，或档案限制分发、仅公开资料，暂时无法下载。",
  404: "档案或文件不存在，可能已被移除，请刷新页面后重试。",
  503: "下载服务暂时不可用，请稍后重试。",
  504: "下载请求超时，请稍后重试。",
};

type DownloadState = { kind: "idle" | "loading" | "success" | "error"; message: string };

export function MidiDownload({ slug, id, filename }: { slug: string; id: string; filename: string }) {
  const [state, setState] = useState<DownloadState>({ kind: "idle", message: "" });
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => {
    inFlight.current?.abort();
    inFlight.current = null;
  }, []);

  async function download() {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setState({ kind: "loading", message: "正在获取 MIDI 文件，请稍候。" });
    let timedOut = false;
    let failureMessage = "下载失败，请检查网络连接后重试。";
    // Allow the route's 30-second deadline to return its own error first.
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 35_000);
    try {
      const response = await fetch(`/api/midis/${encodeURIComponent(slug)}/files/${encodeURIComponent(id)}/download`, {
        cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
        headers: { Accept: "audio/midi" },
      });
      failureMessage = errorMessages[response.status] ?? "下载服务返回了无效文件，请稍后重试。";
      const lengthHeader = response.headers.get("Content-Length");
      const length = Number(lengthHeader);
      if (response.status !== 200 || response.headers.get("Content-Type")?.toLowerCase() !== "audio/midi"
        || !lengthHeader || !/^[1-9][0-9]{0,6}$/.test(lengthHeader) || length > 1_048_576) {
        void response.body?.cancel().catch(() => {});
        throw new Error("Invalid download response");
      }
      const blob = await response.blob();
      if (blob.size !== length) throw new Error("Incomplete download");
      controller.signal.throwIfAborted();
      if (inFlight.current !== controller) return;

      const objectUrl = URL.createObjectURL(blob);
      // Keep the URL alive after click (and component unmount) so Firefox can consume it.
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      link.hidden = true;
      document.body.appendChild(link);
      try { link.click(); } finally { link.remove(); }
      setState({ kind: "success", message: "下载已开始，请查看浏览器的下载列表。" });
    } catch {
      if (inFlight.current === controller) {
        setState({ kind: "error", message: timedOut ? errorMessages[504] : failureMessage });
      }
    } finally {
      window.clearTimeout(timer);
      controller.abort();
      if (inFlight.current === controller) inFlight.current = null;
    }
  }

  return <div className="mt-5 min-w-0 space-y-2">
    <button type="button" onClick={download} disabled={state.kind === "loading"} aria-busy={state.kind === "loading"}
      aria-label={`下载 MIDI：${filename}`}
      className="w-full cursor-pointer rounded-sm border border-accent bg-accent px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
      {state.kind === "loading" ? "正在下载…" : "下载 MIDI"}
    </button>
    <p role={state.kind === "error" ? "alert" : "status"} aria-live={state.kind === "error" ? "assertive" : "polite"} aria-atomic="true" className={`min-w-0 text-sm [overflow-wrap:anywhere] ${state.kind === "error" ? "text-red-800" : "text-muted"}`}>{state.message}</p>
  </div>;
}
