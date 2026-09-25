"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const links = [
  { href: "/", label: "首页总览" },
  { href: "/midis", label: "MIDI" },
  { href: "/search", label: "搜索" },
  { href: "/people", label: "作者" },
  { href: "/articles", label: "文章" },
  { href: "/recovery", label: "寻回进度" },
  { href: "/map", label: "关系图谱" },
  { href: "/about", label: "关于我们" },
];
export function SiteNavigation() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  const active = (href: string) => href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  const linkClass = (href: string) => `rounded-lg px-3 py-3 text-sm transition ${active(href) ? "bg-accent font-medium text-white" : "text-muted hover:bg-[#e9ede2] hover:text-accent"}`;
  return <>
    <nav aria-label="主导航" className="hidden flex-wrap gap-1 lg:flex">
      {links.map(link => <Link key={link.href} href={link.href} aria-current={active(link.href) ? "page" : undefined} className={linkClass(link.href)}>{link.label}</Link>)}
    </nav>
    <button ref={trigger} type="button" onClick={() => dialog.current?.showModal()} aria-haspopup="dialog" aria-controls="mobile-site-navigation" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-medium text-accent lg:hidden">
      <span aria-hidden="true" className="text-xl leading-none">☰</span>菜单
    </button>
    <dialog ref={dialog} id="mobile-site-navigation" aria-label="网站导航" onClose={() => trigger.current?.focus()} onClick={event => { if (event.target === dialog.current) dialog.current.close(); }} className="fixed inset-0 ml-auto mr-0 h-dvh max-h-none w-[min(22rem,88vw)] max-w-none overflow-y-auto border-l border-line bg-background p-0 text-foreground shadow-2xl backdrop:bg-black/45 lg:hidden">
      <div className="flex min-h-full flex-col p-5"><div className="mb-5 flex items-center justify-between gap-3 border-b border-line pb-4"><p className="font-serif text-xl">浏览档案</p><button type="button" onClick={() => dialog.current?.close()} aria-label="关闭导航菜单" className="min-h-11 min-w-11 rounded-lg border border-line bg-white text-2xl">×</button></div>
        <nav aria-label="手机主导航" className="flex flex-col gap-1">{links.map(link => <Link key={link.href} href={link.href} onClick={() => dialog.current?.close()} aria-current={active(link.href) ? "page" : undefined} className={linkClass(link.href)}>{link.label}</Link>)}</nav>
      </div>
    </dialog>
  </>;
}
