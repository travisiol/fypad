import { db } from "@/server/db";
import { assertSameOrigin, handle, readJson } from "@/server/http";
import { currentAddress } from "@/server/session";
import { authorizeUrl } from "@/server/tiktok";
import { ownedCoin } from "@/server/videogen";

/** The launcher asks for the TikTok authorize URL of one of their coins: {coinId} → {url}. */
export async function POST(request: Request) {
  return handle(async () => {
    assertSameOrigin(request);
    const body = await readJson<{ coinId?: string }>(request);
    const me = await currentAddress();
    const d = db();
    const c = ownedCoin(d, me, String(body.coinId ?? ""));
    return Response.json({ url: authorizeUrl(d, c.id, me!) });
  });
}
