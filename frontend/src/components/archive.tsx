import Link from "next/link";
import type { ArchiveStatus, Credit } from "@/lib/api/types";

const statuses: Record<ArchiveStatus, string> = {
  archived: "已归档", partially_recovered: "部分寻回", lost: "待寻回", uncertain: "尚待确认",
};
const roles: Record<string, string> = { composer: "作曲", arranger: "编曲", sequencer: "音序制作", contributor: "贡献者" };
export function roleName(role: string) { return roles[role] ?? role; }
const copyrightStatuses: Record<string, string> = { unknown: "尚未确认", public_domain: "公有领域", licensed: "已许可", copyrighted: "受版权保护" };
const distributionPermissions: Record<string, string> = { unknown: "尚未确认", permission_granted: "已获授权", metadata_only: "仅公开资料", restricted: "限制分发" };
export function copyrightLabel(value: string | null) { return copyrightStatuses[value ?? "unknown"] ?? "尚未确认"; }
export function distributionLabel(value: string | null) { return distributionPermissions[value ?? "unknown"] ?? "尚未确认"; }
export function Status({ status }: { status: ArchiveStatus }) {
  return <span className="inline-block whitespace-nowrap rounded-sm border border-line px-2 py-1 text-xs text-accent">{statuses[status] ?? status}</span>;
}
export function Credits({ credits }: { credits: Credit[] }) {
  return credits.length ? <ul className="space-y-2">{credits.map(c => <li key={`${c.person_id}-${c.role}`}>
    <Link className="archive-link" href={`/people/${c.person_id}`}>{c.display_name}</Link>
    <span className="ml-2 text-xs text-muted">{roleName(c.role)}</span>
  </li>)}</ul> : <p className="text-muted">作者尚待考证</p>;
}
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="border-t border-line py-8"><h2 className="mb-5 font-serif text-2xl">{title}</h2><div className="space-y-5 text-sm leading-7">{children}</div></section>;
}
export function Unavailable() {
  return <section><p className="eyebrow">Archive temporarily unavailable</p><h1 className="my-6 font-serif text-3xl">档案暂时无法读取</h1>
    <p className="text-muted">请稍后刷新页面重试。</p><Link className="archive-link mt-6 inline-block" href="/">返回首页</Link></section>;
}
export function ExternalSource({ url, label }: { url: string | null; label: string }) {
  if (!url) return null;
  let valid = false;
  try { valid = ["http:", "https:"].includes(new URL(url).protocol); } catch { /* Plain text for malformed historical URLs. */ }
  return valid ? <a className="archive-link break-all" href={url} rel="noreferrer" target="_blank">{label} ↗</a> : <span className="break-all">{url}</span>;
}
export function dateLabel(value: string | null) { return value ? value.slice(0, 10) : "日期不详"; }
