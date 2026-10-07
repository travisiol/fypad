import { db } from "@/server/db";
import { handle } from "@/server/http";
import { currentAddress } from "@/server/session";
import { budgetOf, coinsOf, mediaUrl, ownerBalance } from "@/server/store";

export const dynamic = "force-dynamic";

/** The signed-in wallet's coins and launcher balance. */
export async function GET() {
  return handle(async () => {
    const me = await currentAddress();
    if (!me) return Response.json({ address: null, coins: [], balance: null });
    const d = db();
    const b = ownerBalance(d, me);
    const coins = coinsOf(d, me).map((c) => ({ id: c.id, slug: c.slug, name: c.name, ticker: c.ticker, avatar: mediaUrl(c.imageId) ?? "/fypad.svg", paused: Boolean(c.paused), budget: budgetOf(c).balance.toString() }));
    return Response.json({ address: me, coins, balance: { earned: b.earned.toString(), paid: b.paid.toString(), available: b.available.toString() } });
  });
}
