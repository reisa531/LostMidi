export function videoSource(value: string) {
  try {
    const input = value.trim();
    const url = new URL(/^(BV[a-zA-Z0-9]{10}|av[1-9]\d{0,16})$/.test(input) ? "https://www.bilibili.com/video/"+input : input);
    if (url.protocol !== "https:" || !["www.bilibili.com","bilibili.com","m.bilibili.com"].includes(url.host)) return null;
    const id = /^\/video\/(BV[a-zA-Z0-9]{10}|av[1-9]\d{0,16})\/?$/.exec(url.pathname)?.[1];
    if (!id) return null;
    const params = new URLSearchParams({ [id.startsWith("BV") ? "bvid" : "aid"]: id.replace(/^av/, ""), autoplay:"0" });
    const part = url.searchParams.get("p");
    if (part && /^[1-9]\d{0,4}$/.test(part)) params.set("p",part);
    return "https://player.bilibili.com/player.html?"+params;
  } catch { return null; }
}
