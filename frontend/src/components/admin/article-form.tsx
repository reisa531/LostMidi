"use client";
import Link from "next/link";
import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownField } from "@/components/admin/markdown-field";
import { saveArticleAction, deleteArticleAction } from "@/lib/admin/article-actions";
import type { ArticleDetail } from "@/lib/api/articles";
import type { ArticleOption } from "@/lib/admin/article-options";

function AssociationList({ title, options, selected, setSelected, required }: {
  title: string; options: ArticleOption[]; selected: string[]; setSelected: (ids: string[]) => void; required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const visible = options.filter(item => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <fieldset className="rounded-lg border border-line p-4"><legend className="px-1 text-sm font-medium">{title}{required ? " *" : "（可选）"}</legend>
    <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={`筛选${title}`} aria-label={`筛选${title}`} className="mb-3 w-full rounded border border-line px-3 py-2 text-sm" />
    <p className="mb-2 text-xs text-muted">已选 {selected.length} 项</p>
    <div className="max-h-52 space-y-1 overflow-auto">{visible.length ? visible.map(item => <label key={item.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-background">
      <input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} className="mt-1" />
      <span className="break-words">{item.label}</span>
    </label>) : <p className="py-3 text-sm text-muted">没有匹配的档案。</p>}</div>
  </fieldset>;
}
export function ArticleForm({ article, midis, people }: { article?: ArticleDetail; midis: ArticleOption[]; people: ArticleOption[] }) {
  const router = useRouter();
  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body_markdown ?? "");
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [midiIds, setMidiIds] = useState(article?.midis.map(item => item.id) ?? []);
  const [personIds, setPersonIds] = useState(article?.people.map(item => item.id) ?? []);
  const [deleteError, setDeleteError] = useState("");
  const [state, action, pending] = useActionState(async (previous: { error: string; savedId?: string }, form: FormData) => {
    const next = await saveArticleAction(previous, form);
    if (next.savedId) { router.push(`/admin/articles/${next.savedId}/edit?saved=1`); router.refresh(); }
    return next;
  }, { error: "" });
  const availableMidis = [...midis, ...(article?.midis ?? []).filter(item => !midis.some(option => option.id === item.id)).map(item => ({ id: item.id, label: `${item.title} · #${item.id}` }))];
  const availablePeople = [...people, ...(article?.people ?? []).filter(item => !people.some(option => option.id === item.id)).map(item => ({ id: item.id, label: `${item.display_name} · #${item.id}` }))];
  return <div className="space-y-8"><form action={action} className="space-y-6 rounded-xl border border-line bg-white p-5 sm:p-8">
    {article && <><input type="hidden" name="id" value={article.id} /><input type="hidden" name="revision" value={article.revision} /></>}
    <input type="hidden" name="midi_ids" value={JSON.stringify(midiIds)} /><input type="hidden" name="person_ids" value={JSON.stringify(personIds)} />
    <label className="block text-sm">标题 *<input name="title" required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 block w-full rounded-lg border border-line px-3 py-2.5" /></label>
    <MarkdownField name="body_markdown" label="正文（Markdown）*" value={body} onChange={setBody} required maxLength={100000} rows={10} />
    <div className="grid gap-5 lg:grid-cols-2"><AssociationList title="关联 MIDI" options={availableMidis} selected={midiIds} setSelected={setMidiIds} required />
      <AssociationList title="关联人物" options={availablePeople} selected={personIds} setSelected={setPersonIds} /></div>
    <label className="block text-sm">发布状态<select name="status" value={status} onChange={event => setStatus(event.target.value as "draft" | "published")} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5"><option value="draft">草稿（仅后台可见）</option><option value="published">已发布</option></select></label>
    {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <div className="flex flex-wrap items-center gap-5 border-t border-line pt-5"><button disabled={pending} className="rounded-lg bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : article ? "保存文章" : "创建文章"}</button><Link className="archive-link text-sm" href="/admin/articles">返回文章列表</Link></div>
  </form>
    {article && <form action={async form => { try { await deleteArticleAction(form); router.push("/admin/articles"); router.refresh(); } catch { setDeleteError("删除失败。关联已归档 MIDI 的文章仅限超级管理员修改，请确认权限后重试。"); } }} className="rounded-xl border border-red-200 bg-white p-5"><input type="hidden" name="id" value={article.id} />
      <p className="mb-3 text-sm font-medium text-red-800">删除文章</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required />我确认删除这篇文章</label>
      {deleteError && <p role="alert" className="mt-3 text-sm text-red-800">{deleteError}</p>}
      <button className="mt-4 rounded border border-red-300 px-4 py-2 text-sm text-red-800">删除文章</button>
    </form>}
  </div>;
}
