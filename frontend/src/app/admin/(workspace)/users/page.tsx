import { redirect } from "next/navigation";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { UserManagement } from "@/components/admin/user-management";
import { ApiError } from "@/lib/api/client";
import { adminRequest, requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "用户管理" };

type AdminUser = { id: string; username: string; role: "super_admin" | "admin"; status: "invited" | "active" | "disabled"; created_by: string; created_at: string };
export default async function AdminUsersPage() {
  const session = await requireAdmin();
  if (session.role !== "super_admin") redirect("/admin");
  let users: AdminUser[];
  try { users = await adminRequest<AdminUser[]>("/api/v1/admin/users"); }
  catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    return <><AdminPageHeader eyebrow="权限 / 账号" title="用户管理" description="管理后台账号并邀请新的管理人员。" /><AdminUnavailable /></>;
  }
  return <><AdminPageHeader eyebrow="权限 / 账号" title="用户管理" description="维护超级管理员和管理员账号。访客无需登录，只能查看已公开的档案。" /><UserManagement users={users} currentUserId={session.user_id} /></>;
}
