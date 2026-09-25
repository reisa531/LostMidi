import Link from "next/link";
import { ConfigurationGuide } from "@/components/install/configuration-guide";
import { InstallationForm } from "@/components/install/installation-form";
import { deploymentConfig, getInstallationState } from "@/lib/install/state";

export const metadata = { title: "站点安装", robots: { index: false, follow: false } };

export default async function InstallPage() {
  const state = await getInstallationState();
  const config = deploymentConfig();
  const installed = state.kind === "reachable" && state.status.installed;
  const canInstall = state.kind === "reachable" && !state.status.installed && state.status.installation_enabled && config.ready;
  return <main id="main" className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-16 [overflow-wrap:anywhere]">
    <header className="rounded-t-2xl bg-[#203d31] px-6 py-9 text-white sm:px-10 sm:py-12">
      <p className="text-[10px] tracking-[0.25em] text-[#bdcec5]">LOST MIDI ARCHIVE / 初始化向导</p>
      <h1 className="mt-5 font-serif text-3xl leading-snug sm:text-4xl">{installed ? "站点已安装" : "为声音留下来处，从这里开始。"}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-[#d6e0d7]">{installed ? "初始化入口已锁定，已有配置与档案不会被覆盖。" : "连接后端、设置站点、创建管理员。安装只需完成一次，配置将持久保存在你的后端数据库中。"}</p>
    </header>
    <div className="space-y-8 rounded-b-2xl border border-t-0 border-line bg-white px-6 py-8 sm:px-10 sm:py-10">
      {installed ? <section className="space-y-5">
        <h2 className="text-xl font-semibold">{state.kind === "reachable" ? state.status.site.name : "Lost MIDI Archive"}</h2>
        <p className="text-sm leading-8 text-muted">请使用已创建的管理员账号登录。采用环境变量配置管理员的已有站点也会自动锁定安装入口；如无法登录，请由部署维护者检查原有凭据，不要删除安装记录来重装。</p>
        <div className="flex flex-wrap gap-4"><Link href="/admin/login" className="rounded-lg bg-accent px-6 py-3 text-sm text-white">前往管理员登录</Link><Link href="/" className="rounded-lg border border-line px-6 py-3 text-sm">访问站点</Link></div>
        <p className="text-xs leading-6 text-muted">若使用安装向导完成初始化，可以从后端部署环境移除 INSTALLATION_TOKEN 并重启，数据库中的安装锁仍会保留。</p>
      </section> : <>
        <section className="space-y-5" aria-labelledby="connection-heading">
          <h2 id="connection-heading" className="text-lg font-semibold">01 / 部署与连接检查</h2>
          <dl className="divide-y divide-line rounded-lg border border-line px-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">后端地址</dt><dd>{config.backendUrl ? "已配置" : "缺失或格式不正确"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">站点来源与 Cookie</dt><dd>{config.ready ? "配置有效" : "需要检查 ADMIN_ORIGIN / Cookie 配置"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">数据库与安装状态</dt><dd>{state.kind === "reachable" ? "后端可达 · 尚未安装" : "尚无法确认"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">安装密钥保护</dt><dd>{state.kind === "reachable" ? state.status.installation_enabled ? "已启用，提交时需要验证密钥" : "后端尚未启用安装" : "等待后端连接"}</dd></div>
          </dl>
          {state.kind === "unavailable" && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-950">无法确认后端安装状态。请检查网络、BACKEND_API_URL，以及后端是否已执行全部迁移并升级。本页不会把服务故障视为未安装，也不会允许覆盖已有配置。</p>}
          {state.kind === "reachable" && !state.status.installation_enabled && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-950">需要由部署维护者在后端设置 INSTALLATION_TOKEN 并重启，之后才能创建管理员。普通访客无法抢先安装。</p>}
          {!config.ready && <p role="status" className="text-sm leading-7 text-muted">先完成以下部署配置，再继续初始化。HTTPS 站点必须使用 Secure Cookie；前端域名需要与 ADMIN_ORIGIN 精确一致。</p>}
          <details open={!canInstall} className="rounded-lg border border-line p-4 sm:p-5"><summary className="cursor-pointer text-sm font-medium">后端地址与部署变量配置指引</summary><div className="mt-5"><ConfigurationGuide backendUrl={config.backendUrl} origin={config.origin} /></div></details>
        </section>
        {canInstall && <InstallationForm />}
      </>}
    </div>
    <p className="mt-6 text-center text-xs leading-6 text-muted">前端与后端独立部署 · 数据库迁移由部署端执行 · 不自动导入演示资料</p>
  </main>;
}
