"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { SearchMark } from "./archive-brand";

const catalog = [
  { href: "/midis", label: "MIDI 目录" },
  { href: "/people", label: "人物" },
  { href: "/recovery", label: "寻回进度" },
  { href: "/articles", label: "文章" },
];

const more = [
  { href: "/", label: "首页" },
  { href: "/overview", label: "档案总览" },
  { href: "/map", label: "关系图谱" },
  { href: "/about", label: "关于我们" },
  { href: "/sponsor", label: "赞助" },
  { href: "/changelog", label: "更新日志" },
];

export function SiteNavigation() {
  const pathname = usePathname();
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const searchLink = useRef<HTMLAnchorElement>(null);
  const previousOverflow = useRef<string | null>(null);
  const restoreScrolling = () => {
    if (previousOverflow.current !== null) {
      document.body.style.overflow = previousOverflow.current;
      previousOverflow.current = null;
    }
  };
  useEffect(() => { dialog.current?.close(); }, [pathname]);
  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.key !== "/" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || event.defaultPrevented || dialog.current?.open) return;
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || event.target.closest("input, textarea, select, [aria-modal=true], dialog[open]"))) return;
      event.preventDefault();
      const field = document.querySelector<HTMLInputElement>('input[data-archive-search]');
      if (field) field.focus();
      else searchLink.current?.click();
    }
    document.addEventListener("keydown", shortcut);
    return () => { document.removeEventListener("keydown", shortcut); restoreScrolling(); };
  }, []);
  const current = (href: string) => pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
  const item = (link: { href: string; label: string }) => <Link key={link.href} href={link.href}
    aria-current={current(link.href) ? "page" : undefined} onClick={() => dialog.current?.close()}>{link.label}</Link>;

  return <div className="site-tools">
    <nav className="desktop-links" aria-label="主导航">{catalog.map(item)}</nav>
    <Link ref={searchLink} href="/search" aria-label="搜索档案" aria-keyshortcuts="/" className="nav-search" aria-current={current("/search") ? "page" : undefined}>
      <SearchMark /><span>搜索</span><kbd aria-hidden="true">/</kbd>
    </Link>
    <button ref={trigger} type="button" className="menu-trigger" aria-label="打开导航菜单" aria-haspopup="dialog" aria-controls="site-menu"
      onClick={() => { previousOverflow.current = document.body.style.overflow; document.body.style.overflow = "hidden"; dialog.current?.showModal(); }}>
      <span aria-hidden="true" className="menu-lines" /><span>菜单</span>
    </button>
    <dialog id="site-menu" ref={dialog} aria-labelledby="site-menu-title" className="site-drawer"
      onClose={() => { restoreScrolling(); trigger.current?.focus(); }}
      onClick={event => { if (event.target === dialog.current) dialog.current.close(); }}>
      <div className="drawer-content">
        <header><h2 id="site-menu-title">浏览档案</h2><button type="button" aria-label="关闭导航菜单" onClick={() => dialog.current?.close()}>×</button></header>
        <nav aria-label="全部页面">{catalog.map(item)}{item({ href: "/search", label: "搜索" })}{more.map(item)}{item({ href: "/admin", label: "管理工作台" })}</nav>
      </div>
    </dialog>
  </div>;
}
