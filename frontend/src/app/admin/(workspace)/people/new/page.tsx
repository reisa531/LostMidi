import { requireAdmin } from "@/lib/admin/auth";
import { PersonForm } from "@/components/admin/person-form";
import { AdminPageHeader } from "@/components/admin/ui";
import { getUsefulLinks } from "@/lib/api/useful-links";
export const metadata = { title: "新增人物" };
export default async function NewPerson() {
  const admin = await requireAdmin();
  const usefulLinks = await getUsefulLinks({ cache: "bypass" }).catch(() => []);
  return <><AdminPageHeader eyebrow="人物 / 新建" title="新增人物" description="记录作曲者、编曲者或音序制作者。人物资料与后台用户账号分开管理。" /><PersonForm reviewRequired={admin.role === "admin"} usefulLinks={usefulLinks} /></>;
}
