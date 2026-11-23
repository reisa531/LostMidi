import Link from "next/link";
import { RegisterForm } from "@/components/admin/register-form";
import { AccountPage } from "@/components/account-page";
import { registrationCopy as copy } from "@/lib/admin/registration-copy";

export const metadata = { title: copy.registerTitle };
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  const siteKey = process.env.TURNSTILE_SITE_KEY?.trim();
  return <AccountPage title={copy.registerTitle} description={copy.registerIntro}>
    {siteKey ? <RegisterForm siteKey={siteKey} /> : <p role="status" className="rounded border border-line bg-white p-4 text-sm">
      {copy.unconfigured} <Link className="archive-link" href="/about#contact">{copy.contact}</Link>
    </p>}
    <nav className="account-links"><Link href="/admin/login">{copy.returnLogin}</Link></nav>
  </AccountPage>;
}
