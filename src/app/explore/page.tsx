import type { Metadata } from "next";
import { CoinCard, EmptyCoins } from "@/components/CoinCard";
import { allCoins, scheduleWork } from "@/server/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Explore" };

export default async function Explore() {
  scheduleWork();
  const coins = await allCoins(120);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
      <p className="label">All coins · newest first</p>
      <h1 className="display-xl glitch-sm mt-3 text-[clamp(44px,6vw,88px)]">Explore</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">Every coin launched on FYPAD with its latest video, market cap and TikTok account.</p>
      <div className="mt-10">
        {coins.length ? (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5" data-testid="explore-grid">
            {coins.map((v) => (
              <CoinCard key={v.c.id} v={v} />
            ))}
          </div>
        ) : (
          <EmptyCoins />
        )}
      </div>
    </div>
  );
}
