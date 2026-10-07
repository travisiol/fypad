import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyCa } from "@/components/CopyCa";
import { Countdown, LauncherOnly } from "@/components/Live";
import { PhoneCard } from "@/components/Phone";
import { STYLES, isStyle } from "@/config/fypad";
import { explorerUrl } from "@/config/solana";
import { shortAddress } from "@/lib/format";
import { sol, usd } from "@/lib/show";
import { db } from "@/server/db";
import { readMarket } from "@/server/market-data";
import { coinBySlug } from "@/server/store";
import { avatarOf, coinMoney, coinWall, scheduleWork, tiktokOf, toPhone } from "@/server/views";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = coinBySlug(db(), (await params).slug);
  return c ? { title: `${c.name} ($${c.ticker})`, description: c.description } : { title: "Coin not found" };
}

export default async function CoinPage({ params }: { params: Promise<{ slug: string }> }) {
  scheduleWork();
  const c = coinBySlug(db(), (await params).slug);
  if (!c) notFound();
  const market = await readMarket(c.mint).catch(() => ({ mcapUsd: null, change24h: null, hasPair: false }));
  const wall = coinWall(c);
  const money = coinMoney(c);
  const tiktok = tiktokOf(c);
  const covers = money.cost > BigInt(0) ? money.budget.balance / money.cost : BigInt(0);
  const style = isStyle(c.style) ? STYLES[c.style].label : c.style;
  const pump = `https://pump.fun/coin/${c.mint}`;
  const dex = `https://dexscreener.com/solana/${c.mint}`;
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* ── identity + side cards */}
        <aside className="min-w-0 space-y-4">
          <div className="tile p-5">
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={avatarOf(c)} alt="" className="h-16 w-16 rounded-2xl object-cover" />
              <div className="min-w-0">
                <h1 className="font-display glitch-sm truncate text-[28px] leading-none" data-testid="coin-name">
                  {c.name}
                </h1>
                <div className="mono mt-1.5 text-[14px] text-cyan">${c.ticker}</div>
              </div>
            </div>
            <p className="mt-4 text-[14.5px] leading-relaxed text-muted-foreground">{c.description}</p>
            <div className="mt-4 flex flex-wrap gap-2 text-[12px]">
              <span className="pill">{style}</span>
              <span className="pill">{c.perDay} a day</span>
              <span className="pill">{c.contentPct} % of fees to content</span>
            </div>
            <div className="mt-5 grid min-w-0 grid-cols-1 gap-2">
              <a href={pump} target="_blank" rel="noreferrer" className="btn-white inline-flex h-11 items-center justify-center rounded-full text-[14px]">
                Buy ${c.ticker} on pump.fun
              </a>
              <CopyCa value={c.mint} className="btn-dark w-full min-w-0 overflow-hidden rounded-xl px-3 py-2.5 text-left text-xs">
                <span className="label">Contract</span>
                <span className="mono mt-0.5 block truncate">{c.mint}</span>
              </CopyCa>
            </div>
            <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">
              <a className="link" href={explorerUrl("token", c.mint)} target="_blank" rel="noreferrer">
                Solscan
              </a>
              <a className="link" href={dex} target="_blank" rel="noreferrer">
                DexScreener
              </a>
              {c.website && (
                <a className="link" href={c.website} target="_blank" rel="noreferrer">
                  Website
                </a>
              )}
              {c.xUrl && (
                <a className="link" href={c.xUrl} target="_blank" rel="noreferrer">
                  X
                </a>
              )}
              {c.launchSig && (
                <a className="link" href={explorerUrl("tx", c.launchSig)} target="_blank" rel="noreferrer">
                  Launch tx
                </a>
              )}
            </div>
          </div>

          {/* TikTok account */}
          <div className="tile p-5" data-testid="tiktok-card">
            <div className="label">TikTok account</div>
            {tiktok ? (
              <div className="mt-3">
                <div className="font-display text-[22px]" data-testid="tiktok-handle">
                  {tiktok.username ? `@${tiktok.username}` : "Connected"}
                </div>
                {tiktok.url && (
                  <a href={tiktok.url} target="_blank" rel="noreferrer" className="link mt-1 inline-block text-[13px]">
                    Open profile ↗
                  </a>
                )}
                <p className="mt-2 text-[12.5px] text-muted-foreground">Until TikTok audits FYPAD, posts go out private to the account and daily caps apply.</p>
              </div>
            ) : (
              <p className="mt-3 text-[14px] text-muted-foreground">No TikTok connected yet. Videos still land on this page.</p>
            )}
            <div className="mt-4">
              <LauncherOnly owner={c.owner} slug={c.slug}>
                {tiktok ? "Manage this coin" : "Connect TikTok"}
              </LauncherOnly>
            </div>
          </div>

          {/* content budget */}
          <div className="tile p-5" data-testid="budget-card">
            <div className="label">Content budget</div>
            <div className="font-display mt-3 text-[30px] leading-none" data-testid="budget">
              {sol(money.budget.balance, 4)}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px]">
              <Fact k="From fees" v={sol(money.budget.credited, 4)} />
              <Fact k="Spent" v={sol(money.budget.spent, 4)} />
              <Fact k="Per video" v={sol(money.cost, 3)} />
              <Fact k="Covers" v={`${covers.toString()} video${covers === BigInt(1) ? "" : "s"}`} />
            </dl>
            <p className="mt-4 text-[13px] text-muted-foreground" data-testid="next-video">
              {c.paused ? "Videos are paused by the launcher." : covers === BigInt(0) ? "Waiting for fees: the next video starts once the budget covers one." : <Countdown at={c.nextVideoAt} />}
            </p>
          </div>

          <div className="tile p-5">
            <div className="label">Market</div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <Fact k="Market cap" v={usd(market.mcapUsd)} />
              <Fact k="24h" v={market.change24h == null ? "—" : `${market.change24h >= 0 ? "+" : ""}${market.change24h.toFixed(1)} %`} />
              <Fact k="Creator fees" v={sol(money.fees.fees, 4)} />
              <Fact k="Launcher" v={shortAddress(c.owner)} />
            </dl>
          </div>
        </aside>

        {/* ── wall */}
        <section className="min-w-0">
          <div className="flex items-end justify-between gap-4">
            <h2 className="display-xl text-[clamp(32px,4vw,56px)]">Video wall</h2>
            <span className="mono text-[13px] text-muted-foreground">{wall.length} videos</span>
          </div>
          {wall.length ? (
            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4" data-testid="video-wall">
              {wall.map((v) => (
                <PhoneCard key={v.v.id} v={toPhone(v)} showCoin={false} />
              ))}
            </div>
          ) : (
            <div className="tile mt-6 px-6 py-14 text-center" data-testid="video-wall-empty">
              <p className="font-display text-[22px]">No videos yet.</p>
              <p className="mx-auto mt-2 max-w-md text-[14px] text-muted-foreground">
                The first one is made when trading fees fill the content budget with {sol(money.cost, 3)}. Each one shows here, with its TikTok link once posted.
              </p>
            </div>
          )}

          <h2 className="display-xl mt-14 text-[clamp(28px,3.4vw,44px)]">Chart</h2>
          <div className="tile mt-5 overflow-hidden">
            {market.hasPair ? (
              <iframe title={`${c.ticker} chart`} src={`${dex}?embed=1&theme=dark&info=0&trades=0`} className="h-[460px] w-full" />
            ) : (
              <div className="px-6 py-12 text-center text-[14px] text-muted-foreground">
                No DEX pair yet. Trades on the pump.fun curve show on{" "}
                <a href={pump} className="link" target="_blank" rel="noreferrer">
                  pump.fun
                </a>
                .
              </div>
            )}
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Made on FYPAD.{" "}
            <Link href="/launch" className="link">
              Launch your own
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="label">{k}</dt>
      <dd className="mono mt-1 text-[14px]">{v}</dd>
    </div>
  );
}
