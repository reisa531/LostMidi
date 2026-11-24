import { requireStaff } from "@/lib/admin/auth";
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireStaff();
  return children;
}
