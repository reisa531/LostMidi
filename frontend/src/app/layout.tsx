import type { Metadata } from "next";
import { installedSite } from "@/lib/install/state";
import { browserOrigin } from "@/lib/install/config";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await installedSite();
  const origin = browserOrigin(process.env.ADMIN_ORIGIN ?? "") ?? undefined;
  return {
    metadataBase: origin ? new URL(origin) : undefined,
    title: { default: site.name, template: `%s · ${site.name}` },
    description: site.description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", siteName: site.name, title: site.name, description: site.description, url: origin ?? undefined, locale: "zh_CN" },
    twitter: { card: "summary", title: site.name, description: site.description },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large" } },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className="antialiased">
    <a href="#main" className="sr-only fixed left-4 top-4 z-50 bg-background p-3 focus:not-sr-only">跳至正文</a>
    {children}
  </body></html>;
}
