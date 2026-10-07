/**
 * FYPAD mechanic constants and env names. Imported by server modules (relative paths) and pages.
 * Every percentage and price below is also stated on /docs and on each coin page.
 */

/** Launching is free: the only transfer is the optional first buy. */
export const LAUNCH_FEE_LAMPORTS = BigInt(0);
/** Launches per wallet per 24 h. */
export const LAUNCHES_PER_DAY = 3;

/** % of every coin's creator fees that buys and burns $FYP (held until NEXT_PUBLIC_MINT is set). Fixed. */
export const PLATFORM_SHARE = 20;
/** The launcher splits the other 80 % between the content budget and themselves, in steps of 10. */
export const CONTENT_SHARE_MIN = 30;
export const CONTENT_SHARE_MAX = 80;
export const CONTENT_SHARE_DEFAULT = 60;
export const CONTENT_SHARE_OPTIONS = [30, 40, 50, 60, 70, 80] as const;

/** Videos per coin per day the launcher may pick. */
export const PER_DAY_OPTIONS = [1, 2, 3] as const;

/** Video styles (the launcher picks one; the sentence refines it). */
export const STYLES = {
  meme: { label: "Meme skit", hint: "a short absurd comedy skit, deadpan timing, one punchline" },
  hype: { label: "Hype edit", hint: "a fast hype edit, bold camera moves, beat-synced cuts, high energy" },
  presenter: { label: "Talking presenter", hint: "a presenter talking straight to the phone camera, selfie framing, expressive" },
} as const;
export type StyleKey = keyof typeof STYLES;
export const isStyle = (s: unknown): s is StyleKey => typeof s === "string" && s in STYLES;

/** Clip length (seconds) and frame. */
export const VIDEO_SECONDS = 5;
export const VIDEO_ASPECT = "9:16" as const;
/** Generations started per tick, and drafts polled per tick (serverless budget). */
export const TICK_MAX_STARTS = 3;
export const TICK_MAX_POLLS = 8;
/** A tick is due from a page load when the last one is older than this. */
export const TICK_EVERY_MS = 10 * 60_000;
/** A job not finished after this many ms is marked failed and its cost refunded to the budget. */
export const JOB_TIMEOUT_MS = 2 * 3600_000;
/** "Regenerate" from the manage page: once per 30 min per coin. */
export const REGENERATE_EVERY_MS = 30 * 60_000;
/** TikTok caption length we write (TikTok allows more; short reads better). */
export const MAX_CAPTION_CHARS = 150;

/** Smallest withdrawal: 0.001 SOL. */
export const MIN_PAYOUT_LAMPORTS = BigInt(1_000_000);
/** The operator's creator vault is collected above this: 0.002 SOL. */
export const MIN_CLAIM_LAMPORTS = BigInt(2_000_000);
/** The held platform share buys $FYP once it reaches this: 0.01 SOL. */
export const MIN_BURN_LAMPORTS = BigInt(10_000_000);
/** A fee sweep is due when the last one is older than this. */
export const SWEEP_EVERY_MS = 10 * 60_000;
/** Signatures read per coin per sweep. */
export const SIGS_PER_COIN = 200;
/** Upload limit. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Canonical SPL Memo v2 program id (https://spl.solana.com/memo). */
export const MEMO_PROGRAM = "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr";

const sol = (v: string | undefined, fallback: string) => {
  const n = Number(v?.trim() || fallback);
  return BigInt(Math.round((Number.isFinite(n) && n > 0 ? n : Number(fallback)) * 1e9));
};

export type VideoProvider = "higgsfield" | "openai";

export const ENV = {
  launchWebhook: () => process.env["LAUNCH_WEBHOOK"]?.trim() || null,
  launchSecret: () => process.env["LAUNCH_SECRET"]?.trim() || "",
  tickSecret: () => process.env["TICK_SECRET"]?.trim() || process.env["CRON_SECRET"]?.trim() || null,
  /** Video provider: higgsfield (default) or openai (Sora). */
  videoProvider: (): VideoProvider => (process.env["VIDEO_PROVIDER"]?.trim().toLowerCase() === "openai" ? "openai" : "higgsfield"),
  /** Higgsfield credentials: HIGGSFIELD_API_KEY (+ HIGGSFIELD_API_SECRET), or one "KEY_ID:KEY_SECRET". */
  higgsfieldCredentials: (): string | null => {
    const key = process.env["HIGGSFIELD_API_KEY"]?.trim();
    const secret = process.env["HIGGSFIELD_API_SECRET"]?.trim();
    if (key && secret) return `${key}:${secret}`;
    if (key && key.includes(":")) return key;
    return null;
  },
  higgsfieldBase: () => (process.env["HIGGSFIELD_BASE_URL"]?.trim() || "https://api.higgsfield.ai").replace(/\/$/, ""),
  higgsfieldModel: () => process.env["HIGGSFIELD_VIDEO_MODEL"]?.trim() || "bytedance/seedance-2.0/text-to-video",
  higgsfieldResolution: () => process.env["HIGGSFIELD_RESOLUTION"]?.trim() || "720p",
  openaiKey: () => process.env["OPENAI_API_KEY"]?.trim() || null,
  openaiBase: () => (process.env["OPENAI_BASE_URL"]?.trim() || "https://api.openai.com/v1").replace(/\/$/, ""),
  textModel: () => process.env["OPENAI_MODEL"]?.trim() || "gpt-4.1-mini",
  videoModel: () => process.env["OPENAI_VIDEO_MODEL"]?.trim() || "sora-2",
  /** Cost of one video debited from the coin's content budget. */
  costPerVideo: () => sol(process.env["COST_PER_VIDEO_SOL"], "0.05"),
  tiktokClientKey: () => process.env["TIKTOK_CLIENT_KEY"]?.trim() || null,
  tiktokClientSecret: () => process.env["TIKTOK_CLIENT_SECRET"]?.trim() || null,
  tiktokApi: () => (process.env["TIKTOK_API_URL"]?.trim() || "https://open.tiktokapis.com").replace(/\/$/, ""),
  tiktokAuthorize: () => process.env["TIKTOK_AUTHORIZE_URL"]?.trim() || "https://www.tiktok.com/v2/auth/authorize/",
  tokenSecret: () => process.env["TOKEN_ENCRYPTION_SECRET"]?.trim() || null,
  siteUrl: () => (process.env["NEXT_PUBLIC_SITE_URL"]?.trim() || "http://localhost:3954").replace(/\/$/, ""),
  jupiter: () => (process.env["JUPITER_API_URL"]?.trim() || "https://lite-api.jup.ag").replace(/\/$/, ""),
  platformMint: () => process.env["NEXT_PUBLIC_MINT"]?.trim() || null,
  videoDir: () => process.env["FYPAD_VIDEO_DIR"]?.trim() || null,
} as const;

/** Splits one creator fee: platform PLATFORM_SHARE %, content contentPct %, the launcher gets the rest (rounding included). */
export function splitFee(lamports: bigint, contentPct: number): { owner: bigint; content: bigint; platform: bigint } {
  const platform = (lamports * BigInt(PLATFORM_SHARE)) / BigInt(100);
  const content = (lamports * BigInt(contentPct)) / BigInt(100);
  return { owner: lamports - platform - content, content, platform };
}

export function cleanContentPct(v: unknown): number {
  const n = Math.round(Number(v ?? CONTENT_SHARE_DEFAULT) / 10) * 10;
  return Math.min(CONTENT_SHARE_MAX, Math.max(CONTENT_SHARE_MIN, Number.isFinite(n) ? n : CONTENT_SHARE_DEFAULT));
}
