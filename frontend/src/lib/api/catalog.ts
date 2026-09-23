import "server-only";
import { apiGet } from "./client";
import type { ArchiveStatus, CatalogEntries, CatalogGroups, CatalogOverview, CatalogPeople } from "./types";

export type SearchParams = Record<string, string | string[] | undefined>;
export type CatalogPath = "/midis" | "/people" | "/recovery" | "/map";
export type UrlQuery = Record<string, string | number | undefined>;
export type GroupBy = "author" | "source";
export type CatalogQuery = {
  page: number; pageSize: number; status?: ArchiveStatus; sort: "updated" | "title";
  person?: string; source?: string; missing?: GroupBy;
};
export type MapQuery = {
  by: GroupBy; group?: string; missing?: GroupBy; groupPage: number;
  page: number; pageSize: number; status?: ArchiveStatus; sort: "updated" | "title";
};
export const archiveStates: { value: ArchiveStatus; label: string; description: string }[] = [
  { value: "archived", label: "已归档", description: "已标记为完成归档" },
  { value: "partially_recovered", label: "部分寻回", description: "已找回部分资料，仍待补全" },
  { value: "lost", label: "待寻回", description: "已有线索，作品仍待寻回" },
  { value: "uncertain", label: "尚待确认", description: "现有资料还不足以判断" },
];
export class CatalogQueryError extends Error {
  constructor() { super("筛选参数无效，请检查页码或重新选择筛选条件。"); }
}

function checkKeys(raw: SearchParams, allowed: string[]) {
  for (const [key, value] of Object.entries(raw)) {
    if (!allowed.includes(key) || (value !== undefined && typeof value !== "string")) throw new CatalogQueryError();
  }
}
function single(raw: SearchParams, key: string) {
  const value = raw[key];
  if (Array.isArray(value)) throw new CatalogQueryError();
  return value;
}
function integer(value: string | undefined, fallback: number, max = 1000000) {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw new CatalogQueryError();
  return Number(value);
}
function personId(value: string) {
  // The API and the existing person-detail route both use positive signed int64 IDs.
  if (!/^[1-9]\d{0,18}$/.test(value) || BigInt(value) > BigInt("9223372036854775807")) throw new CatalogQueryError();
  return value;
}
function sourceName(value: string) {
  if (!value.trim() || new TextEncoder().encode(value).length > 500) throw new CatalogQueryError();
  return value; // Website names are literal group keys, never URLs or trimmed aliases.
}
function groupBy(value: string | undefined): GroupBy | undefined {
  if (value !== undefined && value !== "author" && value !== "source") throw new CatalogQueryError();
  return value;
}
function listFields(raw: SearchParams) {
  const status = single(raw, "status");
  const sort = single(raw, "sort") ?? "updated";
  if (status !== undefined && status !== "" && !archiveStates.some(item => item.value === status)) throw new CatalogQueryError();
  if (sort !== "updated" && sort !== "title") throw new CatalogQueryError();
  return {
    page: integer(single(raw, "page"), 1),
    pageSize: integer(single(raw, "pageSize"), 20, 100),
    status: status ? status as ArchiveStatus : undefined,
    sort,
  } as Pick<CatalogQuery, "page" | "pageSize" | "status" | "sort">;
}
export function readCatalogQuery(raw: SearchParams): CatalogQuery {
  checkKeys(raw, ["page", "pageSize", "status", "sort", "person", "source", "missing"]);
  const person = single(raw, "person");
  const source = single(raw, "source");
  const missing = groupBy(single(raw, "missing"));
  if ((missing === "author" && person !== undefined) || (missing === "source" && source !== undefined)) throw new CatalogQueryError();
  return { ...listFields(raw), person: person === undefined ? undefined : personId(person), source: source === undefined ? undefined : sourceName(source), missing };
}
export function readPeopleQuery(raw: SearchParams) {
  checkKeys(raw, ["page", "pageSize"]);
  return { page: integer(single(raw, "page"), 1), pageSize: integer(single(raw, "pageSize"), 20, 100) };
}
export function readMapQuery(raw: SearchParams): MapQuery {
  checkKeys(raw, ["by", "group", "missing", "groupPage", "page", "pageSize", "status", "sort"]);
  const by = groupBy(single(raw, "by")) ?? "author";
  const group = single(raw, "group");
  const missing = groupBy(single(raw, "missing"));
  if (missing !== undefined && (missing !== by || group !== undefined)) throw new CatalogQueryError();
  return {
    ...listFields(raw), by, missing,
    group: group === undefined ? undefined : by === "author" ? personId(group) : sourceName(group),
    groupPage: integer(single(raw, "groupPage"), 1),
  };
}
function toRaw(query: UrlQuery): SearchParams {
  return Object.fromEntries(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => {
    if (typeof value !== "string" && typeof value !== "number") throw new CatalogQueryError();
    return [key, String(value)];
  }));
}
function encodeQuery(query: UrlQuery) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, String(value));
  return params.toString();
}
/** Only local catalog routes are accepted; every generated URL uses the same validation as incoming requests. */
export function catalogHref(path: CatalogPath, query: UrlQuery = {}) {
  const raw = toRaw(query);
  const normalized: UrlQuery = path === "/map" ? readMapQuery(raw) : path === "/people" ? readPeopleQuery(raw) : readCatalogQuery(raw);
  const compact = Object.fromEntries(Object.entries(normalized).filter(([key, value]) =>
    value !== undefined && !((key === "page" || key === "groupPage") && value === 1) &&
    !(key === "pageSize" && value === 20) && !(key === "sort" && value === "updated") && !(key === "by" && value === "author")
  ));
  const encoded = encodeQuery(compact);
  return encoded ? `${path}?${encoded}` : path;
}
export function mapEntryQuery(query: MapQuery): CatalogQuery {
  return {
    page: query.page, pageSize: query.pageSize, status: query.status, sort: query.sort, missing: query.missing,
    person: query.by === "author" ? query.group : undefined,
    source: query.by === "source" ? query.group : undefined,
  };
}
export function getCatalogOverview() {
  return apiGet<CatalogOverview>("/api/v1/catalog/overview");
}
export function getCatalogEntries(query: CatalogQuery) {
  const valid = readCatalogQuery(toRaw(query));
  return apiGet<CatalogEntries>(`/api/v1/catalog/entries?${encodeQuery(valid)}`);
}
export function getCatalogPeople(query: { page: number; pageSize: number }) {
  const valid = readPeopleQuery(toRaw(query));
  return apiGet<CatalogPeople>(`/api/v1/people?${encodeQuery(valid)}`);
}
export function getCatalogGroups(by: GroupBy, page = 1) {
  const validBy = groupBy(by) ?? "author";
  const validPage = integer(String(page), 1);
  return apiGet<CatalogGroups>(`/api/v1/catalog/groups?${encodeQuery({ by: validBy, page: validPage, pageSize: 30 })}`);
}
