import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { Keypair, PublicKey, Transaction, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { LAUNCHES_PER_DAY, PLATFORM_SHARE, cleanContentPct, splitFee } from "../src/config/fypad.ts";
import { burnBook, runBurn } from "../src/server/burn.ts";
import { ataAddress, clearChainCache, connection } from "../src/server/chain.ts";
import { openDb } from "../src/server/db.ts";
import { HttpError } from "../src/server/errors.ts";
import { higgsfield } from "../src/server/higgsfield.ts";
import { LAUNCH_CLOSED, prepareLaunch, submitLaunch } from "../src/server/launch.ts";
import type { LaunchInput } from "../src/server/launch.ts";
import { createAtaIdempotentIx, listLedger } from "../src/server/operator.ts";
import { bondingCurvePda } from "../src/server/pump/instructions.ts";
import { encodeTradeEvent } from "../src/server/pump/events.ts";
import { attribute, withdraw } from "../src/server/rewards.ts";
import { budgetOf, getCoin, getVideo, insertCoin, kvSet, ownerBalance, readyVideos, updateCoin } from "../src/server/store.ts";
import type { NewCoin } from "../src/server/store.ts";
import { TIKTOK_CLOSED, accessToken, authorizeUrl, disconnect, getTikTok, handleCallback, seal, unseal } from "../src/server/tiktok.ts";
import { VIDEO_CLOSED, approveVideo, dueCoins, regenerate, runTick, stripFigures, tickDue, videoBytes, videoMaker } from "../src/server/videogen.ts";
import { HF_CREDS, startFakeApis } from "./fake-apis.ts";
import { SYSTEM, TOKEN, startFakeRpc, tokenAccountData } from "./fake-rpc.ts";

process.env.FYPAD_DB_PATH = join(tmpdir(), `fypad-test-${process.pid}.db`);
process.env.FYPAD_VIDEO_DIR = join(tmpdir(), `fypad-test-videos-${process.pid}`);
const rpc = await startFakeRpc();
const apis = await startFakeApis();
const operator = Keypair.generate();
const OP = operator.publicKey.toBase58();
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const COST = BigInt(50_000_000); // COST_PER_VIDEO_SOL default 0.05

const code = async (p: Promise<unknown>) => p.then(() => 200, (e: HttpError) => e.status ?? 500);

function useHiggsfield() {
  process.env.HIGGSFIELD_API_KEY = HF_CREDS.split(":")[0];
  process.env.HIGGSFIELD_API_SECRET = HF_CREDS.split(":")[1];
  process.env.HIGGSFIELD_BASE_URL = `${apis.url}/hf`;
}
function useTikTok() {
  process.env.TIKTOK_CLIENT_KEY = "fake-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "fake-client-secret";
  process.env.TOKEN_ENCRYPTION_SECRET = "test-token-secret-0123456789";
  process.env.TIKTOK_API_URL = `${apis.url}/tt`;
  process.env.TIKTOK_AUTHORIZE_URL = `${apis.url}/tt/authorize`;
}

before(() => {
  process.env.SOLANA_RPC_URL = rpc.url;
  process.env.SOLANA_CLUSTER = "devnet";
  process.env.OPERATOR_SECRET_KEY = bs58.encode(operator.secretKey);
  for (const k of ["OPENAI_API_KEY", "NEXT_PUBLIC_MINT", "HIGGSFIELD_API_KEY", "HIGGSFIELD_API_SECRET", "VIDEO_PROVIDER", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TOKEN_ENCRYPTION_SECRET", "COST_PER_VIDEO_SOL"]) delete process.env[k];
  rpc.state.accounts.set(OP, { lamports: 5_000_000_000, owner: SYSTEM });
});
beforeEach(() => clearChainCache());
after(async () => {
  await rpc.close();
  await apis.close();
});

const coin = (over: Partial<NewCoin> = {}): NewCoin => ({
  mint: Keypair.generate().publicKey.toBase58(),
  name: "Frog Taxes",
  ticker: "FROG",
  description: "A frog who files everyone's taxes.",
  style: "meme",
  styleNote: "deadpan frog in a tiny office",
  perDay: 2,
  contentPct: 60,
  imageId: null,
  owner: Keypair.generate().publicKey.toBase58(),
  creator: OP,
  launchSig: null,
  website: null,
  xUrl: null,
  nextVideoAt: 0,
  ...over,
});

function seedTrades(mint: string, creator: string, n: number, fee: bigint, tag: string) {
  const curve = bondingCurvePda(new PublicKey(mint)).toBase58();
  const list = rpc.state.sigsFor.get(curve) ?? [];
  for (let i = 0; i < n; i++) {
    const sig = bs58.encode(Buffer.from(`${tag}-${i}-${mint}`.padEnd(64, "x").slice(0, 64)));
    rpc.state.txs.set(sig, { slot: 2000 + list.length, logs: ["Program 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P invoke [1]", encodeTradeEvent({ mint, user: OP, creator, solAmount: fee * BigInt(100), creatorFee: fee })] });
    list.unshift(sig);
  }
  rpc.state.sigsFor.set(curve, list);
}

async function pay(b64: string, kp: Keypair): Promise<string> {
  const tx = Transaction.from(Buffer.from(b64, "base64"));
  tx.partialSign(kp);
  return connection().sendRawTransaction(tx.serialize());
}

const INPUT: LaunchInput = { name: "Frog Taxes", ticker: "$frog", imageDataUrl: PNG, description: "A frog who files everyone's taxes.", style: "presenter", styleNote: "a frog accountant explains a tax form to camera", perDay: 3, contentPct: 70, x: "x.com/frogtaxes" };

// ───────────────────────── config

test("fee split: 20 % platform fixed, content share 30–80 % in steps of 10, launcher gets the rest", () => {
  assert.equal(PLATFORM_SHARE, 20);
  assert.deepEqual(splitFee(BigInt(1000), 60), { owner: BigInt(200), content: BigInt(600), platform: BigInt(200) });
  assert.deepEqual(splitFee(BigInt(1000), 80), { owner: BigInt(0), content: BigInt(800), platform: BigInt(200) });
  assert.deepEqual(splitFee(BigInt(7), 30), { owner: BigInt(4), content: BigInt(2), platform: BigInt(1) }, "rounding goes to the launcher");
  assert.equal(cleanContentPct(95), 80);
  assert.equal(cleanContentPct(12), 30);
  assert.equal(cleanContentPct("44"), 40);
});

test("figure stripping: sentences with $ amounts, % or multiples go; tickers stay", () => {
  assert.equal(stripFigures("Meet $FROG. Up 500% this week. It will hit $1M soon. AI video."), "Meet $FROG. AI video.");
  assert.equal(stripFigures("Easy 10x. Frog files taxes."), "Frog files taxes.");
});

// ───────────────────────── launch

test("launch: sign-in required; no webhook → neutral sentence and nothing stored", async () => {
  const db = openDb(":memory:");
  process.env.LAUNCH_WEBHOOK = `${apis.url}/engine`;
  assert.equal(await code(prepareLaunch(null, INPUT, db)), 401);
  delete process.env.LAUNCH_WEBHOOK;
  await assert.rejects(prepareLaunch(Keypair.generate().publicKey.toBase58(), INPUT, db), (e: HttpError) => e.message === LAUNCH_CLOSED);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM launches").get() as { n: number }).n, 0);
});

test("launch validates the video setup: style, sentence, 1–3 a day, image", async () => {
  process.env.LAUNCH_WEBHOOK = `${apis.url}/engine`;
  const db = openDb(":memory:");
  const L = Keypair.generate().publicKey.toBase58();
  assert.equal(await code(prepareLaunch(L, { ...INPUT, style: "dance" }, db)), 400);
  assert.equal(await code(prepareLaunch(L, { ...INPUT, perDay: 5 }, db)), 400);
  assert.equal(await code(prepareLaunch(L, { ...INPUT, styleNote: "" }, db)), 400);
  assert.equal(await code(prepareLaunch(L, { ...INPUT, imageDataUrl: "data:text/html;base64,AAAA" }, db)), 400);
});

test("launch (free, then with a first buy): webhook gets identity + image, coin stored with its video setup; daily cap", async () => {
  process.env.LAUNCH_WEBHOOK = `${apis.url}/engine`;
  process.env.LAUNCH_SECRET = "s3cret";
  const db = openDb(":memory:");
  const L = Keypair.generate().publicKey.toBase58();
  const prep = await prepareLaunch(L, INPUT, db);
  assert.equal(prep.transaction, null);
  apis.state.engine.mint = Keypair.generate().publicKey.toBase58();
  const out = await submitLaunch(L, prep.id, null, db);
  const body = apis.state.engine.bodies.at(-1)!;
  assert.equal(apis.state.engine.secret.at(-1), "s3cret");
  assert.equal(body.ticker, "FROG");
  assert.match(String(body.imageDataUrl), /^data:image\/png;base64,/);
  assert.equal(body.twitter, "https://x.com/frogtaxes");
  assert.equal(out.coin.owner, L);
  assert.equal(out.coin.creator, OP, "blank creator → operator is creator of record");
  assert.equal(out.coin.style, "presenter");
  assert.equal(out.coin.perDay, 3);
  assert.equal(out.coin.contentPct, 70);
  assert.equal(out.coin.approve, 1, "approve-before-post is ON by default");
  const calls = apis.state.engine.calls;
  await submitLaunch(L, prep.id, null, db);
  assert.equal(apis.state.engine.calls, calls, "same request twice → engine called once");
  // first buy
  const launcher = Keypair.generate();
  const L2 = launcher.publicKey.toBase58();
  rpc.state.accounts.set(L2, { lamports: 2_000_000_000, owner: SYSTEM });
  const p2 = await prepareLaunch(L2, { ...INPUT, firstBuySol: "0.1" }, db);
  assert.ok(p2.transaction);
  assert.equal(await code(submitLaunch(L2, p2.id, null, db)), 400);
  const sig = await pay(p2.transaction!, launcher);
  apis.state.engine.mint = Keypair.generate().publicKey.toBase58();
  await submitLaunch(L2, p2.id, sig, db);
  assert.equal(apis.state.engine.bodies.at(-1)!.firstBuyLamports, "100000000");
  assert.ok(listLedger(db).some((r) => r.kind === "launch-in" && r.amount === "100000000"));
  for (let i = 1; i < LAUNCHES_PER_DAY; i++) await prepareLaunch(L2, INPUT, db);
  assert.equal(await code(prepareLaunch(L2, INPUT, db)), 429);
});

// ───────────────────────── fees → content budget

test("sweep: each fee split launcher / content budget / platform; idempotent; other creators ignored; withdraw", async () => {
  const db = openDb(":memory:");
  const c = insertCoin(db, coin({ contentPct: 60 }));
  seedTrades(c.mint, OP, 4, BigInt(10_000_000), "a");
  seedTrades(c.mint, Keypair.generate().publicKey.toBase58(), 1, BigInt(90_000_000), "other");
  const r = await attribute(db);
  assert.equal(r.events, 4);
  assert.equal(r.contentLamports, BigInt(24_000_000));
  assert.equal(r.ownerLamports, BigInt(8_000_000));
  assert.equal(r.platformLamports, BigInt(8_000_000));
  assert.equal((await attribute(db)).events, 0);
  assert.equal(budgetOf(getCoin(db, c.id)!).balance, BigInt(24_000_000));
  assert.equal(burnBook(db).held, BigInt(8_000_000));
  const sent: [string, bigint][] = [];
  const w = await withdraw(c.owner, db, async (to, l) => {
    sent.push([to, l]);
    return { sig: "paySig", status: "confirmed" };
  });
  assert.equal(w.lamports, "8000000");
  assert.equal(ownerBalance(db, c.owner).available, BigInt(0));
});

// ───────────────────────── generation

test("no provider key → tick generates nothing; regenerate answers the neutral sentence", async () => {
  delete process.env.HIGGSFIELD_API_KEY;
  delete process.env.HIGGSFIELD_API_SECRET;
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  updateCoin(db, c.id, { budgetIn: "1000000000" });
  assert.equal(videoMaker(), null);
  const r = await runTick(db);
  assert.equal(r.skipped, "no video provider key");
  assert.equal(r.started, 0);
  await assert.rejects(regenerate(db, c.owner, c.id), (e: HttpError) => e.message === VIDEO_CLOSED);
});

test("Higgsfield adapter: POST endpoint with Key auth + idempotency + 9:16 body, status polled, mp4 downloaded", async () => {
  useHiggsfield();
  const hf = higgsfield()!;
  const job = await hf.create("a frog stamps a form", { idempotencyKey: "vid-1", webhookUrl: "http://localhost/hook" });
  assert.equal(job.status, "queued");
  const last = apis.state.hf.bodies.at(-1)!;
  assert.equal(last.endpoint, "bytedance/seedance-2.0/text-to-video");
  assert.equal(last.aspect_ratio, "9:16");
  assert.equal(last.duration, 5);
  assert.equal(apis.state.hf.auth.at(-1), `Key ${HF_CREDS}`);
  assert.equal(apis.state.hf.idem.at(-1), "vid-1");
  assert.equal((await hf.get(job.id)).status, "in_progress");
  const done = await hf.get(job.id);
  assert.equal(done.status, "completed");
  assert.equal((await hf.content(done)).toString(), `fake-mp4:${job.id}.mp4`);
});

test("tick: waits on an empty budget; starts when fees cover a video; polls across ticks; draft waits for approval", async () => {
  useHiggsfield();
  const db = openDb(":memory:");
  const c = insertCoin(db, coin({ perDay: 2 }));
  const t0 = 1_800_000_000_000;
  let r = await runTick(db, { now: t0, writer: null });
  assert.equal(r.waiting, 1);
  assert.equal(r.started, 0);
  assert.equal(dueCoins(db, t0).length, 1, "still due: it starts as soon as fees arrive");
  updateCoin(db, c.id, { budgetIn: (COST + BigInt(10)).toString() });
  r = await runTick(db, { now: t0 + 1, writer: null });
  assert.equal(r.started, 1);
  let c2 = getCoin(db, c.id)!;
  assert.equal(budgetOf(c2).balance, BigInt(10), "cost debited at start");
  assert.equal(c2.nextVideoAt, t0 + 1 + 43_200_000, "2 a day → next in 12 h");
  const vid = db.prepare("SELECT id FROM videos WHERE coinId = ?").get(c.id) as { id: string };
  assert.equal(getVideo(db, vid.id)!.status, "running");
  // the first poll of that tick saw in_progress; the next tick completes it
  r = await runTick(db, { now: t0 + 2, writer: null });
  assert.equal(r.ready, 1);
  const v = getVideo(db, vid.id)!;
  assert.equal(v.status, "ready");
  assert.equal(v.post, "draft");
  assert.ok(videoBytes(v)?.toString().startsWith("fake-mp4:"));
  assert.equal(readyVideos(db, 10, c.id).length, 0, "a draft is not on the public wall");
  assert.equal(await code(Promise.resolve().then(() => approveVideo(db, Keypair.generate().publicKey.toBase58(), v.id))), 403);
  approveVideo(db, c.owner, v.id);
  assert.equal(readyVideos(db, 10, c.id).length, 1);
  c2 = getCoin(db, c.id)!;
  assert.equal(c2.videoCount, 1);
});

test("tick: a failed (nsfw) job refunds the content budget; approve OFF → auto-approved", async () => {
  useHiggsfield();
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  updateCoin(db, c.id, { budgetIn: (COST * BigInt(2)).toString(), approve: 0 });
  apis.state.hf.fail = "nsfw";
  await runTick(db, { now: 1, writer: null });
  await runTick(db, { now: 2, writer: null });
  apis.state.hf.fail = null;
  const failed = db.prepare("SELECT * FROM videos WHERE coinId = ?").get(c.id) as { status: string; error: string };
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /moderation/);
  assert.equal(budgetOf(getCoin(db, c.id)!).balance, COST * BigInt(2), "refunded");
  const v = await regenerate(db, c.owner, c.id, { now: 10_000_000, writer: null });
  await runTick(db, { now: 10_000_001, writer: null });
  await runTick(db, { now: 10_000_002, writer: null });
  assert.equal(getVideo(db, v.id)!.post, "approved");
  assert.equal(await code(regenerate(db, c.owner, c.id, { now: 10_000_003, writer: null })), 429);
});

test("scene writer (fake OpenAI json_schema): invented $ and % sentences are stripped from the caption and prompt", async () => {
  useHiggsfield();
  process.env.OPENAI_API_KEY = "fake";
  process.env.OPENAI_BASE_URL = `${apis.url}/v1`;
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  updateCoin(db, c.id, { budgetIn: COST.toString() });
  await runTick(db, { now: 5 });
  const v = db.prepare("SELECT * FROM videos WHERE coinId = ?").get(c.id) as { caption: string; prompt: string };
  assert.equal(v.caption, "Meet $FROG, the frog who files taxes. AI video.");
  assert.ok(!v.prompt.includes("$1M") && v.prompt.includes("stamps paperwork"));
  delete process.env.OPENAI_API_KEY;
});

test("VIDEO_PROVIDER=openai: Sora through the SDK against the fake (create → retrieve → download)", async () => {
  process.env.VIDEO_PROVIDER = "openai";
  process.env.OPENAI_API_KEY = "fake";
  process.env.OPENAI_BASE_URL = `${apis.url}/v1`;
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  updateCoin(db, c.id, { budgetIn: COST.toString() });
  await runTick(db, { now: 7, writer: null });
  await runTick(db, { now: 8, writer: null });
  const v = db.prepare("SELECT * FROM videos WHERE coinId = ?").get(c.id) as { id: string; provider: string; status: string };
  assert.equal(v.provider, "openai");
  assert.equal(v.status, "ready");
  assert.equal(videoBytes(getVideo(db, v.id)!)?.toString(), "fake-sora-mp4");
  delete process.env.VIDEO_PROVIDER;
  delete process.env.OPENAI_API_KEY;
});

// ───────────────────────── TikTok

test("token box: AES-GCM round trip, tamper detected; no secret → neutral sentence", () => {
  useTikTok();
  const s = seal("act.secret");
  assert.ok(!s.includes("act.secret"));
  assert.equal(unseal(s), "act.secret");
  const parts = s.split(".");
  parts[3] = Buffer.from("tampered").toString("base64url");
  assert.throws(() => unseal(parts.join(".")));
  delete process.env.TOKEN_ENCRYPTION_SECRET;
  const db = openDb(":memory:");
  assert.throws(() => authorizeUrl(db, "x", "y"), (e: HttpError) => e.message === TIKTOK_CLOSED);
});

test("TikTok: launcher-only OAuth with state, tokens encrypted, refresh, Direct Post FILE_UPLOAD, status → published with link, disconnect", async () => {
  useHiggsfield();
  useTikTok();
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  const T = Date.now();
  const url = new URL(authorizeUrl(db, c.id, c.owner, T));
  assert.equal(url.searchParams.get("scope"), "user.info.basic,video.publish");
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3954/api/tiktok/callback");
  const state = url.searchParams.get("state")!;
  // wrong code → refused; the state is single-use
  await assert.rejects(handleCallback(db, "bad", state, fetch, T + 1));
  const u2 = new URL(authorizeUrl(db, c.id, c.owner, T + 2));
  // a stranger's state for this coin is refused
  const u3 = new URL(authorizeUrl(db, c.id, Keypair.generate().publicKey.toBase58(), T + 2));
  assert.equal(await code(handleCallback(db, "fake-code", u3.searchParams.get("state")!, fetch, T + 3)), 403);
  assert.equal(await handleCallback(db, "fake-code", u2.searchParams.get("state")!, fetch, T + 3), c.id);
  const row = getTikTok(db, c.id)!;
  assert.equal(row.username, "fypad.frog");
  assert.ok(!row.access.startsWith("act."), "stored encrypted");
  // refresh when close to expiry
  const before = apis.state.tt.refreshes;
  await accessToken(db, c.id, fetch, row.expiresAt - 60_000);
  assert.equal(apis.state.tt.refreshes, before + 1);
  // a ready, approved video goes out
  updateCoin(db, c.id, { budgetIn: COST.toString(), approve: 0 });
  await runTick(db, { now: T + 4000, writer: null });
  await runTick(db, { now: T + 4001, writer: null }); // ready + approved + posted (init + upload)
  const v = db.prepare("SELECT * FROM videos WHERE coinId = ?").get(c.id) as { id: string; post: string; publishId: string };
  assert.equal(v.post, "posting");
  const init = apis.state.tt.inits.at(-1) as { post_info: { privacy_level: string; is_aigc: boolean }; source_info: { source: string; total_chunk_count: number; video_size: number } };
  assert.equal(init.post_info.privacy_level, "SELF_ONLY");
  assert.equal(init.post_info.is_aigc, true);
  assert.equal(init.source_info.source, "FILE_UPLOAD");
  assert.equal(init.source_info.total_chunk_count, 1);
  const up = apis.state.tt.uploads.at(-1)!;
  assert.equal(up.range, `bytes 0-${init.source_info.video_size - 1}/${init.source_info.video_size}`);
  apis.state.tt.statusCalls = 0;
  await runTick(db, { now: T + 4002, writer: null }); // PROCESSING_UPLOAD
  await runTick(db, { now: T + 4003, writer: null }); // PUBLISH_COMPLETE
  const done = getVideo(db, v.id)!;
  assert.equal(done.post, "published");
  assert.equal(done.postUrl, "https://www.tiktok.com/@fypad.frog/video/7300000000000000001");
  await disconnect(db, c.id);
  assert.equal(getTikTok(db, c.id), null);
  assert.ok(apis.state.tt.revoked >= 1);
});

test("tick due after 10 minutes", () => {
  const db = openDb(":memory:");
  kvSet(db, "lastTickTry", "1000");
  assert.equal(tickDue(db, 1000 + 60_000), false);
  assert.equal(tickDue(db, 1000 + 11 * 60_000), true);
});

// ───────────────────────── buy & burn

test("buy & burn: held without a mint; with $FYP set, Jupiter (mocked) swap simulated, exact bought amount burned, both on the ledger", async () => {
  const db = openDb(":memory:");
  const c = insertCoin(db, coin());
  seedTrades(c.mint, OP, 10, BigInt(10_000_000), "burn");
  await attribute(db);
  kvSet(db, "claimedLamports", "1000000000");
  assert.deepEqual(await runBurn(db), { skipped: "held: $FYP mint not set" });
  const fyp = Keypair.generate().publicKey;
  const FYP = fyp.toBase58();
  process.env.NEXT_PUBLIC_MINT = FYP;
  rpc.state.accounts.set(FYP, { lamports: 1_461_600, owner: TOKEN, data: (await import("./fake-rpc.ts")).mintData(6, BigInt(1e15)) });
  rpc.state.supply.set(FYP, { amount: BigInt(1e15), decimals: 6 });
  const pool = Keypair.generate();
  const tok = new PublicKey(TOKEN);
  const poolAta = ataAddress(pool.publicKey, fyp, tok);
  const opAta = ataAddress(operator.publicKey, fyp, tok);
  rpc.state.accounts.set(poolAta.toBase58(), { lamports: 2_039_280, owner: TOKEN, data: tokenAccountData(FYP, pool.publicKey.toBase58(), BigInt(1e12)) });
  const jup = (async (url: string) => {
    if (String(url).includes("/quote")) return Response.json({ outAmount: "777000" });
    const { blockhash } = await connection().getLatestBlockhash();
    const msg = new TransactionMessage({
      payerKey: operator.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        createAtaIdempotentIx(operator.publicKey, opAta, operator.publicKey, fyp, tok),
        new TransactionInstruction({ programId: tok, keys: [{ pubkey: poolAta, isSigner: false, isWritable: true }, { pubkey: fyp, isSigner: false, isWritable: false }, { pubkey: opAta, isSigner: false, isWritable: true }, { pubkey: pool.publicKey, isSigner: true, isWritable: false }], data: Buffer.concat([Buffer.from([12]), Buffer.from(new BigUint64Array([BigInt(777000)]).buffer), Buffer.from([6])]) }),
      ],
    }).compileToV0Message();
    return Response.json({ swapTransaction: Buffer.from(new VersionedTransaction(msg).serialize()).toString("base64") });
  }) as unknown as typeof fetch;
  const r = await runBurn(db, jup);
  assert.ok("burnSig" in r && r.burnSig, JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
  const kinds = listLedger(db).map((x) => x.kind);
  assert.ok(kinds.includes("buy") && kinds.includes("burn"));
  delete process.env.NEXT_PUBLIC_MINT;
});

test("video files land in FYPAD_VIDEO_DIR", () => {
  assert.ok(existsSync(process.env.FYPAD_VIDEO_DIR!));
  assert.ok(readFileSync !== undefined);
});
