import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import { unified } from "unified";

export type MidiFileMetadata = {
  filename: string;
  format: string;
  duration: string;
  tracks: string;
  verification: string;
  sha256: string;
};

const headings = new Set(["文件信息与版本核验", "文件版本与核验"]);
const fields = {
  "版本文件": "filename",
  "格式": "format",
  "时长": "duration",
  "MIDI 轨数": "tracks",
  "核验结果": "verification",
  "SHA-256": "sha256",
} as const;

// The existing archive imports stored their per-version manifests in the description.
// Only move a recognized manifest with a valid digest on every row.
export function extractMidiFileMetadata(description: string) {
  if (![...headings].some(heading => description.includes(heading))) {
    return { description, files: [] };
  }

  const { children } = unified().use(remarkParse).use(remarkGfm).parse(description);
  for (const [index, heading] of children.entries()) {
    if (heading.type !== "heading" || heading.depth !== 2 || !headings.has(toString(heading))) continue;
    const next = children[index + 1];
    const table = next?.type === "paragraph" ? children[index + 2] : next;
    if (table?.type !== "table") continue;
    const [labels, ...rows] = table.children;
    const headers = labels.children.map(cell => toString(cell).trim());
    const positions = Object.entries(fields).map(([label, field]) => [field, headers.indexOf(label)] as const);
    if (!rows.length || positions.some(([, position]) => position < 0)) continue;

    const files = rows.map(row => Object.fromEntries(positions.map(([field, position]) => [
      field, row.children[position] ? toString(row.children[position]).trim() : "",
    ])) as MidiFileMetadata);
    if (files.some(file => !file.filename || !/^[a-f0-9]{64}$/i.test(file.sha256))) continue;

    const start = heading.position?.start.offset;
    const end = table.position?.end.offset;
    if (start === undefined || end === undefined) continue;

    const detail = next?.type === "paragraph" && !toString(next).startsWith("AI（Gemini）整理。本表所列文件名")
      ? description.slice(next.position?.start.offset, next.position?.end.offset)
      : "";
    const remaining = [description.slice(0, start).trimEnd(), detail, description.slice(end).trimStart()];
    return { description: remaining.filter(Boolean).join("\n\n"), files };
  }
  return { description, files: [] };
}
