import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ midiId: string; evidenceId: string }> }) {
  const { midiId, evidenceId } = await context.params;
  if (![midiId, evidenceId].every(id => /^[1-9]\d{0,18}$/.test(id) && BigInt(id) <= BigInt("9223372036854775807")))
    return NextResponse.json({ error: { code: "INVALID_INPUT" } }, { status: 400, headers: { "Cache-Control": "no-store" } });
  const base = process.env.BACKEND_API_URL;
  if (!base) return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  let upstream: Response;
  try {
    upstream = await fetch(`${base.replace(/\/$/, "")}/api/v1/midis/${midiId}/evidence/${evidenceId}`, {
      cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch {
    return NextResponse.json({ error: { code: "DATABASE_UNAVAILABLE" } }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!upstream.ok) return NextResponse.json({ error: { code: upstream.status === 404 ? "EVIDENCE_NOT_FOUND" : "EVIDENCE_UNAVAILABLE" } }, { status: upstream.status, headers: { "Cache-Control": "no-store" } });
  const mediaType = upstream.headers.get("content-type") ?? "application/octet-stream";
  if (!["application/pdf", "image/jpeg", "image/png", "text/plain"].includes(mediaType))
    return NextResponse.json({ error: { code: "INVALID_FILE" } }, { status: 502, headers: { "Cache-Control": "no-store" } });
  return new Response(upstream.body, { status: 200, headers: {
    "Content-Type": mediaType,
    "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  } });
}
