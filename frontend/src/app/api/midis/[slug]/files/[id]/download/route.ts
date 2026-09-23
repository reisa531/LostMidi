export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 1_048_576;
const MAX_INT64 = "9223372036854775807";
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function failure(status: number, code: string, message: string) {
  return Response.json({ error: { code, message } }, { status, headers: responseHeaders });
}

function unavailable() {
  return failure(503, "STORAGE_UNAVAILABLE", "下载服务暂时不可用，请稍后重试。");
}

function safeDisposition(value: string | null, id: string) {
  const fallback = `attachment; filename="midi-${id}.mid"`;
  if (!value || value.length > 4096) return fallback;
  const match = /^attachment; filename="midi-([1-9][0-9]{0,18})\.mid"; filename\*=UTF-8''((?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})+)$/i.exec(value);
  if (!match || match[1] !== id) return fallback;
  try {
    const name = decodeURIComponent(match[2]);
    if (name === "." || name === ".." || /[\\/]/.test(name) || Array.from(name).some(character => {
      const code = character.codePointAt(0)!;
      return code < 32 || (code >= 127 && code <= 159);
    })) return fallback;
    const encoded = encodeURIComponent(name).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `${fallback}; filename*=UTF-8''${encoded}`;
  } catch {
    return fallback;
  }
}

// Preallocate only the permitted length; never collect unbounded chunks or call arrayBuffer().
async function readLimited(reader: ReadableStreamDefaultReader<Uint8Array>, limit: number, signal: AbortSignal) {
  const bytes = new Uint8Array(limit);
  let received = 0;
  while (true) {
    signal.throwIfAborted();
    const { done, value } = await reader.read();
    signal.throwIfAborted();
    if (done) return bytes.subarray(0, received);
    if (value.byteLength > limit - received) throw new Error("Invalid download length");
    bytes.set(value, received);
    received += value.byteLength;
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  if (slug.length > 160 || slug.trim() !== slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
    || id.trim() !== id || !/^[1-9][0-9]{0,18}$/.test(id) || (id.length === 19 && id > MAX_INT64)) {
    return failure(400, "INVALID_DOWNLOAD_REQUEST", "下载链接无效，请从档案详情页重新选择文件。");
  }

  const base = process.env.BACKEND_API_URL;
  if (!base) return unavailable();
  let url: URL;
  try {
    url = new URL(base);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return unavailable();
    url.pathname = `${url.pathname.replace(/\/$/, "")}/api/v1/midis/${slug}/files/${id}/download`;
  } catch {
    return unavailable();
  }

  const controller = new AbortController();
  const signal = AbortSignal.any([controller.signal, request.signal]);
  let timedOut = false;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancelReader = () => { void reader?.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancelReader, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);

  try {
    // Only the configured backend and validated path are used; no visitor headers or query are forwarded.
    const upstream = await fetch(url, {
      method: "GET", headers: { Accept: "audio/midi, application/json", "Accept-Encoding": "identity" }, credentials: "omit",
      redirect: "error", cache: "no-store", signal,
    });
    reader = upstream.body?.getReader();
    signal.throwIfAborted();
    if (upstream.status === 403) {
      return failure(403, "DOWNLOAD_NOT_ALLOWED", "尚未确认公开分发许可，或此档案限制分发、仅公开资料，暂不提供下载。");
    }
    if (upstream.status === 404) {
      let code = "FILE_NOT_FOUND";
      try {
        if (reader) {
          const bytes = await readLimited(reader, 4096, signal);
          const body = JSON.parse(new TextDecoder().decode(bytes));
          if (body?.error?.code === "MIDI_NOT_FOUND") code = "MIDI_NOT_FOUND";
        }
      } catch {
        // Unknown, oversized or malformed error bodies never become public messages.
        signal.throwIfAborted();
      }
      return failure(404, code, "档案或文件不存在，可能已被移除，请刷新页面后重试。");
    }
    if (upstream.status !== 200 || !reader) return unavailable();

    const lengthHeader = upstream.headers.get("Content-Length");
    const encoding = upstream.headers.get("Content-Encoding");
    if (!lengthHeader || !/^[1-9][0-9]{0,6}$/.test(lengthHeader)
      || Number(lengthHeader) > MAX_FILE_SIZE
      || upstream.headers.get("Content-Type")?.toLowerCase() !== "audio/midi"
      || (encoding !== null && encoding.toLowerCase() !== "identity")) return unavailable();

    const length = Number(lengthHeader);
    const bytes = await readLimited(reader, length, signal);
    if (bytes.byteLength !== length) return unavailable();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...responseHeaders, "Content-Type": "audio/midi", "Content-Length": String(length),
        "Content-Disposition": safeDisposition(upstream.headers.get("Content-Disposition"), id),
      },
    });
  } catch {
    return timedOut
      ? failure(504, "DOWNLOAD_TIMEOUT", "下载请求超时，请稍后重试。")
      : unavailable();
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancelReader);
    cancelReader();
    controller.abort();
    reader?.releaseLock();
  }
}
