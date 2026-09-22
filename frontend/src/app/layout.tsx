import type { Metadata } from "next";
import { installedSite } from "@/lib/install/state";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const site = await installedSite();
  return { title: { default: site.name, template: `%s · ${site.name}` }, description: site.description };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className="antialiased">
    <a href="#main" className="sr-only fixed left-4 top-4 z-50 bg-background p-3 focus:not-sr-only">跳至正文</a>
    {children}
  </body></html>;
}
