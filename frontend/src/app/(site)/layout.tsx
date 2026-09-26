import Link from "next/link";
import { installedSite, requireInstallation } from "@/lib/install/state";
import { SiteNavigation } from "@/components/site-navigation";
import releases from "@/lib/changelog.json";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const installed = await requireInstallation();
  const site = installed ?? await installedSite();
  return <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-5 border-b border-line py-5 sm:py-6">
      <Link href="/" className="flex min-w-0 items-center gap-3" aria-label={`${site.name} 首页`}>
        <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-accent font-serif text-xl text-accent">♮</span>
        <span className="min-w-0 [overflow-wrap:anywhere]"><span className="block font-serif text-xl tracking-tight">{site.name}</span><span className="mt-1 block text-[10px] tracking-[0.2em] text-muted">数字档案 · 网络考古</span></span>
      </Link>
      <SiteNavigation />
    </header>
    <main id="main" className="min-w-0 flex-1 py-8 sm:py-10">{!installed && <p role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">档案服务暂时不可用；关于与联系信息仍可查看。请稍后重试动态内容。</p>}{children}</main>
    <footer className="mt-4 flex flex-col justify-between gap-3 border-t border-line py-6 text-xs leading-6 text-muted sm:flex-row [overflow-wrap:anywhere]">
      <p className="min-w-0">{site.name}<span aria-hidden="true" className="px-2">/</span>为声音留下来处。</p>
      <div className="flex flex-wrap gap-x-6 gap-y-2"><span>记录作品、历史来源与寻回故事</span><Link href="/changelog" className="hover:text-accent hover:underline">更新日志 · v{releases[0].version}</Link></div>
    </footer>
  </div>;
}
