"use client";
import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { StaffFile } from "@/lib/staff-file";

type StaffAccess = { files: StaffFile[] };
const Context = createContext<StaffAccess | null>(null);
export const useRecordAccess = () => useContext(Context);

export function RecordAccess({ kind, id, children }: { kind: "midis" | "articles"; id: string; children: ReactNode }) {
  const [access, setAccess] = useState<StaffAccess | null>(null);
  useEffect(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      const request = new AbortController();
      pending = request;
      try {
        const response = await fetch(`/admin/record-access/${kind}/${id}`, { cache: "no-store", signal: request.signal });
        const next = response.ok ? await response.json() as StaffAccess : null;
        if (!request.signal.aborted) setAccess(next);
      } catch {
        if (!request.signal.aborted) setAccess(null);
      }
    }
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      pending?.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, [kind, id]);
  return <Context.Provider value={access}>{children}</Context.Provider>;
}

export function RecordEditLink({ href, label }: { href: string; label: string }) {
  const access = useRecordAccess();
  return access ? <Link prefetch={false} className="archive-link inline-flex min-h-11 items-center whitespace-nowrap text-sm" href={href}>{label}</Link> : null;
}
