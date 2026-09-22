import Link from "next/link";

export function InstallationUnavailable() {
  return <main id="main" className="mx-auto max-w-2xl px-6 py-24">
    <p className="eyebrow">Lost MIDI Archive / Connection</p>
    <h1 className="my-6 font-serif text-3xl">暂时无法连接站点服务</h1>
    <p className="text-sm leading-8 text-muted">无法确认安装状态。可能是后端离线、地址配置有误，或后端尚未升级到支持安装向导的版本。这不代表站点未安装，也不会开放重新初始化。</p>
    <div className="mt-8 flex flex-wrap gap-6 text-sm"><a href="" className="archive-link">重新加载</a><Link href="/install" className="archive-link">查看连接与部署指引</Link></div>
  </main>;
}
