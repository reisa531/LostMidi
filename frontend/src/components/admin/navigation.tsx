"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/lib/admin/modules";

export function AdminNavigation() {
  const pathname = usePathname();
  return <nav aria-label="后台导航" className="flex flex-wrap gap-1 lg:flex-col">
    {adminNavigation.map(link => {
      const active = link.href === "/admin" ? pathname === link.href : pathname.startsWith(`${link.href}/`) || pathname === link.href;
      return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm ${active ? "bg-white/10 font-medium text-white" : "text-[#bdcec5] hover:bg-white/5 hover:text-white"}`}>
        {link.label}
        {active && <span aria-hidden="true" className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#b9d5a5] lg:block" />}
      </Link>;
    })}
  </nav>;
}
