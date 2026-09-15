import Link from "next/link";
import { adminModules } from "@/lib/admin/modules";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "管理功能" };
export default async function AdminModules() {
  await requireAdmin();
  return <><AdminPageHeader eyebrow="Workspace / Modules" title="管理功能" description="选择需要使用的档案管理功能。" />
    <div className="grid gap-5 md:grid-cols-2">{adminModules.filter(module => module.status === "available").map((module, index) => <section key={module.key} className="flex flex-col rounded-xl border border-line bg-white p-6"><span className="mb-6 font-mono text-sm text-muted">0{index + 1}</span><h2 className="text-lg font-semibold">{module.label}</h2><p className="mb-6 mt-3 text-sm leading-7 text-muted">{module.description}</p><Link className="archive-link mt-auto text-sm" href={module.href}>进入 →</Link></section>)}</div>
  </>;
}
