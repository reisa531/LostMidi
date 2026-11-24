"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MidiDownload, type DownloadFile } from "@/components/midi-download";
import type { StaffFile } from "@/lib/staff-file";

const StaffAudio = createContext<ReadonlySet<string> | null>(null);

export function CatalogFileAccess({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string> | null>(null);
  useEffect(() => {
    let pending: AbortController | undefined;
    async function refresh() {
      pending?.abort();
      const request = new AbortController();
      pending = request;
      try {
        const response = await fetch("/admin/catalog-access", { cache: "no-store", signal: request.signal });
        const next = response.ok ? new Set<string>(await response.json()) : null;
        if (!request.signal.aborted) setIds(next);
      } catch {
        if (!request.signal.aborted) setIds(null);
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
  }, []);
  return <StaffAudio.Provider value={ids}>{children}</StaffAudio.Provider>;
}

type Props = { id: string; slug: string; title: string; hasFiles: boolean; hasPublicDownload: boolean };
export function CatalogFileCell({ id, slug, title, hasFiles, hasPublicDownload }: Props) {
  const staffAudio = useContext(StaffAudio);
  const staff = staffAudio !== null;
  if (!hasPublicDownload && !(staff && (hasFiles || staffAudio.has(id)))) {
    return <span className="text-muted">暂无下载</span>;
  }

  async function loadFiles(signal: AbortSignal): Promise<DownloadFile[]> {
    const url = staff ? `/admin/record-access/midis/${id}` : `/api/catalog/${encodeURIComponent(slug)}/files`;
    const response = await fetch(url, { cache: "no-store", signal, redirect: "error" });
    if (!response.ok) throw new Error("Download options unavailable");
    if (!staff) return response.json();
    const { files }: { files: StaffFile[] } = await response.json();
    return files.map(file => ({ id: file.media_key, filename: file.name, staffFile: file }));
  }

  return <MidiDownload key={String(staff)} slug={slug} title={title} loadFiles={loadFiles} />;
}
