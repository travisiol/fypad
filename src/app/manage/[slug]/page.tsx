import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { coinBySlug } from "@/server/store";
import { ManageCoin } from "../Manage";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Manage" };

export default async function ManageCoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const c = coinBySlug(db(), (await params).slug);
  if (!c) notFound();
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 lg:px-8">
      <p className="label">Manage · launcher only</p>
      <h1 className="display-xl mt-3 text-[clamp(40px,5.5vw,80px)]" data-testid="manage-title">
        {c.name} <span className="mono text-[0.4em] text-cyan">${c.ticker}</span>
      </h1>
      <ManageCoin coinId={c.id} />
    </div>
  );
}
