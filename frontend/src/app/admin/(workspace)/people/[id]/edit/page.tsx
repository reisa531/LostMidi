import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { adminRequest } from "@/lib/admin/auth";
import type { PersonEdit } from "@/lib/admin/people";
import { ApiError } from "@/lib/api/client";
import { PersonForm } from "@/components/admin/person-form";
import { AdminPageHeader, AdminUnavailable } from "@/components/admin/ui";
import { DeleteConfirmation } from "@/components/admin/delete-confirmation";
export const metadata = { title: "编辑人物" };
export default async function EditPerson({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const session = await adminRequest<{ role: "admin" | "super_admin" }>("/api/v1/admin/session");
  const { id } = await params;
  if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > BigInt("9223372036854775807")) notFound();
  let entry: PersonEdit;
  try { entry = await adminRequest<PersonEdit>(`/api/v1/admin/people/${id}`); } catch (error) {
    if (error instanceof ApiError && error.status === 401) redirect("/admin/login");
    if (error instanceof ApiError && error.status === 404) notFound();
    if (error instanceof ApiError) return <AdminUnavailable />;
    throw error;
  }
  const { saved } = await searchParams;
  return <><AdminPageHeader eyebrow={`人物 / ${id}`} title="编辑人物" description="核对人物身份，维护公开资料和历史昵称。" />
    {saved === "1" && <p role="status" className="mb-6 rounded bg-green-50 p-4 text-sm text-green-900">人物资料已保存。<Link href={`/people/${id}`} className="ml-4 underline">查看公开资料</Link></p>}
    <PersonForm key={`${id}-${entry.person.revision}`} entry={entry} reviewRequired={session.role === "admin"} />
    <DeleteConfirmation key={`delete-${id}-${entry.person.revision}`} resource="people" id={entry.person.id} revision={entry.person.revision} name={entry.person.display_name} reviewRequired={session.role === "admin"} />
  </>;
}
