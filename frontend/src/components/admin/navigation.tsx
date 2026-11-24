"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavigation } from "@/lib/admin/modules";

export function AdminNavigation({ role }: { role: "owner" | "admin" | "maintainer" }) {
  const pathname = usePathname();
  const staff = role === "admin" || role === "owner";
  const links = [...adminNavigation.filter(link => staff || !["/admin/articles","/admin/useful-links"].includes(link.href)), ...(staff
    ? [{ href: "/admin/changes", label: "内容审核" }, { href: "/admin/front-desk", label: "首页编排" }, { href: "/admin/player", label: "唱片室" }]
    : [{ href: "/admin/submissions", label: "我的申请" }]), ...(role === "owner" ? [{href:"/admin/users",label:"成员名册"}] : [])];
  const items = links.map(link => {
      const active = link.href === "/admin" ? pathname === link.href : pathname.startsWith(`${link.href}/`) || pathname === link.href;
      return <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}
        className={`flex min-h-11 items-center gap-3 rounded-lg px-4 py-3 text-sm ${active ? "bg-white/10 font-medium text-white" : "text-rail-muted hover:bg-white/5 hover:text-white"}`}>
        {link.label}
        {active && <span aria-hidden="true" className="ml-auto hidden h-1.5 w-1.5 rounded-full bg-rail-active lg:block" />}
      </Link>;
    });
  return <><details key={pathname} className="group lg:hidden"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg border border-white/20 px-4 text-sm font-medium marker:hidden">工作台菜单 <span aria-hidden="true">☰</span></summary><nav aria-label="手机后台导航" className="mt-2 flex flex-col gap-1 border-t border-white/10 pt-2">{items}</nav></details>
    <nav aria-label="后台导航" className="hidden gap-1 lg:flex lg:flex-col">{items}</nav></>;
}
