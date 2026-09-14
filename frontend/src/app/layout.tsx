import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lost MIDI Archive · 失落的音序", template: "%s · Lost MIDI Archive" },
  description: "记录早期网络 MIDI 的作品、人物、历史来源与寻回过程。",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className="antialiased">
    <a href="#main" className="sr-only fixed left-4 top-4 z-50 bg-background p-3 focus:not-sr-only">跳至正文</a>
    {children}
  </body></html>;
}
