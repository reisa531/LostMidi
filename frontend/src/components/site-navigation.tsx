"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "首页总览" },
  { href: "/midis", label: "MIDI" },
  { href: "/people", label: "作者" },
  { href: "/recovery", label: "寻回进度" },
  { href: "/map", label: "Map" },
];
export function SiteNavigation() {
  const pathname = usePathname();
  return <nav aria-label="主导航" className="flex w-full flex-wrap gap-1 sm:w-auto sm:gap-2">
    {links.map(link => {
      const active = link.href === "/" ? pathname === "/" : pathname === link.href || pathname.startsWith(`${link.href}/`);
      return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined} className={`rounded-lg px-3 py-2.5 text-sm transition ${active ? "bg-accent font-medium text-white" : "text-muted hover:bg-[#e9ede2] hover:text-accent"}`}>{link.label}</Link>;
    })}
  </nav>;
}
