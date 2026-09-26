"use client";

import { useEffect, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

export function UsageTerms({ author, terms }: { author: string; terms: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const returnFocus = button.current;
    document.body.style.overflow = "hidden";
    close.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
      if (event.key !== "Tab" || !dialog.current) return;
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled])"));
      if (!focusable.length) return;
      if (event.shiftKey && document.activeElement === focusable[0]) { event.preventDefault(); focusable.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) { event.preventDefault(); focusable[0].focus(); }
    };
    const keepFocus = (event: FocusEvent) => {
      if (dialog.current && event.target instanceof Node && !dialog.current.contains(event.target)) close.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", keepFocus);
      returnFocus?.focus();
    };
  }, [open]);
  return <>
    <button ref={button} type="button" onClick={() => setOpen(true)} className="rounded-full border border-line bg-white px-3 py-1 text-xs text-accent hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">使用条约</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div ref={dialog} role="dialog" aria-modal="true" aria-label={`${author} 的使用条约`} className="flex max-h-[min(90dvh,52rem)] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7"><div><p className="eyebrow">作者使用条约</p><h2 className="mt-2 font-serif text-2xl">{author}</h2></div><button ref={close} type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-white">关闭</button></div>
        <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-7"><Markdown source={terms} /></div>
      </div>
    </div>}
  </>;
}
