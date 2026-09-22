"use client";

import { useState } from "react";
import { backendAddress, browserOrigin } from "@/lib/install/config";

const inputClass = "mt-2 block w-full min-w-0 rounded-lg border border-line bg-white px-3 py-3 text-sm";
export function ConfigurationGuide({ backendUrl, origin }: { backendUrl: string | null; origin: string | null }) {
  const [backend, setBackend] = useState(backendUrl ?? "");
  const [siteOrigin, setSiteOrigin] = useState(origin ?? "");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const base = backendAddress(backend);
  const browser = browserOrigin(siteOrigin);
  const variables = base && browser ? `BACKEND_API_URL=${base}\nADMIN_ORIGIN=${browser}\nADMIN_COOKIE_SECURE=${browser.startsWith("https:") ? "true" : "false"}` : "";
  return <div className="space-y-5">
    <p className="text-sm leading-7 text-muted">先部署 C++ 后端和 PostgreSQL，执行全部数据库迁移。下面仅生成前端配置，不会向填写的地址发送请求，也不会直接修改你的 Vercel 项目。</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <label className="min-w-0 text-sm">后端 API 地址<input type="url" className={inputClass} value={backend} onChange={event => { setBackend(event.target.value); setCopied(false); }} placeholder="https://api.example.com" autoComplete="off" /><span className="mt-2 block text-xs leading-6 text-muted">Vercel 需使用可访问的 HTTPS 地址，不加 /api/v1，不含账号密码。</span></label>
      <label className="min-w-0 text-sm">站点访问地址<input type="url" className={inputClass} value={siteOrigin} onChange={event => { setSiteOrigin(event.target.value); setCopied(false); }} placeholder="https://archive.example.com" autoComplete="off" /><span className="mt-2 block text-xs leading-6 text-muted">精确填写浏览器域名，不含路径或末尾斜杠；本机 localhost 可用 HTTP。</span></label>
    </div>
    <button type="button" className="text-sm underline" onClick={() => { setSiteOrigin(window.location.origin); setCopied(false); }}>使用当前页面的站点地址</button>
    {variables ? <div className="space-y-3">
      <label className="block text-sm">待保存的前端部署变量<textarea aria-label="前端部署变量" readOnly rows={4} value={variables} className="mt-2 w-full rounded-lg border border-line bg-background p-4 font-mono text-xs leading-6" /></label>
      <button type="button" className="text-sm underline" onClick={async () => { try { await navigator.clipboard.writeText(variables); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }}>{copied ? "已复制配置" : "复制部署变量"}</button>
      {copyError && <p role="status" className="text-sm text-muted">浏览器未允许复制，请手动选择上方配置文本。</p>}
    </div> : <p className="rounded-lg bg-background p-4 text-sm leading-7 text-muted">填写有效的后端地址和站点访问地址后，将在此生成配置。</p>}
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-muted">
      <li>Vercel：在项目 Settings → Environment Variables 中保存以上变量，再重新部署。Preview 应连接独立测试后端，勿使用生产安装密钥。</li>
      <li>本机或 Docker：保存前端环境变量后重启原生进程；Compose 使用 up 重建前端容器，仅 restart 不会更新环境。不要把真实环境文件提交到 Git。</li>
      <li>后端单独设置随机的 INSTALLATION_TOKEN 并重启；此密钥用于证明你有部署权限，切勿放入 NEXT_PUBLIC_ 变量、URL 或前端公开配置。</li>
    </ol>
    <p className="text-xs leading-6 text-muted">可在自己的终端生成密钥：<code className="break-all">python -c &quot;import secrets; print(secrets.token_urlsafe(32))&quot;</code>。已有管理员的部署不需要重新设置安装密钥。</p>
    <a href="/install" className="inline-block rounded-lg border border-accent px-5 py-3 text-sm text-accent">已完成配置，重新检查</a>
  </div>;
}
