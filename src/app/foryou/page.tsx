import type { Metadata } from "next";
import Link from "next/link";
import { EmptyPhone, PhoneCard } from "@/components/Phone";
import { forYou, scheduleWork, toPhone } from "@/server/views";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "For you" };

/** The newest videos across every coin. One per screen on mobile (vertical snap), a grid on desktop. */
export default function ForYou() {
  scheduleWork();
  const feed = forYou(60);
  return (
    <div className="mx-auto max-w-[1400px] px-4 py-12 sm:px-6 lg:px-8">
      <p className="label">Newest videos · every coin</p>
      <h1 className="display-xl glitch-sm mt-3 text-[clamp(44px,6vw,88px)]">For you</h1>
      {feed.length ? (
        <div className="snap-feed no-scrollbar mx-auto mt-8 flex h-[calc(100svh-9rem)] max-w-[420px] flex-col gap-6 overflow-y-auto sm:mt-10 sm:grid sm:h-auto sm:max-w-none sm:grid-cols-3 sm:overflow-visible lg:grid-cols-5" data-testid="foryou-feed">
          {feed.map((v) => (
            <PhoneCard key={v.v.id} v={toPhone(v)} autoInView className="h-full shrink-0 sm:h-auto" />
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-10 grid max-w-sm gap-6 text-center">
          <EmptyPhone line="No videos yet." />
          <p className="text-sm text-muted-foreground">
            Videos appear here as soon as the first coin&apos;s content budget pays for one.{" "}
            <Link href="/launch" className="link">
              Launch a coin
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
