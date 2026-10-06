import { browserOrigin } from "./install/config";

/** Validated absolute browser origin (HTTPS or localhost) used for canonical links, sitemaps and structured data. */
export function siteOrigin(value = process.env.ADMIN_ORIGIN ?? ""): string | null {
  return browserOrigin(value);
}

/** Absolute URL for a site-relative path; null while no valid public origin is configured. */
export function absoluteUrl(path: string, origin = process.env.ADMIN_ORIGIN ?? ""): string | null {
  const base = siteOrigin(origin);
  if (!base) return null;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * 站点级卡片图（app/opengraph-image.tsx）。
 *
 * Next 的文件式元数据会被同段或子段的 config 元数据整体替换：页面只要自己写了
 * openGraph，就会丢掉父级继承来的图片声明，所以这些页面必须显式带上这里的引用。
 */
export function siteOgImage(alt: string) {
  return [{ url: "/opengraph-image", width: 1200, height: 630, alt }];
}

const JSON_ESCAPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };

/** Serialize structured data for a script tag without letting archive text escape the element. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, character => JSON_ESCAPES[character] ?? character);
}
