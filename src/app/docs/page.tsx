import type { Metadata } from "next";
import Link from "next/link";
import { CONTENT_SHARE_MAX, CONTENT_SHARE_MIN, ENV, LAUNCHES_PER_DAY, MIN_BURN_LAMPORTS, PLATFORM_SHARE, REGENERATE_EVERY_MS, STYLES, VIDEO_SECONDS } from "@/config/fypad";
import { sol } from "@/lib/show";

export const metadata: Metadata = { title: "Documentation" };
export const dynamic = "force-dynamic";

export default function Docs() {
  const cost = ENV.costPerVideo();
  const provider = ENV.videoProvider() === "openai" ? "OpenAI Sora" : "Higgsfield (Seedance 2.0 text-to-video)";
  return (
    <div className="mx-auto max-w-[860px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <h1 className="display-xl text-[clamp(44px,6vw,88px)]">Docs</h1>
      <p className="mt-3 text-muted-foreground">How FYPAD works: launch, the coin&apos;s TikTok, the content budget, daily videos and the $FYP burn.</p>
      <div className="prose-docs">
        <h2>Overview</h2>
        <p>
          FYPAD launches pump.fun coins that come with their own short-video channel. The launcher connects a TikTok account for the coin; FYPAD makes a short AI video of the coin on a schedule and posts it there. Videos are paid from the coin&apos;s own creator fees, never from a
          subscription.
        </p>

        <h2>Launch</h2>
        <ul>
          <li>
            <strong>Identity</strong> — name, ticker (2 to 10 letters or digits), an image, one or two sentences about the coin, optional website and X link.
          </li>
          <li>
            <strong>Video style</strong> — one of {Object.values(STYLES).map((s) => s.label).join(", ")}, plus one sentence of direction.
          </li>
          <li>
            <strong>Schedule</strong> — 1, 2 or 3 videos a day.
          </li>
          <li>
            <strong>Fee split</strong> — the content share, from {CONTENT_SHARE_MIN} to {CONTENT_SHARE_MAX} % of creator fees. Fixed at launch.
          </li>
          <li>
            <strong>Pay</strong> — launching is free. An optional first buy is one SOL transfer you sign; the launch engine buys at launch and the tokens are forwarded to you. The coin launches on pump.fun from the FYPAD launch wallet, which is the creator of record. Up to {LAUNCHES_PER_DAY}{" "}
            launches per wallet a day.
          </li>
        </ul>

        <h2>Fees</h2>
        <p>Every trade on pump.fun pays a creator fee to the launch wallet. FYPAD reads each trade from the chain and splits its fee:</p>
        <ul>
          <li>
            <strong>Content budget</strong> — the coin&apos;s content share, credited to that coin. Each video debits {sol(cost, 3)} (the provider&apos;s cost at a fixed rate). A job the provider fails is refunded. With an empty budget the coin waits for fees.
          </li>
          <li>
            <strong>Launcher</strong> — the rest of the {100 - PLATFORM_SHARE} %, withdrawable from <Link href="/manage">My coins</Link> (0.001 SOL minimum).
          </li>
          <li>
            <strong>Platform</strong> — {PLATFORM_SHARE} %. Once collected it buys $FYP through Jupiter and burns exactly what was bought, in batches of {sol(MIN_BURN_LAMPORTS, 3)} or more. Before the $FYP mint is live the share is held, and shown as held.
          </li>
        </ul>
        <p>
          Every transfer is on the <Link href="/ledger">ledger</Link> with its Solscan link. The content budget is accounting kept by FYPAD: its SOL stays in the launch wallet, which pays the video provider.
        </p>

        <h2>Videos</h2>
        <ul>
          <li>Provider: {provider}. Each clip is vertical 9:16, about {VIDEO_SECONDS} seconds.</li>
          <li>A scheduled run starts the coin&apos;s next video when it is due and the budget covers it, then checks on running jobs on later runs. A video is never awaited inside a page load.</li>
          <li>The scene and caption are written from the coin&apos;s description and your style sentence. Any price, market cap, percentage or multiple a model writes is removed.</li>
          <li>
            <strong>Approve before posting</strong> is on by default: a finished video is a draft that only you can approve. Turned off, finished videos post on their own. You can pause, and regenerate a draft once every {REGENERATE_EVERY_MS / 60_000} minutes.
          </li>
          <li>Drafts stay private. Approved videos appear on the coin page and in the For you feed.</li>
        </ul>

        <h2>TikTok</h2>
        <ul>
          <li>The launcher connects a TikTok account they own on the coin&apos;s manage page (TikTok login, scopes user.info.basic and video.publish). FYPAD never creates TikTok accounts.</li>
          <li>Tokens are encrypted at rest and refreshed automatically. Disconnect revokes them.</li>
          <li>Posting uses TikTok&apos;s Content Posting API (Direct Post), with the AI-generated label set on every video.</li>
          <li>
            <strong>Until TikTok audits the FYPAD app, posts are private to the connected account, and TikTok&apos;s daily posting caps apply.</strong>
          </li>
          <li>Every posted video is listed on the coin page with its status and its TikTok link.</li>
        </ul>

        <h2 id="faq">FAQ</h2>
        <ul>
          <li>
            <strong>Do I need a TikTok account?</strong> No. Videos are still made and shown on the coin page; they post once you connect one.
          </li>
          <li>
            <strong>Can I lose money?</strong> Yes. Coins are speculative. Fees depend on trading, which may never happen. Nothing here is financial advice.
          </li>
          <li>
            <strong>Who pays for a video?</strong> The coin&apos;s own content budget, filled only by its trading fees.
          </li>
        </ul>
      </div>
    </div>
  );
}
