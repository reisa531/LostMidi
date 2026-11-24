import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { StaffFile } from "@/lib/staff-file";

export async function GET(_request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  const validRecord = (kind === "midis" && /^[1-9]\d{0,17}$/.test(id)) ||
    (kind === "articles" && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id));
  if (!validRecord) {
    return new Response(null, { status: 404, headers });
  }
  try {
    if (kind === "midis") {
      const files = await adminRequest<StaffFile[]>(`/api/v1/admin/midis/${id}/download-sources`);
      return Response.json({ files }, { headers });
    }
    const session = await adminRequest<{ role: string }>("/api/v1/admin/session");
    if (session.role !== "owner" && session.role !== "admin") return new Response(null, { status: 403, headers });
    return Response.json({ files: [] }, { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof ApiError ? error.status : 503, headers });
  }
}
