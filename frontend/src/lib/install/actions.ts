"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api/client";
import { deploymentConfig } from "./state";

export interface InstallationActionState { error: string; attempt: number }

function field(form: FormData, name: string) {
  const value = form.get(name);
  if (typeof value !== "string" || value.includes("\0")) throw new ApiError(400, "INVALID_INPUT");
  return value;
}
function byteLength(value: string) { return new TextEncoder().encode(value).length; }

export async function installAction(previous: InstallationActionState, form: FormData): Promise<InstallationActionState> {
  try {
    const config = deploymentConfig();
    if (!config.ready) throw new ApiError(503, "CONFIGURATION_REQUIRED");
    if ((await headers()).get("origin") !== process.env.ADMIN_ORIGIN) throw new ApiError(403, "INVALID_ORIGIN");
    const token = field(form, "installation_token");
    const name = field(form, "site_name").trim();
    const description = field(form, "site_description").trim();
    const username = field(form, "username");
    const password = field(form, "password");
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new ApiError(400, "TOKEN_FORMAT");
    if (!name || byteLength(name) > 200 || byteLength(description) > 1000 || !/^[A-Za-z0-9_.-]{3,64}$/.test(username)
      || byteLength(password) < 12 || byteLength(password) > 1024) throw new ApiError(400, "INVALID_INPUT");
    if (password !== field(form, "confirm_password")) throw new ApiError(400, "PASSWORD_MISMATCH");
    // Only the deployment-configured backend is contacted. Never fetch a form URL.
    await apiRequest("/api/v1/installation", {
      method: "POST", headers: { "Content-Type": "application/json", "X-Installation-Token": token },
      body: JSON.stringify({ site_name: name, site_description: description, username, password }),
    });
  } catch (error) {
    const messages: Record<string, string> = {
      CONFIGURATION_REQUIRED: "请先完成部署变量配置并重新部署或重启前端，再进行初始化。",
      INVALID_ORIGIN: "当前访问地址与 ADMIN_ORIGIN 不一致。请从配置的站点域名打开安装页。",
      TOKEN_FORMAT: "安装密钥须为 32–128 位字母、数字、下划线或连字符。",
      INVALID_INSTALLATION_TOKEN: "安装密钥不正确，请使用后端部署时设置的 INSTALLATION_TOKEN。",
      INSTALLATION_DISABLED: "后端未启用安装，请配置 INSTALLATION_TOKEN 并重启后端。",
      ALREADY_INSTALLED: "站点已经安装，未覆盖任何设置。请刷新本页并前往管理员登录。",
      INSTALLATION_RATE_LIMITED: "安装尝试过多，请等待一分钟再重试。",
      INVALID_INPUT: "请检查站点名称、简介、用户名和密码的格式及 UTF-8 字节长度。",
      PASSWORD_MISMATCH: "两次输入的密码不一致。",
    };
    return {
      attempt: previous.attempt + 1,
      error: (error instanceof ApiError && messages[error.code]) || "连接中断或服务异常，暂时无法确认安装结果。请先刷新本页确认状态；不要清空数据库或重新配置已有账号。",
    };
  }
  redirect("/install?complete=1");
}
