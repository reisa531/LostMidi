"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";

type Props = {
  name: string; label: string; value: string; onChange: (value: string) => void;
  rows?: number; required?: boolean; maxLength?: number; disabled?: boolean;
};

export function MarkdownField({ name, label, value, onChange, rows = 5, required, maxLength = 20000, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const editor = useRef<HTMLTextAreaElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const returnFocus = editButton.current;
    document.body.style.overflow = "hidden";
    editor.current?.focus();
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", escape); returnFocus?.focus(); };
  }, [open]);
  const inputClass = "mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm";
  return <div className="min-w-0 text-sm">
    <div className="flex items-center justify-between gap-3"><label htmlFor={id}>{label}</label><button ref={editButton} type="button" disabled={disabled} onClick={() => setOpen(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-accent hover:bg-background disabled:opacity-50">编辑 Markdown ↗</button></div>
    <textarea id={id} name={name} rows={rows} maxLength={maxLength} required={required} disabled={disabled} className={inputClass} value={value} onChange={event => onChange(event.target.value)} />
    {open && <div role="dialog" aria-modal="true" aria-label={`${label} Markdown 编辑器`} className="fixed inset-0 z-50 flex min-h-0 flex-col bg-background p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4"><h2 className="font-serif text-xl">{label}</h2><button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-accent px-5 py-2.5 text-sm text-white">完成</button></div>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2"><div className="flex min-h-0 flex-col"><label htmlFor={`${id}-editor`} className="mb-2 font-medium">Markdown</label><textarea ref={editor} id={`${id}-editor`} maxLength={maxLength} className="min-h-0 w-full flex-1 resize-none rounded-lg border border-line bg-white p-4 font-mono text-sm leading-7" value={value} onChange={event => onChange(event.target.value)} /></div>
      <div className="flex min-h-0 flex-col"><h3 className="mb-2 font-medium">预览</h3><div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line bg-white p-4">{value ? <Markdown source={value} /> : <p className="text-muted">预览将在这里显示。</p>}</div></div></div>
    </div>}
  </div>;
}
