import { ImageResponse } from "next/og";
import { getPersonById } from "@/lib/api/person";
import { asciiText, OgCard } from "@/components/og-card";
import { siteOrigin } from "@/lib/seo";

export const alt = "人物档案卡片";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const host = siteOrigin()?.replace(/^https?:\/\//, "") ?? "Lost MIDI Archive";
  let title = id;
  let footer = "Person profile";
  try {
    const detail = await getPersonById(id);
    title = asciiText(detail.person.display_name, detail.person.public_id);
    footer = `Person #${detail.person.public_id.slice(0, 8)}`;
  } catch { /* 后端不可用时仍返回一张可用的卡片图。 */ }
  return new ImageResponse(<OgCard eyebrow="PERSON ARCHIVE · PROFILES" title={title} host={host} footer={footer} />, size);
}
