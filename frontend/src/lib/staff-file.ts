export type StaffFile = { name: string; digest: string; size: number; media_key: string };

export async function fetchStaffFile(file: StaffFile, signal: AbortSignal) {
  const chunks: ArrayBuffer[] = [];
  const url = "/admin/player/media/" + file.media_key;
  for (let offset = 0; offset < file.size;) {
    const end = Math.min(file.size, offset + 1024 * 1024) - 1;
    const response = await fetch(url, {
      headers: { Range: `bytes=${offset}-${end}` }, signal, cache: "no-store", redirect: "error",
    });
    if (response.status !== 206 || response.headers.get("Content-Range") !== `bytes ${offset}-${end}/${file.size}`) {
      await response.body?.cancel();
      throw new Error("File range unavailable");
    }
    const chunk = await response.arrayBuffer();
    if (chunk.byteLength !== end - offset + 1) throw new Error("Incomplete file range");
    chunks.push(chunk);
    offset = end + 1;
  }
  const blob = new Blob(chunks, { type: "application/octet-stream" });
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
  if (Array.from(hash, n => n.toString(16).padStart(2, "0")).join("") !== file.digest.toLowerCase()) {
    throw new Error("File digest mismatch");
  }
  return blob;
}
