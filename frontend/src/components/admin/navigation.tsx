"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/lib/admin/modules";

export function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="后台导航" className="flex gap-1 overflow-x-auto lg:flex-col">
    {adminNavigation.map((link, index) => {
      const active = link.href === "/admin" ? pathname === link.href : pathname.startsWith(`${link.href}/`) || pathname === link.href;
      return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
        className={`flex shrink-0 items-center gap-3 rounded-lg px-4 py-3 text-sm ${active ? "bg-white/10 text-white" : "text-[#bdcec5] hover:bg-white/5 hover:text-white"}`}>
        <span aria-hidden="true" className="font-mono text-[10px] opacity-60">{String(index + 1).padStart(2, "0")}</span>{link.label}
        {active && <span aria-hidden="true" className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#b9d5a5] lg:block" />}
      </Link>;
    })}
  </nav>;
}
