import Link from "next/link";
import { requireInstallation } from "@/lib/install/state";
import { InstallationUnavailable } from "@/components/install/unavailable";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const site = await requireInstallation();
  if (!site) return <InstallationUnavailable />;
  return (
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 sm:px-10">
          <header className="flex flex-wrap items-center justify-between gap-6 border-b border-line py-7">
            <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${site.name} 首页`}>
              <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center border border-accent font-serif text-xl text-accent">♮</span>
              <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-serif text-xl tracking-tight">{site.name}</span><span className="mt-1 block text-[10px] tracking-[0.2em] text-muted">数字档案 · 网络考古</span></span>
            </Link>
            <nav aria-label="主导航" className="flex gap-6 text-sm sm:gap-8">
              <Link href="/midis" className="hover:text-accent hover:underline">MIDI 档案</Link>
              <Link href="/about" className="hover:text-accent hover:underline">关于项目</Link>
            </nav>
          </header>
          <main id="main" className="flex-1 py-12 sm:py-16">{children}</main>
          <footer className="flex flex-col justify-between gap-3 border-t border-line py-7 text-xs leading-6 text-muted sm:flex-row [overflow-wrap:anywhere]">
            <p className="min-w-0">{site.name} <span aria-hidden="true" className="px-2">/</span> 为声音留下来处。</p>
            <p>记录作品、历史来源与寻回故事</p>
          </footer>
        </div>
  );
}
