"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/lib/admin/modules";

export function AdminNavigation({ superAdmin = false }: { superAdmin?: boolean }) {
  const pathname = usePathname();
  const links = [...adminNavigation, { href: "/admin/changes", label: "内容审核" }, ...(superAdmin ? [{ href: "/admin/users", label: "用户管理" }] : [])];
  const items = links.map(link => {
      const active = link.href === "/admin" ? pathname === link.href : pathname.startsWith(`${link.href}/`) || pathname === link.href;
      return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm ${active ? "bg-white/10 font-medium text-white" : "text-[#bdcec5] hover:bg-white/5 hover:text-white"}`}>
        {link.label}
        {active && <span aria-hidden="true" className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-[#b9d5a5] lg:block" />}
      </Link>;
    });
  return <><details className="group lg:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-white/20 px-4 text-sm font-medium marker:hidden">工作台菜单 <span aria-hidden="true">☰</span></summary><nav aria-label="手机后台导航" className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">{items}</nav></details>
    <nav aria-label="后台导航" className="hidden gap-1 lg:flex lg:flex-col">{items}</nav></>;
}
