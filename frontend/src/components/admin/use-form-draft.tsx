"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type DraftField = { name: string; value: string; checked?: boolean };

export function useFormDraft(key: string) {
  const formRef = useRef<HTMLFormElement>(null);
  const dirtyRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const storageKey = `lostmidi:draft:${key}`;

  useEffect(() => {
    try { queueMicrotask(() => setHasDraft(Boolean(sessionStorage.getItem(storageKey)))); } catch { /* Storage may be disabled. */ }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const leaveByLink = (event: MouseEvent) => {
      if (!dirtyRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      const link = target instanceof Element ? target.closest("a[href]") : null;
      if (link instanceof HTMLAnchorElement && link.target !== "_blank" && !window.confirm("有未保存的修改，确定离开吗？草稿会保留在当前浏览器标签页。")) {
        event.preventDefault(); event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leaveByLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", leaveByLink, true); };
  }, [storageKey]);

  const saveDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    const fields: DraftField[] = Array.from(form.elements).filter((element): element is HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement =>
      element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement
    ).filter(element => element.name && !["hidden", "file", "password", "submit"].includes(element.type))
      .map(element => ({ name: element.name, value: element.value, ...("checked" in element ? { checked: element.checked } : {}) }));
    dirtyRef.current = true; setDirty(true);
    try { sessionStorage.setItem(storageKey, JSON.stringify(fields)); setHasDraft(false); } catch { /* Leave warning still works without storage. */ }
  }, [storageKey]);

  const clearDraft = useCallback(() => {
    dirtyRef.current = false; setDirty(false); setHasDraft(false);
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
  }, [storageKey]);
  const discardDraft = useCallback(() => {
    setHasDraft(false);
    try { sessionStorage.removeItem(storageKey); } catch { /* Storage may be disabled. */ }
  }, [storageKey]);

  const restoreDraft = useCallback(() => {
    const form = formRef.current;
    if (!form) return;
    try {
      const fields = JSON.parse(sessionStorage.getItem(storageKey) ?? "[]") as DraftField[];
      for (const field of fields) {
        const element = Array.from(form.elements).find(control => (control as HTMLInputElement).name === field.name);
        if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) continue;
        if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
          element.checked = Boolean(field.checked);
        } else {
          const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLSelectElement.prototype;
          Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, field.value);
        }
        element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
      }
      dirtyRef.current = true; setDirty(true); setHasDraft(false);
    } catch { clearDraft(); }
  }, [storageKey, clearDraft]);

  const attachForm = useCallback((element: HTMLFormElement | null) => { formRef.current = element; }, []);
  return { attachForm, dirty, hasDraft, saveDraft, clearDraft, discardDraft, restoreDraft };
}

export function DraftNotice({ hasDraft, dirty, restore, discard }: { hasDraft: boolean; dirty: boolean; restore: () => void; discard: () => void }) {
  if (!hasDraft && !dirty) return null;
  return <div role="status" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    <span>{hasDraft ? "当前标签页有未提交的文字草稿；文件需要重新选择。" : "修改尚未保存，离开页面前会提醒。"}</span>
    {hasDraft && <button type="button" onClick={restore} className="underline">恢复草稿</button>}
    <button type="button" onClick={discard} className="underline">清除草稿</button>
  </div>;
}
