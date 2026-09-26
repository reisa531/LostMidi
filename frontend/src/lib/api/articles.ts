import "server-only";
import { apiGet } from "./client";

export type ArticleSummary = {
  id: string; title: string; status: "draft" | "published"; author_username: string;
  revision: number; created_at: string; updated_at: string;
};
export type ArticleDetail = ArticleSummary & {
  body_markdown: string;
  midis: { id: string; public_id: string; slug: string; title: string; archive_status: string }[];
  people: { id: string; public_id: string; display_name: string }[];
};
export type ArticlePage = { data: ArticleSummary[]; page: number; pageSize: number; total: number };
export function getArticles(page = 1, pageSize = 20) {
  return apiGet<ArticlePage>(`/api/v1/articles?page=${page}&pageSize=${pageSize}`);
}
export function getArticle(id: string) { return apiGet<ArticleDetail>(`/api/v1/articles/${encodeURIComponent(id)}`); }
export function getMidiArticles(id: string, page = 1) { return apiGet<ArticlePage>(`/api/v1/articles/by-midi/${encodeURIComponent(id)}?page=${page}`); }
export function getPersonArticles(id: string, page = 1) { return apiGet<ArticlePage>(`/api/v1/articles/by-person/${encodeURIComponent(id)}?page=${page}`); }
