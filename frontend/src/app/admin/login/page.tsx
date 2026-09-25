import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";

export const metadata = { title: "管理员登录" };
export default function LoginPage() {
  return <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <p className="eyebrow">Lost MIDI Archive / 管理后台</p><h1 className="my-5 text-3xl font-semibold">管理员登录</h1>
    <p className="mb-8 text-sm leading-7 text-muted">登录后维护档案资料。此入口不提供公开注册。</p>
    <LoginForm /><Link className="archive-link mt-8 text-sm" href="/">返回公开站点</Link>
  </main>;
}
