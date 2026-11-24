import { CookieDetails } from "@/components/cookie-notice";
import Link from "next/link";
import { ArchiveMark } from "./archive-brand";

export function AccountPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main id="main" className="account-page">
    <div className="account-sheet">
      <Link href="/" className="wordmark"><ArchiveMark /><span>Lost MIDI Archive</span></Link>
      <h1>{title}</h1><p className="account-description">{description}</p>
      {children}
      <footer className="mt-5 text-sm"><CookieDetails /></footer>
    </div>
  </main>;
}
