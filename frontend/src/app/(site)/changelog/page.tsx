import Link from "next/link";
import releases from "@/lib/changelog.json";

export const metadata = {
  title: "更新日志",
  description: "Lost MIDI Archive 的版本更新与功能改进记录。",
  alternates: { canonical: "/changelog" },
};

export default function ChangelogPage() {
  return <article className="mx-auto max-w-3xl">
    <header className="mb-10 border-b border-line pb-8">
      <p className="eyebrow">项目进展</p>
      <h1 className="my-5 font-serif text-4xl">更新日志</h1>
      <p className="leading-8 text-muted">记录档案站的每一步改进。当前版本 <span className="font-medium text-accent">v{releases[0].version}</span>。</p>
    </header>
    <div className="space-y-10">
      {releases.map((release, index) => <section key={release.version} id={`v${release.version}`} aria-labelledby={`title-${release.version}`} className="scroll-mt-8 rounded-xl border border-line p-5 sm:p-8 [overflow-wrap:anywhere]">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href={`#v${release.version}`} className="font-medium text-accent hover:underline" aria-label={`版本 ${release.version} 的永久链接`}>v{release.version}</Link>
          <time dateTime={release.date} className="text-muted">{release.date}</time>
          {index === 0 && <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">当前版本</span>}
        </div>
        <h2 id={`title-${release.version}`} className="mb-5 font-serif text-2xl">{release.title}</h2>
        <ul className="list-disc space-y-3 pl-5 leading-8 text-muted marker:text-accent">
          {release.changes.map((change, i) => <li key={i}>{change}</li>)}
        </ul>
      </section>)}
    </div>
  </article>;
}
