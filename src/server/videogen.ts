/**
 * The daily video engine. Nothing loops: `runTick()` runs from `/api/tick` (cron, TICK_SECRET) or from
 * `after()` on a page load when the last tick is older than TICK_EVERY_MS. Each tick:
 *   1. starts a generation for up to TICK_MAX_STARTS coins whose next video is due and whose content budget
 *      covers COST_PER_VIDEO_SOL (debited at start, refunded if the provider fails the job);
 *   2. polls up to TICK_MAX_POLLS running jobs (a generation is never awaited inside one request) and stores
 *      finished mp4s; each one becomes a draft (approve-before-post ON) or is approved for posting (OFF);
 *   3. posts approved videos of coins with a connected TikTok and reads back the status of posts in flight.
 * The provider is VIDEO_PROVIDER: higgsfield (default, higgsfield.ts) or openai (Sora, ai.ts).
 */
import type { DatabaseSync } from "node:sqlite";
import { accessSync, constants, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ENV, JOB_TIMEOUT_MS, MAX_CAPTION_CHARS, REGENERATE_EVERY_MS, STYLES, TICK_EVERY_MS, TICK_MAX_POLLS, TICK_MAX_STARTS, isStyle } from "../config/fypad.ts";
import type { VideoProvider } from "../config/fypad.ts";
import { openAiWriter, sora } from "./ai.ts";
import type { Writer } from "./ai.ts";
import { db as defaultDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import { higgsfield } from "./higgsfield.ts";
import { getTikTok, postStatus, publishVideo } from "./tiktok.ts";
import { budgetOf, debitBudget, getCoin, getVideo, insertVideo, kvGet, kvSet, refundBudget, runningVideos, updateCoin, updateVideo, videosOf, videosToPost } from "./store.ts";
import type { CoinRow, VideoRow } from "./store.ts";

export interface VideoJob {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  error: string | null;
  url: string | null;
}

export interface VideoMaker {
  name: VideoProvider;
  create(prompt: string, opts: { idempotencyKey: string; webhookUrl?: string }): Promise<VideoJob>;
  get(id: string): Promise<VideoJob>;
  content(job: VideoJob): Promise<Buffer>;
}

export const VIDEO_CLOSED = "Video generation is not available right now.";

/** The configured provider, or null when its key is missing. */
export function videoMaker(fetcher: typeof fetch = fetch): VideoMaker | null {
  return ENV.videoProvider() === "openai" ? sora(fetcher) : higgsfield(fetcher);
}

export function videoDir(): string {
  const dir = ENV.videoDir() ?? join(process.cwd(), "data", "videos");
  try {
    mkdirSync(/* turbopackIgnore: true */ dir, { recursive: true });
    accessSync(/* turbopackIgnore: true */ dir, constants.W_OK);
    return dir;
  } catch {
    const t = join(tmpdir(), "fypad-videos");
    mkdirSync(t, { recursive: true });
    return t;
  }
}

export function videoBytes(v: VideoRow): Buffer | null {
  if (v.status !== "ready" || !v.file) return null;
  const path = join(/* turbopackIgnore: true */ videoDir(), v.file);
  return existsSync(/* turbopackIgnore: true */ path) ? readFileSync(/* turbopackIgnore: true */ path) : null;
}

// ───────────────────────────── the day's scene

/** Drops every sentence holding a money figure or a percentage (no market numbers are given to the model). */
export function stripFigures(text: string): string {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  return sentences
    .filter((s) => !/\$\s?\d/.test(s) && !/\d\s?%/.test(s) && !/\b\d+(?:\.\d+)?\s?x\b/i.test(s))
    .join(" ")
    .trim();
}

const BEATS: Record<string, string[]> = {
  meme: ["a mascot version of the coin tries to look serious in a job interview and fails", "the coin's mascot argues with a vending machine", "the mascot discovers the chart and faints dramatically", "the mascot hosts a cooking show where everything burns", "the mascot waits for a bus that never comes"],
  hype: ["the coin's logo slams onto the screen through smoke and neon light", "a rapid montage of city lights, a spinning coin and a crowd cheering", "slow-motion coin flip that explodes into confetti", "a rocket made of the coin's colors launches at night", "the logo pulses to a bass drop in a dark arena"],
  presenter: ["a friendly presenter introduces the coin to the camera like a morning news segment", "a presenter on a rooftop explains what the coin is about in one breath", "a street interviewer asks a stranger what they think of the coin", "a presenter unboxes the coin's logo like a new gadget", "a presenter gives a weather report where the forecast is the coin's mood"],
};

export function templateScene(c: Pick<CoinRow, "name" | "ticker" | "description" | "style" | "styleNote" | "videoCount">): { scene: string; caption: string } {
  const beats = BEATS[c.style] ?? BEATS.meme;
  const beat = beats[c.videoCount % beats.length];
  return { scene: `${beat}. ${c.styleNote}`.trim(), caption: `${c.name} ($${c.ticker}) — ${c.description}`.slice(0, MAX_CAPTION_CHARS) };
}

const SCENE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["scene", "caption"],
  properties: { scene: { type: "string" }, caption: { type: "string" } },
} as const;

export async function writeScene(c: CoinRow, writer: Writer | null): Promise<{ scene: string; caption: string }> {
  const fallback = templateScene(c);
  if (!writer) return fallback;
  const style = isStyle(c.style) ? STYLES[c.style] : STYLES.meme;
  try {
    const out = (await writer.json(
      [
        `You write one ${style.label.toLowerCase()} for a short vertical TikTok about a Solana memecoin. Style: ${style.hint}.`,
        "Return a visual scene (what the camera sees in about five seconds, no on-screen text, no logos of real brands, no real people) and a TikTok caption under 150 characters that names the ticker.",
        "Never cite prices, market caps, percentages or gains. Never promise anything. Keep it playful.",
      ].join(" "),
      `Coin: ${c.name} ($${c.ticker}). About: ${c.description}. The launcher's direction: ${c.styleNote}. This is video number ${c.videoCount + 1}.`,
      "fypad_scene",
      SCENE_SCHEMA as unknown as Record<string, unknown>,
    )) as { scene?: string; caption?: string };
    const scene = stripFigures(String(out.scene ?? "")).slice(0, 600);
    const caption = stripFigures(String(out.caption ?? "")).slice(0, MAX_CAPTION_CHARS);
    return { scene: scene || fallback.scene, caption: caption || fallback.caption };
  } catch {
    return fallback;
  }
}

export function videoPrompt(c: CoinRow, scene: string): string {
  const style = isStyle(c.style) ? STYLES[c.style] : STYLES.meme;
  return `Vertical 9:16 social video, ${style.hint}. Subject: "${c.name}", an internet coin mascot. ${c.description}. Scene: ${scene}. Bold colors, punchy motion, no on-screen text, no real brand logos, no real people.`.slice(0, 1800);
}

// ───────────────────────────── generation

export interface Deps {
  maker?: VideoMaker | null;
  writer?: Writer | null;
  fetcher?: typeof fetch;
  now?: number;
}

const resolveMaker = (d: Deps) => (d.maker === undefined ? videoMaker(d.fetcher) : d.maker);
const resolveWriter = (d: Deps) => (d.writer === undefined ? openAiWriter(d.fetcher) : d.writer);

/** Starts one generation for a coin when its budget covers the cost. Returns null when the budget is short. */
export async function startVideo(db: DatabaseSync, c: CoinRow, deps: Deps = {}): Promise<VideoRow | null> {
  const maker = resolveMaker(deps);
  if (!maker) throw new HttpError(503, VIDEO_CLOSED);
  const cost = ENV.costPerVideo();
  if (!debitBudget(db, c.id, cost)) return null;
  const now = deps.now ?? Date.now();
  const { scene, caption } = await writeScene(c, resolveWriter(deps));
  const prompt = videoPrompt(c, scene);
  const v = insertVideo(db, { coinId: c.id, prompt, caption, provider: maker.name, cost: cost.toString(), createdAt: now });
  updateCoin(db, c.id, { videoCount: c.videoCount + 1 });
  try {
    const job = await maker.create(prompt, { idempotencyKey: v.id, webhookUrl: `${ENV.siteUrl()}/api/higgsfield/webhook` });
    if (job.status === "failed") {
      updateVideo(db, v.id, { jobId: job.id, status: "failed", error: job.error, doneAt: now });
      refundBudget(db, c.id, cost);
    } else updateVideo(db, v.id, { jobId: job.id, status: "running" });
  } catch {
    updateVideo(db, v.id, { status: "failed", error: "The video provider did not accept the job.", doneAt: now });
    refundBudget(db, c.id, cost);
  }
  return getVideo(db, v.id);
}

/** Advances one job: asks the provider, downloads the mp4 when ready, refunds the budget on failure. */
export async function pollVideo(db: DatabaseSync, id: string, deps: Deps = {}): Promise<VideoRow | null> {
  const v = getVideo(db, id);
  const maker = resolveMaker(deps);
  const now = deps.now ?? Date.now();
  if (!v || v.status !== "running" || !v.jobId || !maker || maker.name !== v.provider) return v;
  const fail = (error: string) => {
    updateVideo(db, id, { status: "failed", error, doneAt: now });
    refundBudget(db, v.coinId, BigInt(v.cost));
  };
  try {
    const job = await maker.get(v.jobId);
    if (job.status === "failed") fail(job.error ?? "The video model could not finish this clip.");
    else if (job.status === "completed") {
      const bytes = await maker.content(job);
      const file = `${v.id}.mp4`;
      writeFileSync(join(/* turbopackIgnore: true */ videoDir(), file), bytes);
      const c = getCoin(db, v.coinId);
      updateVideo(db, id, { status: "ready", file, doneAt: now, post: c && c.approve ? "draft" : "approved" });
    } else if (now - v.createdAt > JOB_TIMEOUT_MS) fail("The video provider timed out.");
  } catch {
    if (now - v.createdAt > JOB_TIMEOUT_MS) fail("The video provider timed out.");
    // otherwise: provider unreachable, the next tick retries
  }
  return getVideo(db, id);
}

/** Posts one approved video (coin has TikTok) or reads back a post in flight. */
export async function postStep(db: DatabaseSync, v: VideoRow, fetcher: typeof fetch = fetch, now = Date.now()): Promise<VideoRow | null> {
  if (!getTikTok(db, v.coinId)) return v;
  try {
    if (v.post === "approved") {
      const bytes = videoBytes(v);
      if (!bytes) {
        updateVideo(db, v.id, { post: "failed", postError: "The video file is gone from this server." });
      } else {
        const publishId = await publishVideo(db, v.coinId, bytes, v.caption, fetcher);
        updateVideo(db, v.id, { post: "posting", publishId, postError: null });
      }
    } else if (v.post === "posting" && v.publishId) {
      const s = await postStatus(db, v.coinId, v.publishId, fetcher);
      if (s.state === "published") updateVideo(db, v.id, { post: "published", postUrl: s.url, postedAt: now });
      else if (s.state === "failed") updateVideo(db, v.id, { post: "failed", postError: s.reason });
    }
  } catch (e) {
    updateVideo(db, v.id, { postError: e instanceof Error ? e.message.slice(0, 160) : "TikTok did not answer." });
  }
  return getVideo(db, v.id);
}

export function dueCoins(db: DatabaseSync, now = Date.now(), limit = 50): CoinRow[] {
  return db.prepare("SELECT * FROM coins WHERE paused = 0 AND nextVideoAt <= ? ORDER BY nextVideoAt LIMIT ?").all(now, limit) as unknown as CoinRow[];
}

export const intervalMs = (perDay: number) => Math.floor(86_400_000 / Math.min(3, Math.max(1, perDay)));

export interface TickResult {
  started: number;
  ready: number;
  posted: number;
  waiting: number;
  skipped: string | null;
}

export async function runTick(db: DatabaseSync = defaultDb(), deps: Deps = {}): Promise<TickResult> {
  const now = deps.now ?? Date.now();
  const out: TickResult = { started: 0, ready: 0, posted: 0, waiting: 0, skipped: null };
  kvSet(db, "lastTickTry", String(now));
  const lock = Number(kvGet(db, "tickLock") ?? 0);
  if (lock > 0 && now - lock < 90_000 && now >= lock) return { ...out, skipped: "a tick is already running" };
  kvSet(db, "tickLock", String(now));
  try {
    const maker = resolveMaker(deps);
    if (maker) {
      const cost = ENV.costPerVideo();
      for (const c of dueCoins(db, now)) {
        if (out.started >= TICK_MAX_STARTS) break;
        if (videosOf(db, c.id, 5).some((v) => v.status === "queued" || v.status === "running")) continue;
        if (budgetOf(c).balance < cost) {
          out.waiting++;
          continue; // stays due: it starts on the first tick after fees cover a video
        }
        const v = await startVideo(db, c, { ...deps, maker, now });
        if (v) {
          out.started++;
          updateCoin(db, c.id, { nextVideoAt: Math.max(c.nextVideoAt, now) + intervalMs(c.perDay) });
        }
      }
      for (const v of runningVideos(db, TICK_MAX_POLLS)) {
        const after = await pollVideo(db, v.id, { ...deps, maker, now });
        if (after?.status === "ready") out.ready++;
      }
    } else out.skipped = "no video provider key";
    for (const v of videosToPost(db, TICK_MAX_POLLS)) {
      const after = await postStep(db, v, deps.fetcher ?? fetch, now);
      if (after?.post === "published" && v.post !== "published") out.posted++;
    }
  } finally {
    kvSet(db, "tickLock", "0");
  }
  return out;
}

export function tickDue(db: DatabaseSync = defaultDb(), now = Date.now()): boolean {
  return now - Number(kvGet(db, "lastTickTry") ?? 0) > TICK_EVERY_MS;
}

// ───────────────────────────── launcher actions (manage page)

export function ownedCoin(db: DatabaseSync, owner: string | null, coinId: string): CoinRow {
  if (!owner) throw new HttpError(401, "Sign in with your wallet first.");
  const c = getCoin(db, coinId);
  if (!c) throw new HttpError(404, "Coin not found.");
  if (c.owner !== owner) throw new HttpError(403, "Only the coin's launcher can manage it.");
  return c;
}

export function approveVideo(db: DatabaseSync, owner: string | null, videoId: string): VideoRow {
  const v = getVideo(db, videoId);
  if (!v) throw new HttpError(404, "Video not found.");
  ownedCoin(db, owner, v.coinId);
  if (v.status !== "ready" || v.post !== "draft") throw new HttpError(400, "Only a finished draft can be approved.");
  updateVideo(db, v.id, { post: "approved" });
  return getVideo(db, v.id)!;
}

/** Discards the newest draft (if any) and starts a fresh generation now, once per REGENERATE_EVERY_MS. */
export async function regenerate(db: DatabaseSync, owner: string | null, coinId: string, deps: Deps = {}): Promise<VideoRow> {
  const c = ownedCoin(db, owner, coinId);
  const now = deps.now ?? Date.now();
  if (!resolveMaker(deps)) throw new HttpError(503, VIDEO_CLOSED);
  if (now - c.lastRegenAt < REGENERATE_EVERY_MS) throw new HttpError(429, "One regeneration every 30 minutes.");
  const recent = videosOf(db, c.id, 5);
  if (recent.some((v) => v.status === "queued" || v.status === "running")) throw new HttpError(409, "A video is already being made for this coin.");
  if (budgetOf(c).balance < ENV.costPerVideo()) throw new HttpError(402, "The content budget does not cover a video yet. It fills from trading fees.");
  const draft = recent.find((v) => v.status === "ready" && v.post === "draft");
  if (draft) updateVideo(db, draft.id, { post: "discarded" });
  updateCoin(db, c.id, { lastRegenAt: now });
  const v = await startVideo(db, c, deps);
  if (!v) throw new HttpError(402, "The content budget does not cover a video yet.");
  return v;
}
