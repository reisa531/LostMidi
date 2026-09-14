import Link from "next/link";
export default function NotFound() {
  return <section><p className="eyebrow">404 / Record not found</p><h1 className="my-6 font-serif text-3xl">尚未找到这份档案</h1>
    <p className="mb-6 text-muted">地址可能有误，或这条记录尚未收入档案。</p><Link className="archive-link" href="/midis">浏览全部档案</Link></section>;
}
