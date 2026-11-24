"use client";
import { useState } from "react";

export function BilibiliVideo({ source, link }: { source: string; link: string }) {
  const [loaded, setLoaded] = useState(false);
  return <span className="bili-film">{loaded ? <iframe title="哔哩哔哩视频" src={source} allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /> :
    <button type="button" onClick={() => setLoaded(true)}>▷ 载入 B 站视频</button>}
    <a className="archive-link" href={link} target="_blank" rel="noopener noreferrer">在 B 站观看 ↗</a></span>;
}
