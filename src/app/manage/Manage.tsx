"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api, ensureSession, errorText } from "@/components/actions";
import { Countdown } from "@/components/Live";
import { useWallet } from "@/components/wallet/store";

const sol = (l: string | number, d = 4) => `${(Number(l) / 1e9).toLocaleString("en-US", { maximumFractionDigits: d })} SOL`;

interface Me {
  address: string | null;
  coins: { id: string; slug: string; name: string; ticker: string; avatar: string; paused: boolean; budget: string }[];
  balance: { earned: string; paid: string; available: string } | null;
}

function useMe(session: string | null) {
  const [me, setMe] = useState<Me | null>(null);
  const load = useCallback(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => setMe(j))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    let live = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Me) => {
        if (live) setMe(j);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session]);
  return { me, reload: load };
}

function SignInFirst({ line }: { line: string }) {
  const w = useWallet();
  const [err, setErr] = useState("");
  return (
    <div className="tile mt-8 grid place-items-center px-6 py-14 text-center">
      <p className="font-display text-[22px]">{line}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">Connect the wallet that launched the coin and sign a short message. It costs nothing.</p>
      <button
        type="button"
        className="btn-white mt-6 inline-flex h-11 items-center rounded-full px-6 text-[14px]"
        onClick={() => ensureSession(w).catch((e) => setErr(errorText(e)))}
      >
        Connect wallet
      </button>
      {err && <p className="notice notice-alert mt-4">{err}</p>}
    </div>
  );
}

/** /manage: the signed-in launcher's coins and fee share. */
export function MyCoins() {
  const w = useWallet();
  const { me, reload } = useMe(w.session);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  if (!w.session) return <SignInFirst line="Sign in to see your coins." />;
  if (!me) return <p className="mt-8 text-muted-foreground">Loading…</p>;
  const available = BigInt(me.balance?.available ?? "0");
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="grid gap-3" data-testid="my-coins">
        {me.coins.length === 0 && (
          <div className="tile px-6 py-12 text-center">
            <p className="font-display text-[22px]">No coins yet.</p>
            <Link href="/launch" className="btn-hot mt-5 inline-flex h-11 items-center rounded-full px-6 text-[14px]">
              Launch a coin
            </Link>
          </div>
        )}
        {me.coins.map((c) => (
          <Link key={c.id} href={`/manage/${c.slug}`} className="tile flex items-center gap-4 p-4 hover:border-foreground" data-testid="my-coin">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.avatar} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {c.name} <span className="mono text-[12px] text-muted-foreground">${c.ticker}</span>
              </div>
              <div className="mono text-[12.5px] text-muted-foreground">
                Budget {sol(c.budget)} · {c.paused ? "paused" : "active"}
              </div>
            </div>
            <span className="text-[13px] font-semibold">Manage →</span>
          </Link>
        ))}
      </div>
      <div className="tile h-fit p-5">
        <div className="label">Your share of fees</div>
        <div className="font-display mt-3 text-[30px] leading-none" data-testid="available">
          {sol(me.balance?.available ?? "0")}
        </div>
        <p className="mt-2 text-[13px] text-muted-foreground">Earned {sol(me.balance?.earned ?? "0")} · withdrawn {sol(me.balance?.paid ?? "0")}</p>
        <button
          type="button"
          className="btn btn-primary mt-5 w-full"
          disabled={busy}
          onClick={async () => {
            setMsg("");
            setBusy(true);
            try {
              if (available < BigInt(1_000_000)) throw new Error("You have less than 0.001 SOL to withdraw.");
              const r = await api<{ lamports: string }>("/api/withdraw", {});
              setMsg(`Sent ${sol(r.lamports)} to your wallet.`);
              reload();
            } catch (e) {
              setMsg(errorText(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <span className="spinner" /> : "Withdraw"}
        </button>
        {msg && <p className="notice mt-4 text-[13.5px]">{msg}</p>}
      </div>
    </div>
  );
}

interface CoinData {
  coin: { id: string; slug: string; name: string; ticker: string; paused: boolean; approve: boolean; perDay: number; nextVideoAt: number };
  budget: { balance: string; cost: string };
  tiktok: { username: string | null; url: string | null; connectedAt: number } | null;
  videos: { id: string; status: string; post: string; caption: string; error: string | null; postError: string | null; postUrl: string | null; createdAt: number }[];
}

const STATUS: Record<string, string> = { queued: "Starting", running: "Being made", failed: "Generation failed" };
const POST: Record<string, string> = { draft: "Draft · waiting for you", approved: "Approved · posts on the next run", posting: "Posting to TikTok", published: "Published on TikTok", failed: "TikTok post failed", discarded: "Discarded", none: "" };

const noop = () => () => {};
const readQuery = () => window.location.search;

/** /manage/[slug]: TikTok connection, pause, approve-before-post, drafts, regenerate. */
export function ManageCoin({ coinId }: { coinId: string }) {
  const w = useWallet();
  const query = useSyncExternalStore(noop, readQuery, () => "");
  const [data, setData] = useState<CoinData | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => {
    fetch(`/api/coins/${coinId}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Request failed.");
        setData(j as CoinData);
        setErr("");
      })
      .catch((e: Error) => setErr(e.message));
  }, [coinId]);
  useEffect(() => {
    let live = true;
    fetch(`/api/coins/${coinId}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!live) return;
        if (r.ok) setData(j as CoinData);
        else setErr(j.error ?? "Request failed.");
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [coinId, w.session]);

  const q = new URLSearchParams(query);
  const banner = q.get("tiktok") === "connected" ? "TikTok connected." : q.get("tiktok") === "error" ? (q.get("reason") ?? "TikTok did not answer.") : q.get("tiktok") === "cancelled" ? "TikTok connection cancelled." : "";

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setMsg("");
    setBusy(action + String(extra.videoId ?? ""));
    try {
      await api(`/api/coins/${coinId}`, { action, ...extra });
      load();
    } catch (e) {
      setMsg(errorText(e));
    } finally {
      setBusy("");
    }
  }

  async function connect() {
    setMsg("");
    setBusy("connect");
    try {
      const r = await api<{ url: string }>("/api/tiktok/connect", { coinId });
      window.location.assign(r.url);
    } catch (e) {
      setMsg(errorText(e));
      setBusy("");
    }
  }

  if (!w.session) return <SignInFirst line="Sign in to manage this coin." />;
  if (err && !data) return <p className="notice notice-alert mt-8">{err}</p>;
  if (!data) return <p className="mt-8 text-muted-foreground">Loading…</p>;
  const { coin, tiktok, videos } = data;
  const covers = BigInt(data.budget.cost) > BigInt(0) ? BigInt(data.budget.balance) / BigInt(data.budget.cost) : BigInt(0);
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[340px_1fr]">
      <div className="grid h-fit gap-4">
        {banner && (
          <p className={`notice ${q.get("tiktok") === "error" ? "notice-alert" : ""}`} data-testid="tiktok-banner">
            {banner}
          </p>
        )}
        <div className="tile p-5" data-testid="manage-tiktok">
          <div className="label">TikTok account</div>
          {tiktok ? (
            <>
              <div className="font-display mt-3 text-[22px]" data-testid="manage-handle">
                {tiktok.username ? `@${tiktok.username}` : "Connected"}
              </div>
              {tiktok.url && (
                <a href={tiktok.url} target="_blank" rel="noreferrer" className="link text-[13px]">
                  Open profile ↗
                </a>
              )}
              <button type="button" className="btn btn-quiet mt-4 w-full" disabled={busy !== ""} onClick={() => act("disconnect")}>
                Disconnect
              </button>
            </>
          ) : (
            <>
              <p className="mt-3 text-[14px] text-muted-foreground">Connect a TikTok account you own for this coin. FYPAD asks for posting rights and your public profile, nothing else.</p>
              <button type="button" className="btn-hot mt-4 inline-flex h-11 w-full items-center justify-center rounded-full text-[14px]" data-testid="connect-tiktok" disabled={busy !== ""} onClick={connect}>
                {busy === "connect" ? <span className="spinner" /> : "Connect TikTok"}
              </button>
            </>
          )}
          <p className="mt-3 text-[12px] text-muted-foreground">Until TikTok audits FYPAD, posts are private to the account and daily caps apply.</p>
        </div>

        <div className="tile grid gap-4 p-5">
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">Approve before posting</span>
              <span className="block text-[12.5px] text-muted-foreground">On: drafts wait for you. Off: videos post on their own.</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-[#ffb21a]" data-testid="approve-toggle" checked={coin.approve} disabled={busy !== ""} onChange={(e) => act("approve-mode", { on: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-semibold">Pause videos</span>
              <span className="block text-[12.5px] text-muted-foreground">No new videos while paused.</span>
            </span>
            <input type="checkbox" className="h-5 w-5 accent-[#ffb21a]" data-testid="pause-toggle" checked={coin.paused} disabled={busy !== ""} onChange={(e) => act(e.target.checked ? "pause" : "resume")} />
          </label>
        </div>

        <div className="tile p-5">
          <div className="label">Content budget</div>
          <div className="font-display mt-3 text-[28px] leading-none" data-testid="manage-budget">
            {sol(data.budget.balance)}
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Covers {covers.toString()} video{covers === BigInt(1) ? "" : "s"} at {sol(data.budget.cost, 3)} each.
          </p>
          <p className="mt-2 text-[13px] text-muted-foreground">{coin.paused ? "Paused." : covers === BigInt(0) ? "Waiting for fees." : <Countdown at={coin.nextVideoAt} />}</p>
          <button type="button" className="btn btn-quiet mt-4 w-full" data-testid="regenerate" disabled={busy !== ""} onClick={() => act("regenerate")}>
            {busy === "regenerate" ? <span className="spinner" /> : "Regenerate the draft"}
          </button>
        </div>
        {msg && (
          <p className="notice notice-alert" role="alert">
            {msg}
          </p>
        )}
      </div>

      <div className="min-w-0">
        <div className="flex items-end justify-between">
          <h2 className="font-display text-[26px]">Videos</h2>
          <Link href={`/${coin.slug}`} className="text-[13px] font-semibold text-muted-foreground hover:text-foreground">
            Public page →
          </Link>
        </div>
        {videos.length === 0 ? (
          <p className="tile mt-4 px-5 py-10 text-center text-muted-foreground">No videos yet. The first one starts when the budget covers one.</p>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3" data-testid="manage-videos">
            {videos.map((v) => (
              <div key={v.id} className="grid gap-2" data-testid="manage-video">
                {v.status === "ready" ? (
                  <video src={`/api/video/${v.id}`} className="phone w-full object-cover" muted loop playsInline controls preload="metadata" />
                ) : (
                  <div className="phone phone-empty grid place-items-center p-4 text-center text-[13px] text-muted-foreground">{STATUS[v.status] ?? v.status}</div>
                )}
                <p className="line-clamp-2 text-[12.5px] text-muted-foreground">{v.caption}</p>
                <p className="text-[12px] font-semibold" data-testid="manage-post">
                  {v.status === "ready" ? POST[v.post] : (v.error ?? "")}
                  {v.postError && v.post !== "published" ? ` — ${v.postError}` : ""}
                </p>
                {v.post === "published" && v.postUrl && (
                  <a href={v.postUrl} target="_blank" rel="noreferrer" className="link text-[12px]">
                    Open on TikTok ↗
                  </a>
                )}
                {v.status === "ready" && v.post === "draft" && (
                  <button type="button" className="btn-white inline-flex h-9 items-center justify-center rounded-full text-[13px]" data-testid="approve" disabled={busy !== ""} onClick={() => act("approve", { videoId: v.id })}>
                    Approve
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
