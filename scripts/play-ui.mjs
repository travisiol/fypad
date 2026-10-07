/**
 * Plays the FYPAD flow in headless Chrome over CDP against a local rig (no network, no real keys):
 *
 *   empty home → connect + sign in ("Fypad Test" stub wallet) → /launch wizard (identity + image upload → style →
 *   2 a day → 60 % content → 0.1 SOL first buy, signed by the stub wallet; local engine answers a mint) → coin page
 *   (budget 0, waiting for fees) → canned pump.fun trades + /api/sweep (fees split; content budget credited) →
 *   /api/tick ×2 (fake Higgsfield job created, polled, mp4 stored → draft) → manage: Connect TikTok (fake OAuth
 *   authorize → our callback → tokens stored) → approve the draft → ticks post it (fake Direct Post init + upload +
 *   status) → coin page shows the video with "On TikTok" and its link → explore, for you, ledger, home.
 *
 *   npx next build && node scripts/play-ui.mjs
 *
 * Fake chain = tests/fake-rpc.ts on 8954; fake Higgsfield / TikTok / engine = tests/fake-apis.ts (OS port).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair, PublicKey } from "@solana/web3.js";
import { HF_CREDS, newApiState, startFakeApis } from "../tests/fake-apis.ts";
import { mintData, startFakeRpc, SYSTEM, TOKEN } from "../tests/fake-rpc.ts";
import { encodeTradeEvent } from "../src/server/pump/events.ts";

const PORT = 3954;
const RPC_PORT = 8954;
const base = `http://localhost:${PORT}`;
const root = resolve(import.meta.dirname, "..");
const shots = join(root, "shots");
mkdirSync(shots, { recursive: true });
mkdirSync(join(root, "data"), { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
};

// ── keys
const w1 = nacl.sign.keyPair().secretKey;
const A1 = bs58.encode(w1.slice(32));
const operator = Keypair.generate();
const OP = operator.publicKey.toBase58();
const MINT = Keypair.generate().publicKey.toBase58();
const PUMP = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");
console.log("launcher:", A1, "operator:", OP, "mint:", MINT);

// ── fake chain + fake APIs
const fake = await startFakeRpc(undefined, RPC_PORT);
fake.state.accounts.set(A1, { lamports: 2_500_000_000, owner: SYSTEM });
fake.state.accounts.set(OP, { lamports: 5_000_000_000, owner: SYSTEM });
const apiState = newApiState(MINT);
apiState.engine.onLaunch = (mint) => fake.state.accounts.set(mint, { lamports: 1_461_600, owner: TOKEN, data: mintData(6, BigInt(1e15)) });
const apis = await startFakeApis(apiState);

// ── a visible PNG for the coin image (a pink frog-ish blob on ink)
function png(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      const d = Math.hypot(x - w / 2, y - h / 2) / (w * 0.34);
      const c = d < 1 ? [255, 45, 111] : d < 1.08 ? [44, 240, 230] : [10, 10, 12];
      raw[o] = c[0];
      raw[o + 1] = c[1];
      raw[o + 2] = c[2];
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const imgPath = join(tmpdir(), `fypad-play-coin-${process.pid}.png`);
writeFileSync(imgPath, png(256, 256));

// ── server
const dbPath = join(root, "data", "play.db");
const videoDir = join(root, "data", "play-videos");
for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`]) rmSync(f, { force: true });
rmSync(videoDir, { recursive: true, force: true });
const nextBin = join(root, "node_modules", "next", "dist", "bin", "next");
const env = { ...process.env };
for (const k of ["OPENAI_API_KEY", "NEXT_PUBLIC_MINT", "VIDEO_PROVIDER"]) delete env[k];
const server = spawn(process.execPath, [nextBin, "start", "-p", String(PORT)], {
  cwd: root,
  env: {
    ...env,
    SOLANA_RPC_URL: fake.url,
    FYPAD_DB_PATH: dbPath,
    FYPAD_VIDEO_DIR: videoDir,
    OPERATOR_SECRET_KEY: bs58.encode(operator.secretKey),
    LAUNCH_WEBHOOK: `${apis.url}/engine`,
    LAUNCH_SECRET: "play-secret",
    TICK_SECRET: "play-tick",
    SESSION_SECRET: "play-session-secret-play-session-secret-0000",
    HIGGSFIELD_API_KEY: HF_CREDS.split(":")[0],
    HIGGSFIELD_API_SECRET: HF_CREDS.split(":")[1],
    HIGGSFIELD_BASE_URL: `${apis.url}/hf`,
    TIKTOK_CLIENT_KEY: "fake-client-key",
    TIKTOK_CLIENT_SECRET: "fake-client-secret",
    TOKEN_ENCRYPTION_SECRET: "play-token-secret-0123456789",
    TIKTOK_API_URL: `${apis.url}/tt`,
    TIKTOK_AUTHORIZE_URL: `${apis.url}/tt/authorize`,
    NEXT_PUBLIC_SITE_URL: base,
    PUMP_API_URL: apis.url,
    DEXSCREENER_API_URL: apis.url,
    JUPITER_API_URL: `${apis.url}/jup`,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
server.stderr.on("data", (d) => process.stderr.write(`[next] ${d}`));
for (let i = 0; i < 120; i++) {
  try {
    if ((await fetch(`${base}/api/health`)).ok) break;
  } catch {}
  await sleep(500);
}

// ── chrome
const chromePath = [process.env.CHROME_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"].find((p) => p && existsSync(p));
const profile = join(tmpdir(), `fypad-play-${Date.now()}`);
const chrome = spawn(chromePath, ["--headless=new", "--no-first-run", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--hide-scrollbars", "--use-angle=swiftshader", "--window-size=1536,960", "about:blank"], { stdio: "ignore" });
let cdpPort = null;
for (let i = 0; i < 100 && !cdpPort; i++) {
  try {
    cdpPort = Number(readFileSync(join(profile, "DevToolsActivePort"), "utf8").split("\n")[0]) || null;
  } catch {}
  if (!cdpPort) await sleep(150);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id && this.pending.has(m.id)) {
        const { res, rej } = this.pending.get(m.id);
        this.pending.delete(m.id);
        if (m.error) rej(new Error(m.error.message));
        else res(m.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((res, rej) => this.pending.set(id, { res, rej }));
  }
}

const tick = async () => (await fetch(`${base}/api/tick`, { method: "POST", headers: { "x-tick-secret": "play-tick" } })).json();

async function main() {
  const target = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r));
  const cdp = new Cdp(ws);
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 960, deviceScaleFactor: 1, mobile: false });
  const naclSrc = readFileSync(join(root, "node_modules", "tweetnacl", "nacl-fast.min.js"), "utf8");
  const wallet = readFileSync(join(root, "scripts", "dev-wallet.js"), "utf8");
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", { source: `${naclSrc}\n;window.FYPAD_TEST_SECRET=${JSON.stringify(Array.from(w1))};window.FYPAD_TEST_RPC=${JSON.stringify(fake.url)};\n${wallet}` });
  const js = async (expression) => (await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result.value;
  const clickText = (text, scope = "") =>
    js(`(() => { const b = [...document.querySelectorAll("${scope} button")].find((x) => x.textContent.trim().includes(${JSON.stringify(text)}) && !x.disabled); if (b) b.click(); return Boolean(b); })()`);
  const click = (sel) => js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (b && !b.disabled) { b.click(); return true; } return false; })()`);
  const waitFor = async (expression, ms = 20000) => {
    for (let t = 0; t < ms; t += 250) {
      const v = await js(expression).catch(() => null);
      if (v) return v;
      await sleep(250);
    }
    return null;
  };
  const shot = async (name, full = true) => {
    if (full) {
      const h = await js("document.documentElement.scrollHeight");
      await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: Math.min(Math.max(h, 960), 3600), deviceScaleFactor: 1, mobile: false });
      await sleep(700);
    }
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(shots, `${name}.png`), Buffer.from(data, "base64"));
    if (full) await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1536, height: 960, deviceScaleFactor: 1, mobile: false });
    console.log(`     shots/${name}.png`);
  };
  const go = async (path, ready) => {
    await cdp.send("Page.navigate", { url: `${base}${path}` });
    await waitFor(`document.readyState === "complete" && ${ready ?? "true"}`);
    await sleep(1000);
  };
  const setValue = (selector, value) =>
    js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const alertText = () => js(`document.querySelector("[role=alert]")?.innerText ?? ""`);
  const text = async () => String(await js("document.body.innerText")).toLowerCase();

  // 0. cold home
  await go("/");
  check("cold home: 0 coins, empty state, no video cards", (await text()).includes("no coins yet.") && (await js(`document.querySelectorAll("[data-testid=video-card]").length`)) === 0);
  await shot("play-0-home-empty-1536", false);

  // 1. connect + sign in, then the wizard
  await go("/launch", `Boolean(document.querySelector("[data-testid=name]"))`);
  await click("header .wallet-connect");
  check("wallet dialog lists Fypad Test", Boolean(await waitFor(`[...document.querySelectorAll(".wallet-option")].some((b) => b.textContent.includes("Fypad Test"))`)));
  await clickText("Fypad Test", "dialog[open]");
  await waitFor(`[...document.querySelectorAll("dialog[open] button")].some((b) => b.textContent.trim() === "Sign in" && !b.disabled)`);
  await clickText("Sign in", "dialog[open]");
  check("signed in", Boolean(await waitFor(`Boolean(document.querySelector("[data-testid=signed-in]"))`)));
  await js(`document.querySelector("dialog[open]")?.close()`);
  await setValue("[data-testid=name]", "Frog Taxes");
  await setValue("[data-testid=ticker]", "FROG");
  await setValue("[data-testid=description]", "A frog who files everyone's taxes, badly.");
  const { root: docRoot } = await cdp.send("DOM.getDocument");
  const { nodeId } = await cdp.send("DOM.querySelector", { nodeId: docRoot.nodeId, selector: "[data-testid=image]" });
  await cdp.send("DOM.setFileInputFiles", { nodeId, files: [imgPath] });
  check("image read into the draft card", Boolean(await waitFor(`!document.querySelector("[data-testid=next]")?.disabled`)));
  await shot("play-1-launch-identity-1536", false);
  await click("[data-testid=next]");
  await click("[data-testid=style-presenter]");
  await setValue("[data-testid=style-note]", "A deadpan frog accountant explains one tax form to camera.");
  await sleep(200);
  await click("[data-testid=next]");
  await click("[data-testid=per-day-2]");
  await click("[data-testid=next]");
  await click("[data-testid=content-60]");
  await click("[data-testid=next]");
  await setValue("[data-testid=first-buy]", "0.1");
  await shot("play-1b-launch-pay-1536", false);
  const sentBefore = fake.state.sent.length;
  await click("[data-testid=launch]");
  const name = await waitFor(`document.querySelector("[data-testid=coin-name]")?.innerText`, 60000);
  check("launched: first buy signed, engine called once, coin page open", /frog taxes/i.test(name ?? "") && apiState.engine.calls === 1 && fake.state.sent.length >= sentBefore + 1, `engine ${apiState.engine.calls}, msg ${await alertText()}`);
  const eng = apiState.engine.bodies[0] ?? {};
  check("engine got ticker, first buy 0.1 SOL, image data URL", eng.ticker === "FROG" && eng.firstBuyLamports === "100000000" && String(eng.imageDataUrl).startsWith("data:image/png"));
  const slug = await js(`location.pathname.slice(1)`);
  check("coin page: budget 0, waiting for fees, empty wall", (await text()).includes("waiting for fees") && Boolean(await js(`Boolean(document.querySelector("[data-testid=video-wall-empty]"))`)));
  check("launcher sees Connect TikTok on the coin page", Boolean(await waitFor(`document.querySelector("[data-testid=launcher-manage]")?.innerText.includes("Connect TikTok")`)));
  await shot("play-2-coin-empty-1536");

  // 2. fees → content budget
  const curve = PublicKey.findProgramAddressSync([Buffer.from("bonding-curve"), new PublicKey(MINT).toBuffer()], PUMP)[0].toBase58();
  const sigs = [];
  for (let i = 0; i < 4; i++) {
    const sig = bs58.encode(Buffer.from(`play-trade-${i}`.padEnd(64, "z")));
    fake.state.txs.set(sig, { slot: 3000 + i, logs: [encodeTradeEvent({ mint: MINT, user: A1, creator: OP, solAmount: BigInt(10_000_000_000), creatorFee: BigInt(50_000_000) })] });
    sigs.unshift(sig);
  }
  fake.state.sigsFor.set(curve, sigs);
  const creatorVault = PublicKey.findProgramAddressSync([Buffer.from("creator-vault"), operator.publicKey.toBuffer()], PUMP)[0].toBase58();
  fake.state.accounts.set(creatorVault, { lamports: 890_880 + 200_000_000, owner: SYSTEM });
  const sweep = await (await fetch(`${base}/api/sweep`, { method: "POST", headers: { "x-tick-secret": "play-tick" } })).json();
  const a = sweep?.attribute ?? {};
  check("sweep: 4 trades, 0.2 SOL fees → 0.12 content / 0.04 launcher / 0.04 platform", a.events === 4 && a.contentLamports === "120000000" && a.ownerLamports === "40000000" && a.platformLamports === "40000000", JSON.stringify(a));
  check("sweep collected the creator vault", Boolean(sweep?.claim?.sig), JSON.stringify(sweep?.claim));
  await go(`/${slug}`, `Boolean(document.querySelector("[data-testid=budget]"))`);
  check("coin page: budget 0.12 SOL, covers 2 videos, countdown", (await js(`document.querySelector("[data-testid=budget]").innerText`)).includes("0.12") && (await text()).includes("2 videos"));
  await shot("play-3-coin-budget-1536");

  // 3. generation across ticks
  const t1 = await tick();
  const t2 = await tick();
  check("tick 1 starts a Higgsfield job; tick 2 polls it to a stored mp4", t1.started === 1 && t2.ready === 1 && apiState.hf.creates === 1, `${JSON.stringify(t1)} ${JSON.stringify(t2)}`);
  check("job sent to bytedance/seedance-2.0/text-to-video, 9:16, Key auth", apiState.hf.bodies[0]?.endpoint === "bytedance/seedance-2.0/text-to-video" && apiState.hf.bodies[0]?.aspect_ratio === "9:16" && apiState.hf.auth[0] === `Key ${HF_CREDS}`);
  await go(`/${slug}`);
  check("draft is not public yet (approve-before-post ON)", Boolean(await js(`Boolean(document.querySelector("[data-testid=video-wall-empty]"))`)));

  // 4. manage: connect TikTok through fake OAuth
  await go(`/manage/${slug}`, `Boolean(document.querySelector("[data-testid=manage-video]"))`);
  check("manage: one draft waiting with Approve", Boolean(await js(`Boolean(document.querySelector("[data-testid=approve]"))`)));
  await shot("play-4-manage-draft-1536");
  await click("[data-testid=connect-tiktok]");
  const handle = await waitFor(`location.search.includes("tiktok=connected") && document.querySelector("[data-testid=manage-handle]")?.innerText.toLowerCase()`, 30000);
  check("TikTok connected via OAuth: callback stored tokens, handle @fypad.frog", handle === "@fypad.frog" && apiState.tt.tokens === 1, `${handle} ${await js("location.href")}`);
  await shot("play-5-tiktok-connected-1536");

  // 5. approve → post → published
  await click("[data-testid=approve]");
  await waitFor(`[...document.querySelectorAll("[data-testid=manage-post]")].some((p) => p.innerText.startsWith("Approved"))`);
  const t3 = await tick();
  check("tick 3: Direct Post init (FILE_UPLOAD, SELF_ONLY, AIGC) + upload", apiState.tt.inits.length === 1 && apiState.tt.uploads.length === 1 && apiState.tt.inits[0].post_info.privacy_level === "SELF_ONLY" && apiState.tt.inits[0].post_info.is_aigc === true, JSON.stringify(t3));
  await tick();
  const t5 = await tick();
  check("status fetched until PUBLISH_COMPLETE", t5.posted === 1, JSON.stringify(t5));
  await go(`/${slug}`, `document.querySelectorAll("[data-testid=video-card]").length > 0`);
  const link = await js(`document.querySelector("[data-testid=tiktok-link]")?.href ?? ""`);
  check("coin page: video on the wall, status On TikTok, link to the post", (await js(`document.querySelector("[data-testid=post-status]")?.innerText`)) === "On TikTok" && link === "https://www.tiktok.com/@fypad.frog/video/7300000000000000001", link);
  check("coin page TikTok card shows the handle", (await js(`document.querySelector("[data-testid=tiktok-handle]")?.innerText.toLowerCase()`)) === "@fypad.frog");
  const vsrc = await js(`document.querySelector("[data-testid=video-card] video")?.getAttribute("src") ?? ""`);
  const vres = vsrc ? await fetch(`${base}${vsrc}`) : null;
  check("video url serves the stored mp4", vres?.headers.get("content-type") === "video/mp4" && (await vres.text()).startsWith("fake-mp4:"));
  await shot("play-6-coin-published-1536");

  // 6. explore, for you, my coins, ledger, home
  await go("/explore", `Boolean(document.querySelector("[data-testid=coin-card]"))`);
  check("explore: coin card with its latest video and handle", (await text()).includes("@fypad.frog") && Boolean(await js(`Boolean(document.querySelector("[data-testid=coin-card] video"))`)));
  await shot("play-7-explore-1536");
  await go("/foryou", `Boolean(document.querySelector("[data-testid=foryou-feed] [data-testid=video-card]"))`);
  check("for you: the video in the feed", (await js(`document.querySelectorAll("[data-testid=foryou-feed] [data-testid=video-card]").length`)) === 1);
  await shot("play-8-foryou-1536");
  await go("/manage", `Boolean(document.querySelector("[data-testid=my-coin]"))`);
  check("my coins: launcher share 0.04 SOL available", (await js(`document.querySelector("[data-testid=available]")?.innerText`))?.includes("0.04"));
  await clickText("Withdraw");
  const wd = await waitFor(`[...document.querySelectorAll(".notice")].map((n) => n.innerText).find((t) => t.includes("Sent")) ?? ""`, 60000);
  check("withdraw paid 0.04 SOL", Boolean(wd) && wd.includes("0.04 SOL"), wd);
  await shot("play-9-my-coins-1536");
  await go("/ledger", `Boolean(document.querySelector("[data-testid=ledger-table]"))`);
  const kinds = await js(`[...document.querySelectorAll("[data-testid=ledger-table] tbody tr td:nth-child(2)")].map((t) => t.innerText).join(",")`);
  check("ledger: first buy, fees collected, launcher payout", ["First buy received", "Creator fees collected", "Fee share paid to a launcher"].every((k) => kinds.includes(k)), kinds);
  await shot("play-10-ledger-1536");
  await go("/", `Boolean(document.querySelector("[data-testid=coin-card]"))`);
  check("home: the real video and the coin card show", (await js(`document.querySelectorAll("[data-testid=video-card]").length`)) >= 1 && (await js(`document.querySelectorAll("[data-testid=coin-card]").length`)) === 1);
  await shot("play-11-home-after-1536", false);
  ws.close();
}

let failed = true;
try {
  await main();
  failed = results.some((r) => !r.ok);
} catch (e) {
  console.error(e);
} finally {
  chrome.kill();
  server.kill();
  await apis.close();
  await fake.close();
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
  console.log(failed ? "\nplay-ui: FAILED" : `\nplay-ui: green (${results.length} checks)`);
  process.exit(failed ? 1 : 0);
}
