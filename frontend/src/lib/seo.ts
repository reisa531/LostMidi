import { browserOrigin } from "./install/config";

/** Validated absolute browser origin (HTTPS or localhost) used for canonical links, sitemaps and structured data. */
export function siteOrigin(value = process.env.ADMIN_ORIGIN ?? ""): string | null {
  return browserOrigin(value);
}

const JSON_ESCAPES: Record<string, string> = { "<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029" };

/** Serialize structured data for a script tag without letting archive text escape the element. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, character => JSON_ESCAPES[character] ?? character);
}
