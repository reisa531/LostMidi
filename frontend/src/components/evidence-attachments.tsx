"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import type { EvidenceFile } from "@/lib/api/types";

const previewable = new Set(["image/png", "image/jpeg", "text/plain"]);
const maxPreviewBytes = 1024 * 1024;

export function EvidenceAttachments({ midiId, files }: { midiId: string; files: EvidenceFile[] }) {
  const [selected, setSelected] = useState<EvidenceFile | null>(null);
  const [preview, setPreview] = useState<{ imageUrl?: string; text?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    let active = true;
    let imageUrl: string | undefined;
    const path = `/api/midis/${midiId}/evidence/${selected.id}`;
    void (async () => {
      try {
        const response = await fetch(path, { signal: controller.signal, cache: "no-store" });
        if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== selected.media_type) throw new Error("Preview unavailable");
        const content = await response.arrayBuffer();
        if (content.byteLength > maxPreviewBytes) throw new Error("Preview too large");
        if (!active) return;
        if (selected.media_type === "text/plain") setPreview({ text: new TextDecoder("utf-8").decode(content) });
        else {
          imageUrl = URL.createObjectURL(new Blob([content], { type: selected.media_type }));
          setPreview({ imageUrl });
        }
        setLoading(false);
      } catch {
        if (active) { setError(true); setLoading(false); }
      }
    })();
    return () => { active = false; controller.abort(); if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [midiId, selected, retry]);

  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setSelected(null); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href]"));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    const keepFocus = (event: FocusEvent) => {
      if (dialog.current && event.target instanceof Node && !dialog.current.contains(event.target)) closeButton.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", keepFocus);
      returnFocus.current?.focus();
    };
  }, [selected]);

  if (!files.length) return null;
  const open = (file: EvidenceFile, button: HTMLButtonElement) => {
    returnFocus.current = button;
    setPreview(null); setError(false); setLoading(true); setSelected(file);
  };
  const retryPreview = () => { setPreview(null); setError(false); setLoading(true); setRetry(value => value + 1); };
  return <div className="rounded-lg border border-line bg-white/70 p-4">
    <p className="mb-2 text-xs font-medium text-muted">证据附件 · {files.length}</p>
    <ul className="space-y-2">{files.map(file => {
      const path = `/api/midis/${midiId}/evidence/${file.id}`;
      const canPreview = previewable.has(file.media_type);
      return <li key={file.id} className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        {canPreview ? <button type="button" onClick={event => open(file, event.currentTarget)} className="archive-link min-w-0 break-all text-left">{file.filename} ↗</button>
          : <a className="archive-link min-w-0 break-all" href={path}>{file.filename} ↓</a>}
        <span className="text-xs text-muted">{file.file_size.toLocaleString("zh-CN")} 字节</span>
        {canPreview && <a className="text-xs text-accent underline" href={path}>下载</a>}
      </li>;
    })}</ul>
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3 sm:px-6 sm:py-4">
          <div className="min-w-0"><p className="eyebrow">证据附件预览</p><h2 id={titleId} className="mt-1 break-all font-serif text-xl">{selected.filename}</h2></div>
          <div className="flex shrink-0 items-center gap-3"><a className="archive-link text-sm" href={`/api/midis/${midiId}/evidence/${selected.id}`}>下载</a><button ref={closeButton} type="button" onClick={() => setSelected(null)} className="rounded-lg border border-line px-3 py-2 text-sm">关闭</button></div>
        </div>
        <div className="min-h-0 overflow-auto p-4 sm:p-6">
          {loading && <p role="status" className="py-8 text-center text-sm text-muted">正在加载预览…</p>}
          {error && <div role="alert" className="space-y-3 py-8 text-center text-sm"><p>预览暂时无法显示，请重试或下载文件。</p><button type="button" onClick={retryPreview} className="archive-link">重新加载</button></div>}
          {preview?.text !== undefined && <pre className="whitespace-pre-wrap break-words rounded-lg border border-line bg-white p-4 font-mono text-sm leading-6">{preview.text}</pre>}
          {preview?.imageUrl && <Image src={preview.imageUrl} alt={selected.filename} width={1200} height={900} unoptimized className="mx-auto h-auto max-h-[72dvh] w-auto max-w-full object-contain" />}
        </div>
      </div>
    </div>}
  </div>;
}
