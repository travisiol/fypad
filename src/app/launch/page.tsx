import type { Metadata } from "next";
import { CONTENT_SHARE_DEFAULT, CONTENT_SHARE_OPTIONS, ENV, MAX_IMAGE_BYTES, PER_DAY_OPTIONS, PLATFORM_SHARE, STYLES } from "@/config/fypad";
import type { StyleKey } from "@/config/fypad";
import { LaunchFlow } from "./LaunchFlow";

export const metadata: Metadata = { title: "Launch a coin" };
export const dynamic = "force-dynamic";

export default function LaunchPage() {
  const cfg = {
    styles: (Object.keys(STYLES) as StyleKey[]).map((key) => ({ key, label: STYLES[key].label, hint: STYLES[key].hint })),
    perDay: [...PER_DAY_OPTIONS],
    contentOptions: [...CONTENT_SHARE_OPTIONS],
    contentDefault: CONTENT_SHARE_DEFAULT,
    platform: PLATFORM_SHARE,
    costSol: (Number(ENV.costPerVideo()) / 1e9).toString(),
    maxImageMb: MAX_IMAGE_BYTES / 1024 / 1024,
  };
  return (
    <section className="relative isolate overflow-hidden">
      <div className="glow-duo pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px]" />
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <p className="label">Launching is free</p>
        <h1 className="display-xl glitch mt-4 text-[clamp(44px,7vw,100px)]">Launch a coin</h1>
        <p className="mt-4 max-w-xl text-muted-foreground">Five steps: who the coin is, how its videos look, how often, how fees split, then launch.</p>
        <LaunchFlow cfg={cfg} />
      </div>
    </section>
  );
}
