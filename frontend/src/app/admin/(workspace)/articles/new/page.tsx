import { articleOptions } from "@/lib/admin/article-options";
import { ArticleForm } from "@/components/admin/article-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { ApiError } from "@/lib/api/client";

export const metadata = { title: "新建文章" };
export default async function NewArticlePage() {
  let options;
  try { options = await articleOptions(); }
  catch (error) { if (error instanceof ApiError) return <AdminUnavailable />; throw error; }
  return <><AdminPageHeader eyebrow="文章 / 新建" title="新建文章" description="写作时至少关联一条 MIDI 档案；人物关联可以留空。" />
    <ArticleForm midis={options.midis} people={options.people} />
  </>;
}
