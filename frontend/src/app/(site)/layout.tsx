import Link from "next/link";
import { installedSite, requireInstallation } from "@/lib/install/state";
import { SiteNavigation } from "@/components/site-navigation";
import { ArchiveMark } from "@/components/archive-brand";
import { CookieDetails } from "@/components/cookie-notice";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const installed = await requireInstallation();
  const site = installed ?? await installedSite();
  return <div className="public-site">
    <header className="masthead"><div className="site-width masthead-inner">
      <Link href="/" className="wordmark" aria-label={site.name + " 首页"}><ArchiveMark /><span>{site.name}</span></Link>
      <SiteNavigation />
    </div></header>
    <main id="main" className="site-width public-main">
      {!installed && <p role="status" className="mb-6 border-l-2 border-amber-700 bg-amber-50 p-4 text-sm text-amber-950">档案服务暂时不可用。关于与联系信息仍可查看。</p>}
      {children}
    </main>
    <footer className="site-footer"><div className="site-width footer-inner">
      <Link className="wordmark" href="/"><ArchiveMark /><span>{site.name}</span></Link>
      <nav aria-label="页脚导航"><Link href="/about#contact">联系站长</Link><CookieDetails /><Link href="/admin">成员工作台 ↗</Link></nav>
    </div></footer>
  </div>;
}
