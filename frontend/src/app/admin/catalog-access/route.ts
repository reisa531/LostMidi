import { adminRequest } from "@/lib/admin/auth";
import { ApiError } from "@/lib/api/client";
import type { Song } from "@/lib/listening-room";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    // Imported audio can exist in the listening library without a midi_files row.
    const library = await adminRequest<Song[]>("/api/v1/admin/player");
    return Response.json(library.filter(song => song.versions.length).map(song => song.id), { headers });
  } catch (error) {
    return new Response(null, { status: error instanceof ApiError ? error.status : 503, headers });
  }
}
