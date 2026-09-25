import Link from "next/link";

const sections = [
  ["edit", "基础资料", "edit"], ["credits", "署名", "credits"],
  ["history", "来源与寻回", "history"], ["files", "文件", "files"],
] as const;
export function MidiSectionNav({ id, publicId, current }: { id: string; publicId: string; current: typeof sections[number][0] }) {
  return <nav aria-label="作品资料管理" className="mb-6 flex flex-wrap gap-x-5 gap-y-3 border-b border-line pb-4 text-sm">
    {sections.map(([key, label, path]) => <Link key={key} aria-current={current === key ? "page" : undefined} className={current === key ? "font-semibold text-accent underline underline-offset-4" : "archive-link"} href={`/admin/midis/${id}/${path}`}>{label}</Link>)}
    <Link className="archive-link" href={`/midis/${publicId}`} target="_blank" rel="noopener noreferrer">公开详情 ↗</Link>
    <Link className="archive-link" href="/admin/midis">档案列表</Link>
  </nav>;
}
