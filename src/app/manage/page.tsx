import type { Metadata } from "next";
import { MyCoins } from "./Manage";

export const metadata: Metadata = { title: "My coins" };

export default function ManagePage() {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
      <p className="label">Launcher only</p>
      <h1 className="display-xl mt-3 text-[clamp(44px,6vw,88px)]">My coins</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">Your coins, their content budgets, and your share of their creator fees.</p>
      <MyCoins />
    </div>
  );
}
