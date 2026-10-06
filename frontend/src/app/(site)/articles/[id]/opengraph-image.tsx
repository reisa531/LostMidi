import { ImageResponse } from "next/og";
import { getArticle } from "@/lib/api/articles";
import { asciiText, OgCard } from "@/components/og-card";
import { siteOrigin } from "@/lib/seo";

export const alt = "档案文章卡片";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = siteOrigin()?.replace(/^https?:\/\//, "") ?? "Lost MIDI Archive";
  let title = id;
  let footer = "Archive article";
  try {
    const article = await getArticle(id);
    title = asciiText(article.title, `Article ${article.id}`);
    footer = `${article.author_username} · ${article.updated_at.slice(0, 10)}`;
  } catch { /* 后端不可用时仍返回一张可用的卡片图。 */ }
  return new ImageResponse(<OgCard eyebrow="ARCHIVE ARTICLE · RESEARCH" title={title} host={host} footer={footer} />, size);
}
