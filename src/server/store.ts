/**
 * FYPAD tables: media, launches, coins, tiktok, fee_events, owners, videos, kv. Every function takes the
 * database so tests can use an in-memory one.
 */
import type { DatabaseSync } from "node:sqlite";
import { randomBytes } from "node:crypto";

export interface CoinRow {
  id: string;
  slug: string;
  mint: string;
  name: string;
  ticker: string;
  description: string;
  style: string;
  styleNote: string;
  perDay: number;
  contentPct: number;
  imageId: string | null;
  owner: string;
  creator: string | null;
  launchSig: string | null;
  website: string | null;
  xUrl: string | null;
  paused: number;
  approve: number;
  nextVideoAt: number;
  videoCount: number;
  lastRegenAt: number;
  budgetIn: string;
  budgetSpent: string;
  createdAt: number;
  lastSig: string | null;
  pendingNewest: string | null;
  beforeSig: string | null;
}

export interface LaunchRow {
  id: string;
  name: string;
  ticker: string;
  setup: string;
  imageId: string;
  launcher: string;
  firstBuyLamports: string;
  status: string;
  paySig: string | null;
  mint: string | null;
  sig: string | null;
  error: string | null;
  createdAt: number;
}

/** status: queued → running → ready | failed. post: none | draft | approved | posting | published | failed. */
export interface VideoRow {
  id: string;
  coinId: string;
  prompt: string;
  caption: string;
  provider: string;
  jobId: string | null;
  status: string;
  file: string | null;
  error: string | null;
  cost: string;
  post: string;
  publishId: string | null;
  postUrl: string | null;
  postError: string | null;
  postedAt: number | null;
  createdAt: number;
  doneAt: number | null;
}

const big = (v: unknown) => BigInt(String(v ?? "0"));
export const newId = (bytes = 8) => randomBytes(bytes).toString("hex");

// ───────────────────────────── media

export function putMedia(db: DatabaseSync, mime: string, bytes: Buffer): string {
  const id = newId(10);
  db.prepare("INSERT INTO media (id, mime, bytes, createdAt) VALUES (?, ?, ?, ?)").run(id, mime, bytes, Date.now());
  return id;
}

export function getMedia(db: DatabaseSync, id: string): { mime: string; bytes: Buffer } | null {
  const row = db.prepare("SELECT mime, bytes FROM media WHERE id = ?").get(id) as { mime: string; bytes: Uint8Array } | undefined;
  return row ? { mime: row.mime, bytes: Buffer.from(row.bytes) } : null;
}

export const mediaUrl = (id: string | null) => (id ? `/api/media/${id}` : null);

// ───────────────────────────── launches

export function insertLaunch(db: DatabaseSync, l: Omit<LaunchRow, "paySig" | "mint" | "sig" | "error">) {
  db.prepare("INSERT INTO launches (id, name, ticker, setup, imageId, launcher, firstBuyLamports, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    l.id,
    l.name,
    l.ticker,
    l.setup,
    l.imageId,
    l.launcher,
    l.firstBuyLamports,
    l.status,
    l.createdAt,
  );
}

export function getLaunch(db: DatabaseSync, id: string): LaunchRow | null {
  return (db.prepare("SELECT * FROM launches WHERE id = ?").get(id) as unknown as LaunchRow | undefined) ?? null;
}

export function updateLaunch(db: DatabaseSync, id: string, patch: Partial<Pick<LaunchRow, "status" | "paySig" | "mint" | "sig" | "error" | "firstBuyLamports">>) {
  for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE launches SET ${k} = ? WHERE id = ?`).run(v as string | null, id);
}

export function paySigUsed(db: DatabaseSync, sig: string): boolean {
  return Boolean(db.prepare("SELECT 1 FROM launches WHERE paySig = ?").get(sig));
}

export function launchesSince(db: DatabaseSync, launcher: string, since: number): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM launches WHERE launcher = ? AND createdAt > ? AND status != ?").get(launcher, since, "failed") as { n: number }).n);
}

// ───────────────────────────── coins

export function slugify(name: string, db: DatabaseSync): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "coin";
  for (;;) {
    const slug = `${base}-${randomBytes(2).toString("hex")}`;
    if (!db.prepare("SELECT 1 FROM coins WHERE slug = ?").get(slug)) return slug;
  }
}

export type NewCoin = Pick<CoinRow, "mint" | "name" | "ticker" | "description" | "style" | "styleNote" | "perDay" | "contentPct" | "imageId" | "owner" | "creator" | "launchSig" | "website" | "xUrl" | "nextVideoAt"> & { createdAt?: number };

export function insertCoin(db: DatabaseSync, c: NewCoin): CoinRow {
  const id = newId();
  const slug = slugify(c.name, db);
  db.prepare(
    `INSERT INTO coins (id, slug, mint, name, ticker, description, style, styleNote, perDay, contentPct, imageId, owner, creator, launchSig, website, xUrl, nextVideoAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, slug, c.mint, c.name, c.ticker, c.description, c.style, c.styleNote, c.perDay, c.contentPct, c.imageId, c.owner, c.creator, c.launchSig, c.website, c.xUrl, c.nextVideoAt, c.createdAt ?? Date.now());
  return getCoin(db, id)!;
}

export function getCoin(db: DatabaseSync, id: string): CoinRow | null {
  return (db.prepare("SELECT * FROM coins WHERE id = ?").get(id) as unknown as CoinRow | undefined) ?? null;
}
export function coinBySlug(db: DatabaseSync, slug: string): CoinRow | null {
  return (db.prepare("SELECT * FROM coins WHERE slug = ?").get(slug) as unknown as CoinRow | undefined) ?? null;
}
export function coinByMint(db: DatabaseSync, mint: string): CoinRow | null {
  return (db.prepare("SELECT * FROM coins WHERE mint = ?").get(mint) as unknown as CoinRow | undefined) ?? null;
}
export function listCoins(db: DatabaseSync, limit = 200): CoinRow[] {
  return db.prepare("SELECT * FROM coins ORDER BY createdAt DESC LIMIT ?").all(limit) as unknown as CoinRow[];
}
export function coinsOf(db: DatabaseSync, owner: string): CoinRow[] {
  return db.prepare("SELECT * FROM coins WHERE owner = ? ORDER BY createdAt DESC").all(owner) as unknown as CoinRow[];
}

export function updateCoin(
  db: DatabaseSync,
  id: string,
  patch: Partial<Pick<CoinRow, "paused" | "approve" | "nextVideoAt" | "videoCount" | "lastRegenAt" | "budgetIn" | "budgetSpent" | "lastSig" | "pendingNewest" | "beforeSig">>,
) {
  for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE coins SET ${k} = ? WHERE id = ?`).run(v as string | number | null, id);
}

/** Content budget: credited from fees, spent by generations (failed jobs are refunded). */
export function budgetOf(c: Pick<CoinRow, "budgetIn" | "budgetSpent">): { credited: bigint; spent: bigint; balance: bigint } {
  const credited = big(c.budgetIn);
  const spent = big(c.budgetSpent);
  return { credited, spent, balance: credited - spent };
}

/** Atomically debits `cost` from the coin's budget; false when the balance is short. */
export function debitBudget(db: DatabaseSync, coinId: string, cost: bigint): boolean {
  const c = getCoin(db, coinId);
  if (!c || budgetOf(c).balance < cost) return false;
  updateCoin(db, coinId, { budgetSpent: (big(c.budgetSpent) + cost).toString() });
  return true;
}

export function refundBudget(db: DatabaseSync, coinId: string, cost: bigint) {
  const c = getCoin(db, coinId);
  if (!c) return;
  const spent = big(c.budgetSpent) - cost;
  updateCoin(db, coinId, { budgetSpent: (spent > BigInt(0) ? spent : BigInt(0)).toString() });
}

// ───────────────────────────── fees and owners

export function creditFee(
  db: DatabaseSync,
  e: { mint: string; sig: string; slot: number; lamports: bigint; coinId: string | null; owner: string | null; ownerShare: bigint; content: bigint; platform: bigint },
): boolean {
  const res = db
    .prepare("INSERT OR IGNORE INTO fee_events (mint, sig, slot, lamports, coinId, owner, ownerShare, content, platform, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(e.mint, e.sig, e.slot, e.lamports.toString(), e.coinId, e.owner, e.ownerShare.toString(), e.content.toString(), e.platform.toString(), Date.now());
  if (Number(res.changes) === 0) return false;
  if (e.owner && e.ownerShare > BigInt(0)) {
    db.prepare("INSERT OR IGNORE INTO owners (wallet) VALUES (?)").run(e.owner);
    const o = getOwner(db, e.owner);
    db.prepare("UPDATE owners SET lamports = ? WHERE wallet = ?").run((big(o.lamports) + e.ownerShare).toString(), e.owner);
  }
  if (e.coinId && e.content > BigInt(0)) {
    const c = getCoin(db, e.coinId);
    if (c) updateCoin(db, c.id, { budgetIn: (big(c.budgetIn) + e.content).toString() });
  }
  return true;
}

export function getOwner(db: DatabaseSync, wallet: string): { wallet: string; lamports: string; paidLamports: string } {
  return (db.prepare("SELECT * FROM owners WHERE wallet = ?").get(wallet) as { wallet: string; lamports: string; paidLamports: string } | undefined) ?? { wallet, lamports: "0", paidLamports: "0" };
}

export function ownerBalance(db: DatabaseSync, wallet: string): { earned: bigint; paid: bigint; available: bigint } {
  const o = getOwner(db, wallet);
  return { earned: big(o.lamports), paid: big(o.paidLamports), available: big(o.lamports) - big(o.paidLamports) };
}

export function setOwnerPaid(db: DatabaseSync, wallet: string, paid: bigint) {
  db.prepare("INSERT OR IGNORE INTO owners (wallet) VALUES (?)").run(wallet);
  db.prepare("UPDATE owners SET paidLamports = ? WHERE wallet = ?").run(paid.toString(), wallet);
}

/** Fees attributed to a coin: total creator fees, launcher share, content share. */
export function coinFees(db: DatabaseSync, coinId: string): { fees: bigint; owner: bigint; content: bigint; trades: number } {
  const rows = db.prepare("SELECT lamports, ownerShare, content FROM fee_events WHERE coinId = ?").all(coinId) as { lamports: string; ownerShare: string; content: string }[];
  let fees = BigInt(0);
  let owner = BigInt(0);
  let content = BigInt(0);
  for (const r of rows) {
    fees += big(r.lamports);
    owner += big(r.ownerShare);
    content += big(r.content);
  }
  return { fees, owner, content, trades: rows.length };
}

// ───────────────────────────── videos

export function insertVideo(db: DatabaseSync, v: Pick<VideoRow, "coinId" | "prompt" | "caption" | "provider" | "cost" | "createdAt">): VideoRow {
  const id = newId();
  db.prepare("INSERT INTO videos (id, coinId, prompt, caption, provider, status, cost, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(id, v.coinId, v.prompt, v.caption, v.provider, "queued", v.cost, v.createdAt);
  return getVideo(db, id)!;
}

export function getVideo(db: DatabaseSync, id: string): VideoRow | null {
  return (db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as unknown as VideoRow | undefined) ?? null;
}

export function updateVideo(db: DatabaseSync, id: string, patch: Partial<Pick<VideoRow, "jobId" | "status" | "file" | "error" | "post" | "publishId" | "postUrl" | "postError" | "postedAt" | "doneAt" | "caption">>) {
  for (const [k, v] of Object.entries(patch)) db.prepare(`UPDATE videos SET ${k} = ? WHERE id = ?`).run(v as string | number | null, id);
}

export function videosOf(db: DatabaseSync, coinId: string, limit = 30): VideoRow[] {
  return db.prepare("SELECT * FROM videos WHERE coinId = ? ORDER BY createdAt DESC LIMIT ?").all(coinId, limit) as unknown as VideoRow[];
}

/** Public = finished and not a draft waiting for (or discarded by) the launcher. */
export const PUBLIC_POST = "('approved', 'posting', 'published', 'failed')";

/** Public videos across every coin (or one coin), newest first: the "For you" feed, the hero cards, the wall. */
export function readyVideos(db: DatabaseSync, limit = 30, coinId?: string): VideoRow[] {
  if (coinId) return db.prepare(`SELECT * FROM videos WHERE status = 'ready' AND post IN ${PUBLIC_POST} AND coinId = ? ORDER BY doneAt DESC LIMIT ?`).all(coinId, limit) as unknown as VideoRow[];
  return db.prepare(`SELECT * FROM videos WHERE status = 'ready' AND post IN ${PUBLIC_POST} ORDER BY doneAt DESC LIMIT ?`).all(limit) as unknown as VideoRow[];
}

export function runningVideos(db: DatabaseSync, limit: number): VideoRow[] {
  return db.prepare("SELECT * FROM videos WHERE status IN ('queued', 'running') ORDER BY createdAt LIMIT ?").all(limit) as unknown as VideoRow[];
}

export function videosToPost(db: DatabaseSync, limit: number): VideoRow[] {
  return db.prepare("SELECT * FROM videos WHERE status = 'ready' AND post IN ('approved', 'posting') ORDER BY doneAt LIMIT ?").all(limit) as unknown as VideoRow[];
}

// ───────────────────────────── kv

export function kvGet(db: DatabaseSync, k: string): string | null {
  return (db.prepare("SELECT v FROM kv WHERE k = ?").get(k) as { v: string } | undefined)?.v ?? null;
}

export function kvSet(db: DatabaseSync, k: string, v: string) {
  db.prepare("INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v").run(k, v);
}
