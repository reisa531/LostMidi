"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchStaffFile, type StaffFile } from "@/lib/staff-file";

const errorMessages: Record<number, string> = {
  403: "此文件尚未确认公开分发，或档案限制分发、仅公开资料，暂不提供下载。请通过联系我们说明用途。",
  404: "档案或文件不存在，可能已移除，请刷新页面重试。",
  503: "下载服务暂不可用，请稍后重试。",
  504: "下载请求超时，请稍后重试。",
};

type DownloadState = { kind: "idle" | "loading" | "success" | "error"; message: string };

export type DownloadFile = { id: string; filename: string; staffFile?: StaffFile };
type DownloadProps = { slug: string } & (DownloadFile | {
  title: string; loadFiles: (signal: AbortSignal) => Promise<DownloadFile[]>;
});

export function MidiDownload(props: DownloadProps) {
  const { slug } = props;
  const catalog = "loadFiles" in props;
  const [versions, setVersions] = useState<DownloadFile[]>([]);
  const [selected, setSelected] = useState("");
  const versionPicker = useRef<HTMLSelectElement>(null);
  const downloadButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (versions.length > 1) versionPicker.current?.focus();
  }, [versions]);
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
    setState({ kind: "loading", message: "正在获取文件，请稍候。" });
    let timedOut = false;
    let failureMessage = "下载失败，请检查网络后重试。";
    const timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, 120_000);
    try {
      let file: DownloadFile;
      if (catalog) {
        const options = versions.length ? versions : await props.loadFiles(controller.signal);
        controller.signal.throwIfAborted();
        if (!options.length) {
          setState({ kind: "error", message: "暂无下载" });
          return;
        }
        if (options.length > 1 && !selected) {
          setVersions(options);
          setSelected(options[0].id);
          setState({ kind: "idle", message: "请选择文件版本。" });
          return;
        }
        file = options.find(option => option.id === selected) ?? options[0];
      } else {
        file = props;
      }
      const { id, filename, staffFile } = file;
      let blob: Blob;
      if (staffFile) {
        failureMessage = "未能取得已核验的文件，请确认登录状态后重试。";
        blob = await fetchStaffFile(staffFile, controller.signal);
      } else {
        const response = await fetch(`/api/midis/${encodeURIComponent(slug)}/files/${encodeURIComponent(id)}/download`, {
          cache: "no-store", credentials: "omit", redirect: "error", signal: controller.signal,
          headers: { Accept: "application/octet-stream" },
        });
        failureMessage = errorMessages[response.status] ?? "下载服务返回无效文件，请稍后重试。";
        const lengthHeader = response.headers.get("Content-Length");
        const length = Number(lengthHeader);
        if (response.status !== 200 || response.headers.get("Content-Type")?.toLowerCase() !== "application/octet-stream"
          || !lengthHeader || !/^[1-9][0-9]{0,7}$/.test(lengthHeader) || length > 20_000_000) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Invalid download response");
        }
        blob = await response.blob();
        if (blob.size !== length) throw new Error("Incomplete download");
      }
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
      setState({ kind: "success", message: "下载已开始，请查看浏览器下载列表。" });
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

  return <div className={catalog ? "min-w-0" : "mt-5 min-w-0 space-y-2"}>
    {catalog && versions.length > 1 && <select ref={versionPicker} aria-label={`${props.title}的文件版本`}
      onKeyDown={event => {
        if (event.key !== "Escape") return;
        setVersions([]);
        setSelected("");
        setState({ kind: "idle", message: "" });
        downloadButton.current?.focus();
      }} value={selected}
      onChange={event => setSelected(event.target.value)} disabled={state.kind === "loading"}
      className="mb-2 block w-full min-w-0 rounded-sm border border-line bg-surface p-2 text-sm">
      {versions.map(file => <option key={file.id} value={file.id}>{file.filename}</option>)}
    </select>}
    <button ref={downloadButton} type="button" onClick={download} disabled={state.kind === "loading"} aria-busy={state.kind === "loading"}
      aria-label={catalog ? `下载：${props.title}` : `下载文件：${props.filename}`}
      className="w-full cursor-pointer rounded-sm border border-accent bg-accent px-4 py-2 text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60 sm:w-auto">
      {state.kind === "loading" ? "正在下载…" : catalog ? "下载" : "下载文件"}
    </button>
    <p role={state.kind === "error" ? "alert" : "status"} aria-live={state.kind === "error" ? "assertive" : "polite"} aria-atomic="true" className={`${catalog && state.kind === "success" ? "sr-only" : ""} min-w-0 text-sm [overflow-wrap:anywhere] ${state.kind === "error" ? "text-red-800" : "text-muted"}`}>{state.message}</p>
    {!catalog && state.kind === "error" && <p className="text-sm"><Link href="/about#contact" className="archive-link">联系我们申请获取</Link></p>}
  </div>;
}
