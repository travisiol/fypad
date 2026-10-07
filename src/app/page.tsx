import Image from "next/image";
import Link from "next/link";
import { CoinCard, EmptyCoins } from "@/components/CoinCard";
import { PhoneCard } from "@/components/Phone";
import { CONTENT_SHARE_DEFAULT, CONTENT_SHARE_MAX, CONTENT_SHARE_MIN, ENV, PLATFORM_SHARE, STYLES } from "@/config/fypad";
import { sol } from "@/lib/show";
import { allCoins, forYou, homeStats, scheduleWork, toPhone } from "@/server/views";

export const dynamic = "force-dynamic";

export default async function Home() {
  scheduleWork();
  const [coins, stats] = await Promise.all([allCoins(8), Promise.resolve(homeStats())]);
  const newest = forYou(4);
  const cost = ENV.costPerVideo();
  const launcherDefault = 100 - PLATFORM_SHARE - CONTENT_SHARE_DEFAULT;
  return (
    <>
      {/* ── hero: one stage, the coin render on the right, the words on its empty left side */}
      <section className="mx-auto max-w-[1400px] px-3 pt-3 sm:px-5 lg:px-6">
        <div className="stage animate-rise">
          <div className="relative aspect-[3/2] w-full lg:absolute lg:inset-0 lg:aspect-auto">
            <Image src="/hero.webp" alt="" fill priority sizes="(min-width: 1024px) 1400px, 100vw" className="object-cover object-[78%_50%]" />
          </div>
          <div className="relative px-6 pb-8 pt-6 sm:px-10 lg:flex lg:min-h-[min(760px,calc(100svh-100px))] lg:max-w-[46%] lg:flex-col lg:justify-center lg:py-16 lg:pl-14 lg:pr-0">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-[12px] font-semibold tracking-wide text-ink">
              <span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
              Solana launchpad · AI videos
            </span>
            <h1 className="display-xl mt-6 text-[clamp(58px,7.6vw,118px)] text-ink" data-testid="hero-title">
              Every coin
              <br />
              gets a TikTok.
            </h1>
            <p className="mt-6 max-w-md text-[16px] leading-relaxed text-ink/75 sm:text-[17px]">
              Launch a coin and connect a TikTok account for it. FYPAD makes short AI videos of the coin every day, pays
              for them with the coin&apos;s own creator fees, and posts each one after you approve it.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link href="/launch" className="btn-hot inline-flex h-14 items-center justify-center rounded-full px-8 text-[16px]">
                Launch a coin
              </Link>
              <Link href="/foryou" className="btn-line inline-flex h-14 items-center justify-center rounded-full px-8 text-[16px]">
                Watch the feed
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── live numbers (real, zero on a cold start) */}
      <section className="mx-auto max-w-[1400px] px-3 pt-3 sm:px-5 lg:px-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            ["Coins launched", String(stats.coins)],
            ["Videos made", String(stats.videos)],
            ["Posted to TikTok", String(stats.published)],
            ["Fees sent to videos", sol(stats.budget, 3)],
          ].map(([k, v], i) => (
            <div key={k} className={`rounded-3xl p-6 ${i === 0 ? "bg-ink text-[#f6f1e8]" : "border border-border bg-white"}`}>
              <div className={`text-[13px] font-semibold ${i === 0 ? "text-[#f6f1e8]/70" : "text-muted-foreground"}`}>{k}</div>
              <div className="font-display mt-3 text-[44px] leading-none tabular-nums" data-testid={`stat-${k.split(" ")[0].toLowerCase()}`}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── how it works */}
      <section className="mx-auto max-w-[1400px] px-4 py-24 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="display-xl text-[clamp(40px,5vw,72px)]">How it works</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground">A coin launches with a video account, a budget paid by its fees, and an approval step.</p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            ["1", "Launch", "Name, ticker, image and one line about the coin. Pick a video style and how many videos a day. The coin launches on pump.fun."],
            ["2", "Connect TikTok", "On the coin's manage page, connect a TikTok account you own for it. FYPAD never creates accounts."],
            ["3", "Fees fill the budget", `Every trade pays a creator fee. Your share for videos (${CONTENT_SHARE_MIN}–${CONTENT_SHARE_MAX} %) goes to the coin's budget.`],
            ["4", "Approve and post", `Each video costs ${sol(cost, 3)} from the budget. You approve the draft, then it posts to TikTok with a link on the coin page.`],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-3xl border border-border bg-white p-7">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-amber font-display text-[20px] text-ink">{n}</div>
              <div className="font-display mt-6 text-[28px] leading-none">{t}</div>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── latest videos (real only) */}
      <section className="border-y border-border bg-bg-2">
        <div className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4">
            <h2 className="display-xl text-[clamp(40px,5vw,72px)]">Latest videos</h2>
            <Link href="/foryou" className="shrink-0 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
              Open the feed →
            </Link>
          </div>
          {newest.length ? (
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {newest.map((v) => (
                <PhoneCard key={v.v.id} v={toPhone(v)} />
              ))}
            </div>
          ) : (
            <div className="mt-10 flex flex-col items-start gap-5 rounded-3xl border border-border bg-white p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-display text-[28px] leading-none">No videos yet</div>
                <p className="mt-2 text-[15px] text-muted-foreground">The first coin&apos;s videos show up here as soon as they are made.</p>
              </div>
              <Link href="/launch" className="btn-hot inline-flex h-12 items-center rounded-full px-6 text-[15px]">
                Launch the first coin
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── styles + split */}
      <section className="mx-auto grid max-w-[1400px] gap-4 px-4 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="rounded-3xl border border-border bg-white p-8">
          <h3 className="font-display text-[32px] leading-none">Three video styles</h3>
          <ul className="mt-6 space-y-5">
            {Object.values(STYLES).map((s) => (
              <li key={s.label} className="flex gap-4">
                <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                <div>
                  <div className="text-[17px] font-bold">{s.label}</div>
                  <p className="mt-0.5 text-[15px] text-muted-foreground">{s.hint}.</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px] text-muted-foreground">Plus one sentence of your own direction. Every clip is vertical, about five seconds, and labeled as AI-generated on TikTok.</p>
        </div>
        <div className="rounded-3xl border border-border bg-white p-8">
          <h3 className="font-display text-[32px] leading-none">Where each creator fee goes</h3>
          <div className="mt-7 flex h-14 overflow-hidden rounded-2xl text-[13px] font-bold">
            <div className="grid place-items-center bg-amber text-ink" style={{ width: `${CONTENT_SHARE_DEFAULT}%` }}>
              Videos {CONTENT_SHARE_DEFAULT} %
            </div>
            <div className="grid place-items-center bg-ink text-[#f6f1e8]" style={{ width: `${launcherDefault}%` }}>
              You {launcherDefault} %
            </div>
            <div className="grid place-items-center bg-sand text-ink" style={{ width: `${PLATFORM_SHARE}%` }}>
              {PLATFORM_SHARE} %
            </div>
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">The default split. You set yours when you launch.</p>
          <ul className="mt-6 space-y-3 text-[15px] text-muted-foreground">
            <li>
              <span className="font-semibold text-foreground">Videos</span> — you pick {CONTENT_SHARE_MIN} to {CONTENT_SHARE_MAX} %. It pays for the coin&apos;s videos, {sol(cost, 3)} each.
            </li>
            <li>
              <span className="font-semibold text-foreground">You</span> — the rest of the {100 - PLATFORM_SHARE} %, withdrawable from My coins.
            </li>
            <li>
              <span className="font-semibold text-foreground">Platform</span> — {PLATFORM_SHARE} %, buys $FYP and burns it. Every transfer is on the{" "}
              <Link href="/ledger" className="link">
                ledger
              </Link>
              .
            </li>
          </ul>
        </div>
      </section>

      {/* ── coins */}
      <section className="mx-auto max-w-[1400px] px-4 pb-24 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 className="display-xl text-[clamp(40px,5vw,72px)]">Newest coins</h2>
          <Link href="/explore" className="shrink-0 text-[14px] font-semibold text-muted-foreground hover:text-foreground">
            All coins →
          </Link>
        </div>
        <div className="mt-10">
          {coins.length ? (
            <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
              {coins.map((v) => (
                <CoinCard key={v.c.id} v={v} />
              ))}
            </div>
          ) : (
            <EmptyCoins />
          )}
        </div>
      </section>

      {/* ── closing */}
      <section className="mx-auto max-w-[1400px] px-3 pb-6 sm:px-5 lg:px-6">
        <div className="rounded-[32px] bg-ink px-6 py-20 text-center text-[#f6f1e8]">
          <Image src="/mark.webp" alt="" width={120} height={120} className="mx-auto h-24 w-24 rounded-full" />
          <h2 className="display-xl mx-auto mt-8 max-w-3xl text-[clamp(44px,6vw,88px)]">Start with the first coin</h2>
          <p className="mx-auto mt-5 max-w-xl text-[17px] leading-relaxed text-[#f6f1e8]/70">
            Launch a coin, connect its TikTok, and approve each video before it posts.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/launch" className="btn-hot inline-flex h-14 items-center justify-center rounded-full px-8 text-[16px]">
              Launch a coin
            </Link>
            <Link href="/docs" className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 px-8 text-[16px] font-bold hover:bg-white/10">
              Read the docs
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
