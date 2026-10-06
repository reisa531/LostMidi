import { ImageResponse } from "next/og";
import { getMidiByPublicId, getMidiBySlug } from "@/lib/api/midi";
import { asciiText, OgCard } from "@/components/og-card";
import { siteOrigin } from "@/lib/seo";

export const alt = "MIDI 档案卡片";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STABLE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** 卡片标题只放 ASCII：中文标题改用 slug，避免缺字方块。 */
export default async function OpengraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const host = siteOrigin()?.replace(/^https?:\/\//, "") ?? "Lost MIDI Archive";
  let title = slug;
  let eyebrow = "MIDI ARCHIVE";
  let footer = "Early web MIDI · digital archive";
  try {
    const detail = STABLE_ID.test(slug) ? await getMidiByPublicId(slug) : await getMidiBySlug(slug);
    title = asciiText(detail.entry.title, detail.entry.slug);
    eyebrow = `MIDI ARCHIVE · ${detail.entry.archive_status.toUpperCase()}`;
    footer = `Archive #${detail.entry.public_id.slice(0, 8)}`;
  } catch { /* 后端不可用时仍返回一张可用的卡片图。 */ }
  return new ImageResponse(<OgCard eyebrow={eyebrow} title={title} host={host} footer={footer} />, size);
}
