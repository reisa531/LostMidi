"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Slide } from "@/lib/front-desk";

export function DeskCarousel({ slides }: { slides: Slide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(true);
  const [interacting, setInteracting] = useState(false);
  useEffect(() => {
    if (paused || interacting || slides.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex(n => (n + 1) % slides.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [paused, interacting, slides.length]);
  if (!slides.length) return null;
  const item = slides[index % slides.length];
  return <section className="desk-carousel" aria-label="栏目轮播" onMouseEnter={() => setInteracting(true)} onMouseLeave={() => setInteracting(false)}>
    <h2>本期选读</h2><div className="flex flex-wrap items-center justify-between gap-3">
      <Link className="feature-link" href={item.href} onFocus={() => setPaused(true)}>{item.title} ↗</Link>
      {slides.length > 1 && <div className="flex items-center gap-2">
        <button type="button" aria-label="上一栏" onClick={() => setIndex(n => (n + slides.length - 1) % slides.length)}>←</button>
        <small>{index + 1} / {slides.length}</small>
        <button type="button" aria-label="下一栏" onClick={() => setIndex(n => (n + 1) % slides.length)}>→</button>
        <button type="button" onClick={() => setPaused(!paused)}>{paused ? "自动翻页" : "暂停"}</button>
      </div>}
    </div></section>;
}
