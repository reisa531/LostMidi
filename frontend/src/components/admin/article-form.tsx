"use client";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MarkdownField } from "@/components/admin/markdown-field";
import { saveArticleAction, deleteArticleAction } from "@/lib/admin/article-actions";
import { searchArticleOptions } from "@/lib/admin/article-options";
import type { ArticleDetail } from "@/lib/api/articles";
import { DraftNotice, useFormDraft } from "@/components/admin/use-form-draft";

type Option = { id: string; label: string; archived: boolean };
function AssociationList({ kind, title, selected, setSelected, initial, canChooseArchived }: {
  kind: "midi" | "person"; title: string; selected: string[]; setSelected: (ids: string[]) => void;
  initial: Option[]; canChooseArchived: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [options, setOptions] = useState<Option[]>([]);
  const [known, setKnown] = useState<Option[]>(initial);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      try {
        const result = await searchArticleOptions(kind, query, page);
        if (cancelled) return;
        setOptions(result.options); setTotal(result.total);
        setKnown(previous => [...new Map([...previous, ...result.options].map(option => [option.id, option])).values()]);
      } catch { if (!cancelled) setError("候选档案加载失败，请重试搜索。"); }
      finally { if (!cancelled) setLoading(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [kind, query, page]);
  const changeQuery = (value: string) => { setQuery(value); setPage(1); };
  const selectedOptions = selected.map(id => known.find(option => option.id === id) ?? { id, label: `档案 #${id}`, archived: false });
  const toggle = (id: string, checked: boolean) => {
    if (checked && selected.length >= 50) { setError("每篇文章最多关联 50 项。"); return; }
    setSelected(checked ? [...selected, id] : selected.filter(item => item !== id));
  };
  return <fieldset className="min-w-0 rounded-lg border border-line p-4"><legend className="px-1 text-sm font-medium">{title}{kind === "midi" ? " *" : "（可选）"}</legend>
    <input type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder={`搜索${title}`} aria-label={`搜索${title}`} className="mb-3 w-full rounded border border-line px-3 py-2.5 text-sm" />
    <p className="mb-2 text-xs text-muted">已选 {selected.length} / 50 · 共 {total} 项候选</p>
    {selectedOptions.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{selectedOptions.map(option => <button key={option.id} type="button" onClick={() => toggle(option.id, false)} className="rounded-full border border-line bg-background px-3 py-1 text-xs" aria-label={`移除 ${option.label}`}>{option.label} ×</button>)}</div>}
    {error && <p role="alert" className="mb-2 text-xs text-red-800">{error}</p>}
    <div className="max-h-52 space-y-1 overflow-auto">{loading ? <p className="py-3 text-sm text-muted">正在加载…</p> : options.length ? options.map(option => <label key={option.id} className="flex items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-background">
      <input type="checkbox" checked={selected.includes(option.id)} disabled={option.archived && !canChooseArchived} onChange={event => toggle(option.id, event.target.checked)} className="mt-1" />
      <span className="break-words">{option.label}{option.archived && !canChooseArchived ? " · 已归档，仅超级管理员可关联" : ""}</span>
    </label>) : <p className="py-3 text-sm text-muted">没有匹配的档案。</p>}</div>
    {total > 20 && <div className="mt-3 flex items-center gap-4 text-xs"><button type="button" disabled={page === 1 || loading} onClick={() => setPage(page - 1)} className="archive-link disabled:opacity-50">上一页</button><span>第 {page} / {Math.ceil(total / 20)} 页</span><button type="button" disabled={page * 20 >= total || loading} onClick={() => setPage(page + 1)} className="archive-link disabled:opacity-50">下一页</button></div>}
  </fieldset>;
}
export function ArticleForm({ article, role }: { article?: ArticleDetail; role: "admin" | "super_admin" }) {
  const router = useRouter();
  const draftKey = `article:${article?.id ?? "new"}:${article?.revision ?? 0}`;
  const { attachForm, dirty, hasDraft, saveDraft, clearDraft, discardDraft, restoreDraft } = useFormDraft(draftKey);
  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body_markdown ?? "");
  const [status, setStatus] = useState(article?.status ?? "draft");
  const [midiIds, setMidiIds] = useState(article?.midis.map(item => item.id) ?? []);
  const [personIds, setPersonIds] = useState(article?.people.map(item => item.id) ?? []);
  const setLinks = (kind: "midi" | "person", ids: string[]) => {
    const next = kind === "midi" ? { midiIds: ids, personIds } : { midiIds, personIds: ids };
    if (kind === "midi") setMidiIds(ids); else setPersonIds(ids);
    saveDraft();
    try { sessionStorage.setItem(`lostmidi:draft:${draftKey}:links`, JSON.stringify(next)); } catch { /* Storage may be disabled. */ }
  };
  const restore = () => {
    restoreDraft();
    try {
      const links = JSON.parse(sessionStorage.getItem(`lostmidi:draft:${draftKey}:links`) ?? "null");
      if (Array.isArray(links?.midiIds)) setMidiIds(links.midiIds);
      if (Array.isArray(links?.personIds)) setPersonIds(links.personIds);
    } catch { /* Keep the text draft when associations are invalid. */ }
  };
  const discard = () => { discardDraft(); try { sessionStorage.removeItem(`lostmidi:draft:${draftKey}:links`); } catch { /* Storage may be disabled. */ } };
  const [deleteError, setDeleteError] = useState("");
  const [formError, setFormError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const archived = article?.midis.some(item => item.archive_status === "archived") ?? false;
  const canEdit = role === "super_admin" || !archived;
  const [state, action, pending] = useActionState(async (previous: { error: string; savedId?: string }, form: FormData) => {
    const next = await saveArticleAction(previous, form);
    if (next.savedId) { discard(); clearDraft(); router.push(`/admin/articles/${next.savedId}/edit?saved=1`); router.refresh(); }
    return next;
  }, { error: "" });
  const initialMidis: Option[] = article?.midis.map(item => ({ id: item.id, label: `${item.title} · #${item.id}`, archived: item.archive_status === "archived" })) ?? [];
  const initialPeople: Option[] = article?.people.map(item => ({ id: item.id, label: `${item.display_name} · #${item.id}`, archived: false })) ?? [];
  return <div className="space-y-8">{!canEdit && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">这篇文章关联已归档 MIDI，仅超级管理员可以修改或删除。</p>}
    {canEdit && <form ref={attachForm} action={action} onInputCapture={saveDraft} onChangeCapture={saveDraft} className="space-y-6 rounded-xl border border-line bg-white p-5 sm:p-8" onSubmit={event => { if (!midiIds.length) { event.preventDefault(); setFormError("请至少关联一条 MIDI 档案。"); } else setFormError(""); }}>
      <DraftNotice hasDraft={hasDraft} dirty={dirty} restore={restore} discard={discard} />
      {article && <><input type="hidden" name="id" value={article.id} /><input type="hidden" name="revision" value={article.revision} /></>}
      <input type="hidden" name="midi_ids" value={JSON.stringify(midiIds)} /><input type="hidden" name="person_ids" value={JSON.stringify(personIds)} />
      <fieldset disabled={pending} className="space-y-6 disabled:opacity-70"><legend className="sr-only">文章内容与关联档案</legend>
      <label className="block text-sm">标题 *<input name="title" required maxLength={300} value={title} onChange={event => setTitle(event.target.value)} className="mt-2 block w-full rounded-lg border border-line px-3 py-2.5" /></label>
      <MarkdownField name="body_markdown" label="正文（Markdown）*" value={body} onChange={setBody} required maxLength={100000} rows={10} disabled={pending} />
      <div className="grid gap-5 lg:grid-cols-2"><AssociationList kind="midi" title="关联 MIDI" initial={initialMidis} selected={midiIds} setSelected={ids => setLinks("midi", ids)} canChooseArchived={role === "super_admin"} />
        <AssociationList kind="person" title="关联人物" initial={initialPeople} selected={personIds} setSelected={ids => setLinks("person", ids)} canChooseArchived /></div>
      <label className="block text-sm">发布状态<select name="status" value={status} onChange={event => setStatus(event.target.value as "draft" | "published")} className="mt-2 block w-full rounded-lg border border-line bg-white px-3 py-2.5"><option value="draft">草稿（仅后台可见）</option><option value="published">已发布</option></select></label>
      </fieldset>
      {state.error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
      {formError && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{formError}</p>}
      <div className="flex flex-wrap items-center gap-5 border-t border-line pt-5"><button disabled={pending} className="rounded-lg bg-accent px-6 py-3 text-sm text-white disabled:opacity-50">{pending ? "正在保存…" : article ? "保存文章" : "创建文章"}</button><Link className="archive-link text-sm" href="/admin/articles">返回文章列表</Link></div>
    </form>}
    {article && canEdit && <form action={async form => { setDeleting(true); setDeleteError(""); try { await deleteArticleAction(form); discard(); clearDraft(); router.push("/admin/articles"); router.refresh(); } catch { setDeleteError("删除失败。请确认权限或稍后重试。"); } finally { setDeleting(false); } }} className="rounded-xl border border-red-200 bg-white p-5"><input type="hidden" name="id" value={article.id} />
      <p className="mb-3 text-sm font-medium text-red-800">删除文章</p><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="confirm" value="yes" required />我确认删除这篇文章</label>
      {deleteError && <p role="alert" className="mt-3 text-sm text-red-800">{deleteError}</p>}
      <button disabled={deleting} className="mt-4 rounded border border-red-300 px-4 py-2 text-sm text-red-800 disabled:opacity-50">{deleting ? "正在删除…" : "删除文章"}</button>
    </form>}
  </div>;
}
