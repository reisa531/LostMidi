import { ApiError } from "@/lib/api/client";
import { getMidiBySlug } from "@/lib/api/midi";

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const headers = { "Cache-Control": "no-store" };
  try {
    const { files } = await getMidiBySlug(slug, { cache: "bypass" });
    return Response.json(files.filter(file => file.download_available).map(file => ({
      id: file.id, filename: file.original_filename,
    })), { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof ApiError ? error.status : 503, headers });
  }
}
