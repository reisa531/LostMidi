"use server";
import { getCatalogEntries, getCatalogPeople } from "@/lib/api/catalog";
import { adminRequest } from "./auth";

export async function searchArticleOptions(kind: "midi" | "person", query: string, page = 1) {
  if ((kind !== "midi" && kind !== "person") || !Number.isInteger(page) || page < 1 || page > 1000000 ||
      new TextEncoder().encode(query).length > 200) throw new Error("Invalid association search");
  await adminRequest("/api/v1/admin/session");
  const normalized = query.trim();
  if (kind === "midi") {
    const result = await getCatalogEntries({ page, pageSize: 20, sort: "title", q: normalized || undefined });
    return { options: result.data.map(item => ({ id: item.id, label: `${item.title} · #${item.id}`, archived: item.archive_status === "archived" })),
      total: result.pagination.total, page: result.pagination.page, pageSize: result.pagination.pageSize };
  }
  const result = await getCatalogPeople({ page, pageSize: 20, q: normalized || undefined });
  return { options: result.data.map(item => ({ id: item.id, label: `${item.display_name} · #${item.id}`, archived: false })),
    total: result.pagination.total, page: result.pagination.page, pageSize: result.pagination.pageSize };
}
