import Link from "next/link";
import { RegisterForm } from "@/components/admin/register-form";

export const metadata = { title: "注册管理员账号" };
export default function RegisterPage() {
  return <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
    <p className="eyebrow">Lost MIDI Archive / 管理后台</p>
    <h1 className="my-5 text-3xl font-semibold">注册管理员账号</h1>
    <p className="mb-8 text-sm leading-7 text-muted">注册后账号默认停用，超级管理员启用后才能登录。</p>
    <RegisterForm />
    <Link className="archive-link mt-8 text-sm" href="/admin/login">返回登录</Link>
  </main>;
}
