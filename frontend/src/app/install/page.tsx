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
    <header className="install-heading bg-foreground px-6 py-9 text-white sm:px-10 sm:py-12">
      <p className="text-[10px] tracking-[0.25em] text-rail-muted">LOST MIDI ARCHIVE / 初始化向导</p>
      <h1 className="mt-5 font-serif text-3xl leading-snug sm:text-4xl">{installed ? "站点已安装" : "初始化档案馆"}</h1>
      <p className="mt-4 max-w-2xl text-sm leading-8 text-rail-muted">{installed ? "初始化入口已锁定，已有配置与档案不会被覆盖。" : "连接后端、设置站点并创建站长。安装仅需一次，配置保存在后端数据库中。"}</p>
    </header>
    <div className="space-y-8 rounded-b-2xl border border-t-0 border-line bg-white px-6 py-8 sm:px-10 sm:py-10">
      {installed ? <section className="space-y-5">
        <h2 className="text-xl font-semibold">{state.kind === "reachable" ? state.status.site.name : "Lost MIDI Archive"}</h2>
        <p className="text-sm leading-8 text-muted">请使用已创建的站长账号登录。通过环境变量配置站长的站点也会自动锁定安装入口；如无法登录，请由部署维护者核查原有凭据，切勿删除安装记录重装。</p>
        <div className="flex flex-wrap gap-4"><Link href="/admin/login" className="rounded-lg bg-accent px-6 py-3 text-sm text-white">前往成员登录</Link><Link href="/" className="rounded-lg border border-line px-6 py-3 text-sm">访问站点</Link></div>
        <p className="text-xs leading-6 text-muted">通过向导完成初始化后，可从后端环境移除 INSTALLATION_TOKEN 并重启，数据库中的安装锁仍会保留。</p>
      </section> : <>
        <section className="space-y-5" aria-labelledby="connection-heading">
          <h2 id="connection-heading" className="text-lg font-semibold">部署与连接检查</h2>
          <dl className="divide-y divide-line rounded-lg border border-line px-4 text-sm">
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">后端地址</dt><dd>{config.backendUrl ? "已配置" : "缺失或格式不正确"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">站点来源与 Cookie</dt><dd>{config.ready ? "配置有效" : "请检查 ADMIN_ORIGIN / Cookie 配置"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">数据库与安装状态</dt><dd>{state.kind === "reachable" ? "后端可达 · 尚未安装" : "尚无法确认"}</dd></div>
            <div className="flex flex-wrap justify-between gap-2 py-3"><dt className="text-muted">安装密钥保护</dt><dd>{state.kind === "reachable" ? state.status.installation_enabled ? "已启用，提交时需验证密钥" : "后端尚未启用安装" : "等待后端连接"}</dd></div>
          </dl>
          {state.kind === "unavailable" && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-950">无法确认后端安装状态。请检查网络、BACKEND_API_URL，确认后端已完成全部迁移并升级。本页不会将服务故障视为未安装，也不会覆盖已有配置。</p>}
          {state.kind === "reachable" && !state.status.installation_enabled && <p role="alert" className="rounded-lg bg-amber-50 p-4 text-sm leading-7 text-amber-950">需由部署维护者在后端设置 INSTALLATION_TOKEN 并重启，方可创建站长；普通访客无法抢先安装。</p>}
          {!config.ready && <p role="status" className="text-sm leading-7 text-muted">请先完成以下部署配置，再继续初始化。HTTPS 站点须启用 Secure Cookie；前端域名须与 ADMIN_ORIGIN 完全一致。</p>}
          <details open={!canInstall} className="rounded-lg border border-line p-4 sm:p-5"><summary className="cursor-pointer text-sm font-medium">后端地址与部署变量配置指引</summary><div className="mt-5"><ConfigurationGuide backendUrl={config.backendUrl} origin={config.origin} /></div></details>
        </section>
        {canInstall && <InstallationForm />}
      </>}
    </div>
    <p className="mt-6 text-center text-xs leading-6 text-muted">前后端独立部署 · 数据库迁移由部署端执行 · 不自动导入演示资料</p>
  </main>;
}
