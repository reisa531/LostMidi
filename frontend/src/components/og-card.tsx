import { ArchiveMark } from "./archive-brand";

/**
 * Open Graph / Twitter 卡片图。
 *
 * next/og 的 ImageResponse 默认只带拉丁字形，中文字符会渲染成空白方块，因此这里
 * 只接受 ASCII 文本：调用方用 asciiText() 决定回退值（通常是 slug 或 public_id），
 * 卡片本身用色块与几何标记表达站点识别，不依赖字体覆盖范围。
 */
const palette = {
  background: "#f3eee4",
  foreground: "#201f1c",
  muted: "#676257",
  accent: "#b23a29",
};

/** 非 ASCII 文本回退到 fallback，避免卡片出现缺字方块。 */
export function asciiText(value: string | null | undefined, fallback: string) {
  const text = (value ?? "").trim();
  return text && /^[\x20-\x7e]+$/.test(text) ? text : fallback;
}

export function OgCard({ eyebrow, title, host, footer }: { eyebrow: string; title: string; host: string; footer?: string }) {
  const size = title.length > 34 ? 44 : title.length > 20 ? 56 : 68;
  return <div style={{
    display: "flex", flexDirection: "column", justifyContent: "space-between",
    width: "100%", height: "100%", padding: "68px 76px",
    background: palette.background, color: palette.foreground,
  }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 26, letterSpacing: 8, color: palette.accent }}>LOST MIDI ARCHIVE</div>
        <div style={{ fontSize: 19, letterSpacing: 4, color: palette.muted }}>{eyebrow}</div>
      </div>
      <ArchiveMark size={104} colors={{ paper: palette.background, ink: palette.foreground, accent: palette.accent }} />
    </div>
    <div style={{ display: "flex", fontSize: size, lineHeight: 1.15, letterSpacing: -1, color: palette.foreground }}>{title}</div>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px solid ${palette.accent}`, paddingTop: 22, fontSize: 20, color: palette.muted }}>
      <span>{footer ?? "MIDI sources and recovery records"}</span>
      <span style={{ color: palette.accent }}>{host}</span>
    </div>
  </div>;
}
