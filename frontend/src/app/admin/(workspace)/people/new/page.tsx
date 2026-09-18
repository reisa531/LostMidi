import { requireAdmin } from "@/lib/admin/auth";
import { PersonForm } from "@/components/admin/person-form";
import { AdminPageHeader } from "@/components/admin/ui";
export const metadata = { title: "新增人物" };
export default async function NewPerson() {
  await requireAdmin();
  return <><AdminPageHeader eyebrow="People / New" title="新增人物" description="记录创作者、编曲者或历史贡献者。人物档案不创建登录账号。" /><PersonForm /></>;
}
