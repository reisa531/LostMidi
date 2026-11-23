import Link from "next/link";
import { RegisterForm } from "@/components/admin/register-form";
import { AccountPage } from "@/components/account-page";

export const metadata = { title: "注册管理员账号" };
export default function RegisterPage() {
  return <AccountPage title="注册管理员账号" description="注册后，请等待超级管理员启用账号再登录。">
    <RegisterForm /><nav className="account-links"><Link href="/admin/login">返回登录</Link></nav>
  </AccountPage>;
}
