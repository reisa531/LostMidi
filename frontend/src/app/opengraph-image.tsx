import { ImageResponse } from "next/og";
import { OgCard } from "@/components/og-card";
import { siteOrigin } from "@/lib/seo";

export const alt = "Lost MIDI Archive · 早期网络 MIDI 数字档案";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** 站点级卡片图：静态生成，不依赖后端，任何页面都能直接复用。 */
export default function OpengraphImage() {
  const host = siteOrigin()?.replace(/^https?:\/\//, "") ?? "Lost MIDI Archive";
  return new ImageResponse(<OgCard eyebrow="DIGITAL ARCHIVE · WEB ARCHAEOLOGY" title="Lost MIDI Archive" host={host} />, size);
}
