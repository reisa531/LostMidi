"use client";
import type { StaffFile } from "@/lib/staff-file";
import { useRecordAccess } from "./record-access";
import { Section, dateLabel } from "@/components/archive";
import { MidiDownload } from "@/components/midi-download";
import type { MidiDetail } from "@/lib/api/types";
import type { MidiFileMetadata } from "@/lib/midi-file-metadata";

export function MidiFileInformation({ slug, stored, metadata, redistributionProhibited }: {
  slug: string;
  stored: MidiDetail["files"];
  metadata: MidiFileMetadata[];
  redistributionProhibited: boolean;
}) {
  const sources = useRecordAccess()?.files ?? [];
  const sourcesByHash = new Map(sources.map(source => [source.digest.toLowerCase(), source]));
  const metadataByHash = new Map(metadata.map(file => [file.sha256.toLowerCase(), file]));
  const rows = stored.map(file => {
    const hash = file.sha256.toLowerCase();
    const details = metadataByHash.get(hash);
    metadataByHash.delete(hash);
    return { key: file.id, file, details };
  });
  const versions: { key: string; details?: MidiFileMetadata; file?: MidiDetail["files"][number]; source?: StaffFile }[] = [
    ...rows.map(row => ({ ...row, source: sourcesByHash.get(row.file.sha256.toLowerCase()) })),
    ...Array.from(metadataByHash, ([key, details]) => ({ key, details, file: undefined, source: sourcesByHash.get(key) })),
  ];
  const represented = new Set(versions.map(row => row.source?.digest));
  for (const source of sources) {
    if (!represented.has(source.digest)) versions.push({ key: source.digest, details: undefined, file: undefined, source });
  }
  const unavailableReason = redistributionProhibited
    ? "原作者禁止再分发，若需要请邮件联系管理员。"
    : "尚未确认公开分发授权，如需获取请邮件联系管理员。";

  return <Section id="record-files" title="文件信息">
    {!versions.length && <p className="text-muted">尚未收录文件，此档案目前仅存文字资料。</p>}
    {versions.map(({ key, file, details, source }) => {
      const filename = file?.original_filename ?? details?.filename ?? source?.name;
      const tooltipId = `midi-file-download-${key}`;
      return <div key={key} className="min-w-0 rounded-sm border border-line p-4 sm:p-5">
        <dl className="space-y-3">
          <div><dt className="text-muted">文件名</dt><dd className="min-w-0 font-semibold [overflow-wrap:anywhere]">{filename}</dd></div>
          {details?.format && <div><dt className="text-muted">格式</dt><dd>{details.format}</dd></div>}
          {details?.duration && <div><dt className="text-muted">时长</dt><dd>{details.duration}</dd></div>}
          {details?.tracks && details.tracks !== "—" && <div><dt className="text-muted">MIDI 轨数</dt><dd>{details.tracks}</dd></div>}
          {details?.verification && <div><dt className="text-muted">核验结果</dt><dd>{details.verification}</dd></div>}
          <div><dt className="text-muted">SHA-256</dt><dd className="min-w-0 break-all font-mono text-xs">{file?.sha256 ?? details?.sha256 ?? source?.digest}</dd></div>
          {file?.discovered_at && <div><dt className="text-muted">发现时间</dt><dd>{dateLabel(file.discovered_at)}</dd></div>}
        </dl>
        {source ? <MidiDownload slug={slug} id={key} filename={filename ?? source.name} staffFile={source} /> : file?.download_available === true
          ? <MidiDownload slug={slug} id={file.id} filename={file.original_filename} />
          : <div className="group mt-5 w-fit max-w-full space-y-2">
            <button type="button" aria-disabled="true" aria-describedby={tooltipId}
              className="cursor-not-allowed rounded-sm border border-line bg-neutral-100 px-4 py-2 text-sm text-neutral-600">下载文件</button>
            <p id={tooltipId} role="tooltip" className="hidden text-sm text-muted group-hover:block group-focus-within:block">{unavailableReason}</p>
          </div>}
      </div>;
    })}
  </Section>;
}
