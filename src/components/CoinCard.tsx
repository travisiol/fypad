import Link from "next/link";
import { usd } from "@/lib/show";
import type { CoinView } from "@/server/views";
import { toPhone } from "@/server/views";
import { EmptyPhone, PhoneCard } from "./Phone";

/** A coin with its latest public video (or an empty frame), its market cap and its TikTok handle. */
export function CoinCard({ v }: { v: CoinView }) {
  const { c } = v;
  return (
    <div className="flex flex-col gap-3" data-testid="coin-card">
      {v.latest ? <PhoneCard v={toPhone(v.latest)} showCoin={false} /> : <EmptyPhone line="First video on its way once fees fill the budget." />}
      <Link href={`/${c.slug}`} className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={v.avatar} alt="" className="h-9 w-9 rounded-full object-cover" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{c.name}</div>
          <div className="mono text-[12px] text-muted-foreground">
            ${c.ticker} · {v.tiktok?.username ? `@${v.tiktok.username}` : "no TikTok yet"}
          </div>
        </div>
        <div className="mono text-[13px]">{usd(v.market.mcapUsd)}</div>
      </Link>
    </div>
  );
}

export function EmptyCoins({ line = "No coins yet." }: { line?: string }) {
  return (
    <div className="tile grid place-items-center px-6 py-16 text-center">
      <p className="font-display text-2xl">{line}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">The first coin launched here shows up in this spot with its videos.</p>
      <Link href="/launch" className="btn-hot mt-6 inline-flex h-11 items-center rounded-full px-6 text-[14px]">
        Launch a coin
      </Link>
    </div>
  );
}
