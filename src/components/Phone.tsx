"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

export interface PhoneVideo {
  id: string;
  src: string;
  caption: string;
  coin: { name: string; ticker: string; slug: string; avatar: string };
  post?: string;
  postUrl?: string | null;
}

const POST_LABEL: Record<string, string> = {
  approved: "Queued for TikTok",
  posting: "Posting to TikTok",
  published: "On TikTok",
  failed: "TikTok post failed",
};

export function PlayGlyph({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="#FFB21A" />
      <path d="M19 14l15 10-15 10z" fill="#101010" />
    </svg>
  );
}

/** An empty phone frame (cold start): no sample content, just the glowing frame and a play glyph. */
export function EmptyPhone({ className = "", line }: { className?: string; line?: string }) {
  return (
    <div className={`phone phone-empty grid place-items-center ${className}`}>
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <PlayGlyph />
        {line && <p className="text-[13px] leading-snug text-muted-foreground">{line}</p>}
      </div>
    </div>
  );
}

/**
 * One video in a 9:16 phone card. Muted; plays on hover (desktop) and while on screen when `autoInView`
 * (the mobile "For you" feed).
 */
export function PhoneCard({ v, className = "", autoInView = false, showCoin = true }: { v: PhoneVideo; className?: string; autoInView?: boolean; showCoin?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!autoInView || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) el.play().catch(() => undefined);
        else el.pause();
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [autoInView]);
  const label = v.post ? POST_LABEL[v.post] : undefined;
  return (
    <figure className={`phone group ${className}`} data-testid="video-card">
      <video
        ref={ref}
        src={v.src}
        className="absolute inset-0 h-full w-full object-cover"
        muted
        loop
        playsInline
        preload="metadata"
        onMouseEnter={(e) => e.currentTarget.play().catch(() => undefined)}
        onMouseLeave={(e) => e.currentTarget.pause()}
      />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/85 to-transparent" />
      {label && (
        <span className={`absolute left-3 top-3 rounded-full px-2 py-0.5 text-[11px] font-semibold ${v.post === "published" ? "bg-white text-black" : "bg-black/60 text-white"}`} data-testid="post-status">
          {label}
        </span>
      )}
      <figcaption className="absolute inset-x-0 bottom-0 p-3.5">
        {showCoin && (
          <Link href={`/${v.coin.slug}`} className="pointer-events-auto flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={v.coin.avatar} alt="" className="h-7 w-7 rounded-full object-cover ring-2 ring-white/80" />
            <span className="text-[13px] font-semibold text-white">
              {v.coin.name} <span className="mono text-[11px] text-white/70">${v.coin.ticker}</span>
            </span>
          </Link>
        )}
        <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-snug text-white/85">{v.caption}</p>
        {v.post === "published" && v.postUrl && (
          <a href={v.postUrl} target="_blank" rel="noreferrer" className="pointer-events-auto mt-1.5 inline-block text-[12px] font-semibold text-cyan underline underline-offset-2" data-testid="tiktok-link">
            Open on TikTok ↗
          </a>
        )}
      </figcaption>
    </figure>
  );
}
