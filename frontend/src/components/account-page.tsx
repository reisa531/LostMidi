import Link from "next/link";
import { DiskMark } from "./archive-brand";

export function AccountPage({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <main id="main" className="account-page">
    <div className="account-sheet">
      <Link href="/" className="wordmark"><DiskMark /><span>Lost MIDI Archive</span></Link>
      <h1>{title}</h1><p className="account-description">{description}</p>
      {children}
    </div>
  </main>;
}
