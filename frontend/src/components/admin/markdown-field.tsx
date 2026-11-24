"use client";

import { useLayoutEffect, useId, useRef, useState } from "react";
import { videoSource } from "@/lib/bilibili";
import { Markdown } from "@/components/markdown";

type Props = {
  name: string; label: string; value: string; onChange: (value: string) => void;
  rows?: number; required?: boolean; maxLength?: number; disabled?: boolean;
};

export function MarkdownField({ name, label, value, onChange, rows = 5, required, maxLength = 20000, disabled }: Props) {
  const videoInput = useRef<HTMLInputElement>(null);
  const [videoError,setVideoError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const returnFocus = editButton.current;
    document.body.style.overflow = "hidden";
    editor.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]),input,iframe,textarea:not([disabled]),a[href]"));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const keepFocusInside = (event: FocusEvent) => {
      if (dialog.current && event.target instanceof Node && !dialog.current.contains(event.target))
        editor.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", keepFocusInside);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", onKeyDown); document.removeEventListener("focusin", keepFocusInside); returnFocus?.focus(); };
  }, [open]);
  const inputClass = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <div className="min-w-0 text-sm">
    <div className="flex items-center justify-between gap-3"><label htmlFor={id}>{label}</label><button ref={editButton} type="button" disabled={disabled} onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-accent hover:bg-background disabled:opacity-50">编辑 Markdown ↗</button></div>
    <textarea ref={field} id={id} name={name} rows={rows} maxLength={maxLength} required={required} disabled={disabled} className={inputClass} value={value} onChange={event => onChange(event.target.value)} />
    {open && <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${label} Markdown 编辑器`} className="fixed inset-0 z-50 flex h-dvh min-h-0 flex-col overflow-hidden bg-background p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-serif text-xl">{label}</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-accent px-5 py-2.5 text-sm text-white">完成</button></div>
      <div className="mb-3 flex flex-wrap items-center gap-2"><label htmlFor={id+"-video"}>B 站视频</label>
        <input id={id+"-video"} type="text" ref={videoInput} aria-invalid={!!videoError} placeholder="视频网址或 BV 号" className="min-w-0 flex-1 border border-line p-2" />
        <button type="button" onClick={() => {
          const input = editor.current;
          const video = videoInput.current?.value.trim() ?? "";
          if (!videoSource(video)) { setVideoError("请填写 B 站视频网址或 BV 号。");videoInput.current?.focus();return; }
          if (!input) return;
          const link = new URL(video.trim().startsWith("https://") ? video.trim() : "https://www.bilibili.com/video/"+video.trim());
          const snippet = "\n\n[B站视频]("+link.href.replaceAll(")","%29")+")\n\n";
          const start=input.selectionStart;
          const next=value.slice(0,start)+snippet+value.slice(input.selectionEnd);
          if(next.length>maxLength) {setVideoError("正文已超过字数上限。");return;}
          onChange(next); setVideoError(""); if (videoInput.current) videoInput.current.value=""; requestAnimationFrame(() => {field.current?.dispatchEvent(new Event("input",{bubbles:true}));input.focus();input.setSelectionRange(start+snippet.length,start+snippet.length);});
        }} className="border border-line p-2 disabled:opacity-50">插入视频</button>{videoError && <p role="alert" className="w-full text-accent">{videoError}</p>}</div>
      <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 lg:grid-cols-2 lg:grid-rows-1 lg:gap-4"><div className="flex min-h-0 flex-col"><label htmlFor={`${id}-editor`} className="mb-2 font-medium">Markdown</label><textarea ref={editor} id={`${id}-editor`} maxLength={maxLength} className="min-h-0 w-full flex-1 resize-none rounded-lg border border-line bg-white p-3 font-mono text-sm leading-7 sm:p-4" value={value} onChange={event => onChange(event.target.value)} /></div>
      <div className="flex min-h-0 flex-col"><h3 className="mb-2 font-medium">预览</h3><div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-white p-4">{value ? <Markdown source={value} /> : <p className="text-muted">预览将在这里显示。</p>}</div></div></div>
    </div>}
  </div>;
}
