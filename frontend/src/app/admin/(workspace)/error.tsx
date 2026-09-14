"use client";
export default function AdminError({ reset }: { reset: () => void }) {
  return <section role="alert" className="rounded-xl border border-line bg-white p-8"><h1 className="text-xl font-semibold">暂时无法显示此模块</h1><p className="my-4 text-sm text-muted">请重试，或通过导航访问其他模块。</p><button className="rounded-lg bg-accent px-5 py-3 text-sm text-white" onClick={reset}>重新加载</button></section>;
}
