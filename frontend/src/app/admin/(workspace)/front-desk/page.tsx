import { FrontDeskEditor } from "@/components/admin/front-desk";
import { requireStaff } from "@/lib/admin/auth";
import { apiGet } from "@/lib/api/client";
import type { FrontDesk } from "@/lib/front-desk";
export const metadata = { title: "首页编排" };
export default async function DeskPage() {
  const session = await requireStaff();
  const desk = await apiGet<FrontDesk>("/api/v1/front-desk");
  return <><h1 className="desk-title">首页编排</h1><FrontDeskEditor desk={desk} owner={session.role === "owner"} /></>;
}
