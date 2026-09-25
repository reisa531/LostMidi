import Link from "next/link";
import { requireInstallation } from "@/lib/install/state";
import { InstallationUnavailable } from "@/components/install/unavailable";
import { SiteNavigation } from "@/components/site-navigation";
import releases from "@/lib/changelog.json";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await requireInstallation();
  if (!site) return <InstallationUnavailable />;
  return <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line py-5 sm:py-6">
      <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${site.name} 首页`}>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent font-serif text-xl text-accent">♮</span>
        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-serif text-xl tracking-tight">{site.name}</span><span className="mt-1 block text-[10px] tracking-[0.2em] text-muted">数字档案 · 网络考古</span></span>
      </Link>
      <SiteNavigation />
    </header>
    <main id="main" className="min-w-0 flex-1 py-8 sm:py-10">{children}</main>
    <footer className="mt-4 flex flex-col justify-between gap-3 border-t border-line py-6 text-xs leading-6 text-muted sm:flex-row [overflow-wrap:anywhere]">
      <p className="min-w-0">{site.name}<span aria-hidden="true" className="px-2">/</span>为声音留下来处。</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><span>记录作品、历史来源与寻回故事</span><Link href="/about" className="hover:text-accent hover:underline">关于我们</Link><Link href="/about#contact" className="hover:text-accent hover:underline">联系我们</Link><Link href="/changelog" className="hover:text-accent hover:underline">更新日志 · v{releases[0].version}</Link></div>
    </footer>
  </div>;
}
