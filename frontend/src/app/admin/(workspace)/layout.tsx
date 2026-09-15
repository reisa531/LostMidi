import type { Metadata } from "next";
import Link from "next/link";
import { AdminNavigation } from "@/components/admin/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { LogoutForm } from "@/components/admin/logout-form";

export const metadata: Metadata = {
  title: { default: "管理工作台", template: "%s · 管理工作台" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  return <div className="min-h-screen bg-[#f2f4f0] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
    <aside className="bg-[#203d31] px-5 py-5 text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:py-8">
      <Link href="/admin" className="mb-6 flex items-center gap-3 px-3 lg:mb-12"><span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/25 font-serif text-2xl">♮</span><span><span className="block text-sm font-semibold">Lost MIDI Archive</span><span className="mt-1 block text-[10px] tracking-[0.18em] text-[#bdcec5]">ADMINISTRATION</span></span></Link>
      <p className="mb-3 hidden px-4 text-[10px] tracking-widest text-[#a9c1b4] lg:block">档案管理</p>
      <AdminNavigation />
      <div className="mt-auto hidden px-4 pt-10 text-xs leading-6 text-[#bdcec5] lg:block"><p>让每一份档案都有来处。</p><Link href="/" className="mt-4 inline-block text-white underline underline-offset-4">访问公开站点 ↗</Link></div>
    </aside>
    <div className="min-w-0"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-6 py-5 lg:px-10">
      <p className="text-sm font-medium">档案管理平台</p>
      <div className="flex items-center gap-4 text-xs"><span className="rounded-full bg-[#edf3e9] px-3 py-1.5 text-accent">{admin.username}</span><LogoutForm /><Link href="/" className="text-muted hover:text-accent">返回网站 ↗</Link></div>
    </header>
    <main id="main" className="mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:p-10">{children}</main>
    <footer className="mx-auto max-w-7xl px-6 pb-8 text-xs text-muted lg:px-10">Lost MIDI Archive · 管理工作台</footer></div>
  </div>;
}
