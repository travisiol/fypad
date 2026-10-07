/** What the pages show, read from our tables + live market reads (cached 60 s). */
import { after } from "next/server";
import { ENV } from "../config/fypad.ts";
import { db as defaultDb } from "./db.ts";
import { readMarkets } from "./market-data.ts";
import type { Market } from "./market-data.ts";
import { runSweep, sweepDue } from "./rewards.ts";
import { getTikTok, profileUrl } from "./tiktok.ts";
import { runTick, tickDue } from "./videogen.ts";
import { budgetOf, coinFees, getCoin, listCoins, mediaUrl, readyVideos, videosOf } from "./store.ts";
import type { CoinRow, VideoRow } from "./store.ts";

export interface CoinView {
  c: CoinRow;
  avatar: string;
  market: Market;
  latest: VideoView | null;
  tiktok: { username: string | null; url: string | null } | null;
}

export interface VideoView {
  v: VideoRow;
  src: string;
  coin: { name: string; ticker: string; slug: string; avatar: string };
}

export const avatarOf = (c: CoinRow) => mediaUrl(c.imageId) ?? "/fypad.svg";
export const videoSrc = (v: VideoRow) => `/api/video/${v.id}`;

const EMPTY: Market = { mcapUsd: null, change24h: null, hasPair: false };

function toVideo(v: VideoRow, c: CoinRow): VideoView {
  return { v, src: videoSrc(v), coin: { name: c.name, ticker: c.ticker, slug: c.slug, avatar: avatarOf(c) } };
}

export function tiktokOf(c: CoinRow): CoinView["tiktok"] {
  const t = getTikTok(defaultDb(), c.id);
  return t ? { username: t.username, url: profileUrl(t.username) } : null;
}

/** Every coin (newest 60 read live) with its latest public video. */
export async function allCoins(limit = 60): Promise<CoinView[]> {
  const db = defaultDb();
  const coins = listCoins(db, limit);
  const markets = await readMarkets(coins.map((c) => c.mint));
  return coins.map((c) => {
    const v = readyVideos(db, 1, c.id)[0];
    return { c, avatar: avatarOf(c), market: markets.get(c.mint) ?? EMPTY, latest: v ? toVideo(v, c) : null, tiktok: tiktokOf(c) };
  });
}

/** Newest public videos across coins: the "For you" feed and the hero cards. */
export function forYou(limit = 30): VideoView[] {
  const db = defaultDb();
  const cache = new Map<string, CoinRow | null>();
  const out: VideoView[] = [];
  for (const v of readyVideos(db, limit)) {
    if (!cache.has(v.coinId)) cache.set(v.coinId, getCoin(db, v.coinId));
    const c = cache.get(v.coinId);
    if (c) out.push(toVideo(v, c));
  }
  return out;
}

export function coinWall(c: CoinRow, limit = 30): VideoView[] {
  return readyVideos(defaultDb(), limit, c.id).map((v) => toVideo(v, c));
}

export function coinVideos(c: CoinRow, limit = 30): VideoView[] {
  return videosOf(defaultDb(), c.id, limit).map((v) => toVideo(v, c));
}

export function coinMoney(c: CoinRow) {
  return { budget: budgetOf(c), fees: coinFees(defaultDb(), c.id), cost: ENV.costPerVideo() };
}

/** Page-load trigger: schedules the video tick and the fee sweep with after() when overdue. */
export function scheduleWork() {
  try {
    const db = defaultDb();
    const tick = tickDue(db);
    const sweep = sweepDue(db);
    if (!tick && !sweep) return;
    after(async () => {
      if (sweep) await runSweep(db).catch(() => null);
      if (tick) await runTick(db).catch(() => null);
    });
  } catch {
    // outside a request scope (build time): nothing to schedule
  }
}

export interface HomeStats {
  coins: number;
  videos: number;
  published: number;
  budget: bigint;
}

/** Real counts for the home page; zeros on a cold start. */
export function homeStats(): HomeStats {
  const db = defaultDb();
  const n = (sql: string) => Number((db.prepare(sql).get() as { n: number }).n);
  const rows = db.prepare("SELECT budgetIn, budgetSpent FROM coins").all() as { budgetIn: string; budgetSpent: string }[];
  return {
    coins: n("SELECT COUNT(*) AS n FROM coins"),
    videos: n("SELECT COUNT(*) AS n FROM videos WHERE status = 'ready'"),
    published: n("SELECT COUNT(*) AS n FROM videos WHERE post = 'published'"),
    budget: rows.reduce((s, r) => s + BigInt(r.budgetIn), BigInt(0)),
  };
}

/** Serializable card data for the client PhoneCard. */
export function toPhone(x: VideoView): { id: string; src: string; caption: string; coin: VideoView["coin"]; post: string; postUrl: string | null } {
  return { id: x.v.id, src: x.src, caption: x.v.caption, coin: x.coin, post: x.v.post, postUrl: x.v.postUrl };
}
