import Link from "next/link";
import { adminModules } from "@/lib/admin/modules";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "模块目录" };
export default async function AdminModules() {
  await requireAdmin();
  return <><AdminPageHeader eyebrow="Workspace / Modules" title="模块目录" description="集中查看平台模块及其开放状态。已开放的模块可以直接进入，规划中的功能会在完成后加入导航。" />
    <div className="grid gap-5 md:grid-cols-2">{adminModules.map((module, index) => <section key={module.key} className="flex flex-col rounded-xl border border-line bg-white p-6"><div className="mb-6 flex items-center justify-between"><span className="font-mono text-sm text-muted">0{index + 1}</span><span className={`rounded-full px-3 py-1 text-xs ${module.status === "available" ? "bg-[#edf3e9] text-accent" : "bg-gray-100 text-gray-600"}`}>{module.status === "available" ? "已开放 · 只读" : "规划中"}</span></div><h2 className="text-lg font-semibold">{module.label}</h2><p className="mb-6 mt-3 text-sm leading-7 text-muted">{module.description}</p>{module.href ? <Link className="archive-link mt-auto text-sm" href={module.href}>进入模块 →</Link> : <p className="mt-auto text-xs text-muted">后续开放</p>}</section>)}</div>
  </>;
}
