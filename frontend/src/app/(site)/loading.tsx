export default function SiteLoading() {
  return <div role="status" aria-live="polite" className="mx-auto max-w-3xl animate-pulse py-8">
    <div className="h-4 w-28 rounded bg-line" /><div className="mt-5 h-10 w-2/3 rounded bg-line" />
    <div className="mt-7 h-4 w-full rounded bg-line" /><div className="mt-3 h-4 w-4/5 rounded bg-line" />
    <p className="sr-only">正在加载档案…</p>
  </div>;
}
