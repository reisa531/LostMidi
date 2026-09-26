import { ArticleForm } from "@/components/admin/article-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin/auth";

export const metadata = { title: "新建文章" };
export default async function NewArticlePage() {
  const admin = await requireAdmin();
  return <><AdminPageHeader eyebrow="文章 / 新建" title="新建文章" description="写作时至少关联一条 MIDI 档案；人物关联可以留空。" />
    <ArticleForm role={admin.role} />
  </>;
}
