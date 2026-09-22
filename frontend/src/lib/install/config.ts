// Shared syntax validation only. No environment values or secrets are read here.
export function backendAddress(value: string): string | null {
  try {
    if (!value || value !== value.trim() || /[\s\\\u0000-\u001f\u007f]/.test(value)) return null;
    const url = new URL(value);
    if (!/^https?:\/\//i.test(value) || !["https:", "http:"].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash) return null;
    return url.href.replace(/\/$/, "");
  } catch { return null; }
}

export function browserOrigin(value: string): string | null {
  const address = backendAddress(value);
  if (!address) return null;
  const url = new URL(address);
  if (url.pathname !== "/" || value !== url.origin) return null;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "https:" || local ? url.origin : null;
}
