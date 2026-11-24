import Link from "next/link";
import { LoginForm } from "@/components/admin/login-form";
import { AccountPage } from "@/components/account-page";

export const metadata = { title: "成员登录" };
export default function LoginPage() {
  return <AccountPage title="成员登录" description="登录工作台，维护作品、人物和来源记录。">
    <LoginForm />
    <nav className="account-links"><Link href="/admin/register">注册账号</Link><Link href="/">返回公开站点 ↗</Link></nav>
  </AccountPage>;
}
