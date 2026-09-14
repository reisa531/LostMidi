import Link from "next/link";

export function AdminPageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="mb-8"><p className="eyebrow">{eyebrow}</p><h1 className="mb-3 mt-3 text-3xl font-semibold tracking-tight">{title}</h1><p className="max-w-2xl text-sm leading-7 text-muted">{description}</p></header>;
}
export function AdminPanel({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="min-w-0 rounded-xl border border-line bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5"><h2 className="font-semibold">{title}</h2>{action}</div><div className="p-6">{children}</div></section>;
}
export function AdminUnavailable() {
  return <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm leading-7"><h2 className="font-semibold text-amber-950">暂时无法读取档案数据</h2><p className="text-amber-900">请确认后端服务可用后刷新页面。工作台导航仍可正常使用。</p><Link className="archive-link mt-2 inline-block" href="/admin">返回工作台</Link></div>;
}
