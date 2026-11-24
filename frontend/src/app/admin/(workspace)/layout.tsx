import type { Metadata } from "next";
import Link from "next/link";
import { ArchiveMark } from "@/components/archive-brand";
import { AdminNavigation } from "@/components/admin/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { LogoutForm } from "@/components/admin/logout-form";
import { installedSite } from "@/lib/install/state";

export const metadata: Metadata = {
  title: { default: "管理工作台", template: "%s · 管理工作台" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [admin, site] = await Promise.all([requireAdmin(), installedSite()]);
  return <div className="workspace min-h-screen lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
    <aside className="workspace-rail min-w-0 bg-foreground px-4 py-5 text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:overflow-y-auto lg:flex-col lg:py-7">
      <Link href="/admin" className="mb-5 flex min-w-0 items-center gap-3 px-3 lg:mb-8"><ArchiveMark /><span className="min-w-0"><span className="block text-sm font-semibold [overflow-wrap:anywhere]">{site.name}</span><span className="mt-1 block text-[10px] tracking-[0.18em] text-rail-muted">工作台</span></span></Link>
      <AdminNavigation role={admin.role} />

    </aside>
    <div className="min-w-0"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white/70 px-5 py-4 lg:px-8">
      <p className="text-sm font-medium">档案工作台</p>
      <div className="flex min-w-0 flex-wrap items-center gap-4 text-xs"><span className="min-w-0 rounded-full bg-tint px-3 py-1.5 text-accent [overflow-wrap:anywhere]">{admin.username} · {{ owner:"站长", admin:"管理员", maintainer:"维护者" }[admin.role]}</span><LogoutForm /><Link href="/" className="text-muted hover:text-accent">返回网站 ↗</Link></div>
    </header>
    <main id="main" className="mx-auto min-w-0 max-w-7xl px-5 py-8 sm:px-8">{children}</main>
    <footer className="mx-auto max-w-7xl px-6 pb-8 text-xs text-muted lg:px-10">Lost MIDI Archive · 管理工作台</footer></div>
  </div>;
}
