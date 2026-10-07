/**
 * TikTok Content Posting API, Direct Post (https://developers.tiktok.com/doc/content-posting-api-get-started,
 * .../content-posting-api-reference-direct-post, .../content-posting-api-reference-query-creator-info,
 * .../content-posting-api-reference-get-video-status, .../oauth-user-access-token-management).
 *
 *  connect:   the coin's launcher (signed in) → TikTok authorize page (scope user.info.basic,video.publish)
 *             → /api/tiktok/callback?code&state → POST /v2/oauth/token/ → tokens encrypted at rest
 *             (AES-256-GCM, key = SHA-256(TOKEN_ENCRYPTION_SECRET)) → creator_info for the handle.
 *  post:      POST /v2/post/publish/creator_info/query/ → POST /v2/post/publish/video/init/ (FILE_UPLOAD, one
 *             chunk) → PUT upload_url → later ticks POST /v2/post/publish/status/fetch/ until PUBLISH_COMPLETE.
 *  refresh:   access tokens are refreshed with grant_type=refresh_token five minutes before they expire.
 *
 * Until TikTok audits the app, Direct Post only allows SELF_ONLY (private) posts and daily caps apply; we post
 * with the most private level the creator_info answer offers unless TIKTOK_PRIVACY_LEVEL names another one.
 * We never create TikTok accounts. TIKTOK_API_URL / TIKTOK_AUTHORIZE_URL exist for tests and the local rig.
 */
import type { DatabaseSync } from "node:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { ENV } from "../config/fypad.ts";
import { HttpError } from "./errors.ts";

export const TIKTOK_CLOSED = "TikTok connection is not available right now.";
export const SCOPES = "user.info.basic,video.publish";
const STATE_TTL_MS = 15 * 60_000;

export interface TikTokRow {
  coinId: string;
  openId: string;
  username: string | null;
  nickname: string | null;
  access: string;
  refresh: string;
  expiresAt: number;
  refreshExpiresAt: number;
  scope: string | null;
  privacyLevels: string | null;
  connectedAt: number;
}

// ───────────────────────────── encryption at rest

function key(): Buffer {
  const s = ENV.tokenSecret();
  if (!s) throw new HttpError(503, TIKTOK_CLOSED);
  return createHash("sha256").update(s).digest();
}

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${ct.toString("base64url")}`;
}

export function unseal(sealed: string): string {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("bad token box");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

// ───────────────────────────── rows

export function getTikTok(db: DatabaseSync, coinId: string): TikTokRow | null {
  return (db.prepare("SELECT * FROM tiktok WHERE coinId = ?").get(coinId) as unknown as TikTokRow | undefined) ?? null;
}

export const profileUrl = (username: string | null) => (username ? `https://www.tiktok.com/@${encodeURIComponent(username)}` : null);

export function tiktokReady(): boolean {
  return Boolean(ENV.tiktokClientKey() && ENV.tiktokClientSecret() && ENV.tokenSecret());
}

export const redirectUri = () => `${ENV.siteUrl()}/api/tiktok/callback`;

// ───────────────────────────── OAuth

/** The authorize URL for one coin; the state ties the answer to this coin and this launcher. */
export function authorizeUrl(db: DatabaseSync, coinId: string, wallet: string, now = Date.now()): string {
  if (!tiktokReady()) throw new HttpError(503, TIKTOK_CLOSED);
  const state = randomBytes(18).toString("base64url");
  db.prepare("DELETE FROM oauth_states WHERE createdAt < ?").run(now - STATE_TTL_MS);
  db.prepare("INSERT INTO oauth_states (state, coinId, wallet, createdAt) VALUES (?, ?, ?, ?)").run(state, coinId, wallet, now);
  const u = new URL(ENV.tiktokAuthorize());
  u.searchParams.set("client_key", ENV.tiktokClientKey()!);
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("state", state);
  return u.toString();
}

type TokenReply = { access_token?: string; refresh_token?: string; open_id?: string; expires_in?: number; refresh_expires_in?: number; scope?: string; error?: string; error_description?: string };

async function tokenCall(body: Record<string, string>, fetcher: typeof fetch): Promise<TokenReply> {
  const r = await fetcher(`${ENV.tiktokApi()}/v2/oauth/token/`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "cache-control": "no-cache" },
    body: new URLSearchParams({ client_key: ENV.tiktokClientKey()!, client_secret: ENV.tiktokClientSecret()!, ...body }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as TokenReply;
  if (!r.ok || !j.access_token) throw new Error(j.error_description || j.error || `token ${r.status}`);
  return j;
}

/** TikTok post ids are 64-bit integers: they are quoted before JSON.parse so no digit is lost. */
export function parseLossless(text: string): unknown {
  const quoted = text.replace(/("publicaly_available_post_id"\s*:\s*\[)([^\]]*)\]/g, (_m, head: string, list: string) =>
    `${head}${list.split(",").map((x) => x.trim()).filter(Boolean).map((x) => (x.startsWith('"') ? x : `"${x}"`)).join(",")}]`,
  );
  try {
    return JSON.parse(quoted) as unknown;
  } catch {
    return {};
  }
}

type Envelope<T> = { data?: T; error?: { code?: string; message?: string } };

async function api<T>(path: string, token: string, body: unknown, fetcher: typeof fetch): Promise<T> {
  const r = await fetcher(`${ENV.tiktokApi()}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json; charset=UTF-8" },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const j = parseLossless(await r.text()) as Envelope<T>;
  if (!r.ok || (j.error?.code && j.error.code !== "ok")) throw new Error(j.error?.message || j.error?.code || `tiktok ${r.status}`);
  return j.data as T;
}

type CreatorInfo = { creator_username?: string; creator_nickname?: string; privacy_level_options?: string[]; max_video_post_duration_sec?: number };

export function creatorInfo(token: string, fetcher: typeof fetch = fetch): Promise<CreatorInfo> {
  return api<CreatorInfo>("/v2/post/publish/creator_info/query/", token, null, fetcher);
}

/** Callback: checks the state, exchanges the code, stores encrypted tokens and the handle. Returns the coin id. */
export async function handleCallback(db: DatabaseSync, code: string, state: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<string> {
  if (!tiktokReady()) throw new HttpError(503, TIKTOK_CLOSED);
  const row = db.prepare("SELECT * FROM oauth_states WHERE state = ?").get(state) as { coinId: string; wallet: string; createdAt: number } | undefined;
  db.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
  if (!row || now - row.createdAt > STATE_TTL_MS) throw new HttpError(400, "This TikTok link expired. Start again from the manage page.");
  const owner = db.prepare("SELECT owner FROM coins WHERE id = ?").get(row.coinId) as { owner: string } | undefined;
  if (!owner || owner.owner !== row.wallet) throw new HttpError(403, "Only the coin's launcher can connect its TikTok.");
  let t: TokenReply;
  try {
    t = await tokenCall({ code, grant_type: "authorization_code", redirect_uri: redirectUri() }, fetcher);
  } catch {
    throw new HttpError(502, "TikTok did not accept the connection. Try again.");
  }
  if (!String(t.scope ?? SCOPES).includes("video.publish")) throw new HttpError(400, "TikTok did not grant posting. Allow video posting and try again.");
  const info = await creatorInfo(t.access_token!, fetcher).catch(() => ({}) as CreatorInfo);
  db.prepare(
    `INSERT INTO tiktok (coinId, openId, username, nickname, access, refresh, expiresAt, refreshExpiresAt, scope, privacyLevels, connectedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(coinId) DO UPDATE SET openId = excluded.openId, username = excluded.username, nickname = excluded.nickname, access = excluded.access,
       refresh = excluded.refresh, expiresAt = excluded.expiresAt, refreshExpiresAt = excluded.refreshExpiresAt, scope = excluded.scope,
       privacyLevels = excluded.privacyLevels, connectedAt = excluded.connectedAt`,
  ).run(
    row.coinId,
    String(t.open_id ?? ""),
    info.creator_username ?? null,
    info.creator_nickname ?? null,
    seal(t.access_token!),
    seal(String(t.refresh_token ?? "")),
    now + Number(t.expires_in ?? 86_400) * 1000,
    now + Number(t.refresh_expires_in ?? 31_536_000) * 1000,
    t.scope ?? null,
    JSON.stringify(info.privacy_level_options ?? []),
    now,
  );
  return row.coinId;
}

/** A valid access token for the coin, refreshed when it expires within five minutes. */
export async function accessToken(db: DatabaseSync, coinId: string, fetcher: typeof fetch = fetch, now = Date.now()): Promise<string | null> {
  const row = getTikTok(db, coinId);
  if (!row) return null;
  if (row.expiresAt - now > 5 * 60_000) return unseal(row.access);
  if (row.refreshExpiresAt <= now) return null;
  const t = await tokenCall({ grant_type: "refresh_token", refresh_token: unseal(row.refresh) }, fetcher);
  db.prepare("UPDATE tiktok SET access = ?, refresh = ?, expiresAt = ?, refreshExpiresAt = ? WHERE coinId = ?").run(
    seal(t.access_token!),
    seal(String(t.refresh_token ?? unseal(row.refresh))),
    now + Number(t.expires_in ?? 86_400) * 1000,
    t.refresh_expires_in ? now + Number(t.refresh_expires_in) * 1000 : row.refreshExpiresAt,
    coinId,
  );
  return t.access_token!;
}

/** Disconnect: revokes the token at TikTok (best effort) and forgets it. */
export async function disconnect(db: DatabaseSync, coinId: string, fetcher: typeof fetch = fetch) {
  const row = getTikTok(db, coinId);
  if (!row) return;
  try {
    await fetcher(`${ENV.tiktokApi()}/v2/oauth/revoke/`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_key: ENV.tiktokClientKey() ?? "", client_secret: ENV.tiktokClientSecret() ?? "", token: unseal(row.access) }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // forgotten locally either way
  }
  db.prepare("DELETE FROM tiktok WHERE coinId = ?").run(coinId);
}

/** The privacy level we post with: TIKTOK_PRIVACY_LEVEL when offered, else the most private one offered. */
export function pickPrivacy(options: string[]): string {
  const wanted = process.env["TIKTOK_PRIVACY_LEVEL"]?.trim();
  if (wanted && options.includes(wanted)) return wanted;
  for (const p of ["SELF_ONLY", "FOLLOWER_OF_CREATOR", "MUTUAL_FOLLOW_FRIENDS", "PUBLIC_TO_EVERYONE"]) if (options.includes(p)) return p;
  return "SELF_ONLY";
}

/** Starts a Direct Post of one mp4 (FILE_UPLOAD, one chunk). Returns the publish_id. */
export async function publishVideo(db: DatabaseSync, coinId: string, bytes: Buffer, caption: string, fetcher: typeof fetch = fetch): Promise<string> {
  const token = await accessToken(db, coinId, fetcher);
  if (!token) throw new Error("TikTok is not connected for this coin.");
  const info = await creatorInfo(token, fetcher);
  const init = await api<{ publish_id: string; upload_url: string }>(
    "/v2/post/publish/video/init/",
    token,
    {
      post_info: { title: caption, privacy_level: pickPrivacy(info.privacy_level_options ?? []), disable_duet: false, disable_comment: false, disable_stitch: false, video_cover_timestamp_ms: 1000, is_aigc: true },
      source_info: { source: "FILE_UPLOAD", video_size: bytes.length, chunk_size: bytes.length, total_chunk_count: 1 },
    },
    fetcher,
  );
  const up = await fetcher(init.upload_url, {
    method: "PUT",
    headers: { "content-type": "video/mp4", "content-length": String(bytes.length), "content-range": `bytes 0-${bytes.length - 1}/${bytes.length}` },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(45_000),
  });
  if (!up.ok) throw new Error(`upload ${up.status}`);
  if (info.creator_username) db.prepare("UPDATE tiktok SET username = ? WHERE coinId = ?").run(info.creator_username, coinId);
  return init.publish_id;
}

export type PostState = { state: "posting" } | { state: "published"; url: string | null } | { state: "failed"; reason: string };

/** Reads one publish job: PUBLISH_COMPLETE → published (+ post link when TikTok gives the id), FAILED → failed. */
export async function postStatus(db: DatabaseSync, coinId: string, publishId: string, fetcher: typeof fetch = fetch): Promise<PostState> {
  const token = await accessToken(db, coinId, fetcher);
  if (!token) return { state: "failed", reason: "TikTok was disconnected." };
  const d = await api<{ status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] }>("/v2/post/publish/status/fetch/", token, { publish_id: publishId }, fetcher);
  if (d.status === "PUBLISH_COMPLETE") {
    const user = getTikTok(db, coinId)?.username ?? null;
    const postId = d.publicaly_available_post_id?.[0];
    return { state: "published", url: postId && user ? `${profileUrl(user)}/video/${postId}` : profileUrl(user) };
  }
  if (d.status === "FAILED") return { state: "failed", reason: d.fail_reason || "TikTok refused the post." };
  return { state: "posting" };
}
