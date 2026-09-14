import Link from "next/link";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
        <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 sm:px-10">
          <header className="flex flex-wrap items-center justify-between gap-6 border-b border-line py-7">
            <Link href="/" className="flex items-center gap-3" aria-label="Lost MIDI Archive 首页">
              <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center border border-accent font-serif text-xl text-accent">♮</span>
              <span><span className="block font-serif text-xl tracking-tight">Lost MIDI Archive</span><span className="mt-1 block text-[10px] tracking-[0.2em] text-muted">数字档案 · 网络考古</span></span>
            </Link>
            <nav aria-label="主导航" className="flex gap-6 text-sm sm:gap-8">
              <Link href="/midis" className="hover:text-accent hover:underline">MIDI 档案</Link>
              <Link href="/about" className="hover:text-accent hover:underline">关于项目</Link>
            </nav>
          </header>
          <main id="main" className="flex-1 py-12 sm:py-16">{children}</main>
          <footer className="flex flex-col justify-between gap-3 border-t border-line py-7 text-xs leading-6 text-muted sm:flex-row">
            <p>Lost MIDI Archive <span aria-hidden="true" className="px-2">/</span> 为声音留下来处。</p>
            <p>当前为虚构示例档案 · 仅展示元数据</p>
          </footer>
        </div>
  );
}
