"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useWallet } from "./wallet/store";

const subscribeSecond = (cb: () => void) => {
  const t = setInterval(cb, 1000);
  return () => clearInterval(t);
};
const nowSecond = () => Math.floor(Date.now() / 1000) * 1000;

/** "in 3h 12m 04s" to a timestamp, ticking each second on the client. */
export function Countdown({ at, label = "Next video" }: { at: number; label?: string }) {
  const now = useSyncExternalStore(subscribeSecond, nowSecond, () => 0);
  if (!now) return <span className="mono">—</span>;
  const s = Math.max(0, Math.floor((at - now) / 1000));
  if (s === 0) return <span className="mono" data-testid="countdown">{label} on the next run</span>;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <span className="mono" data-testid="countdown">
      {label} in {h}h {String(m).padStart(2, "0")}m {String(sec).padStart(2, "0")}s
    </span>
  );
}

/** Shows the launcher-only link to the manage page when the signed-in wallet launched this coin. */
export function LauncherOnly({ owner, slug, children }: { owner: string; slug: string; children: React.ReactNode }) {
  const w = useWallet();
  if ((w.session ?? w.address) !== owner) return null;
  return (
    <Link href={`/manage/${slug}`} className="btn-hot inline-flex h-10 items-center justify-center rounded-full px-5 text-[14px]" data-testid="launcher-manage">
      {children}
    </Link>
  );
}
