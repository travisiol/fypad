import { db } from "@/server/db";
import { HttpError } from "@/server/errors";
import { assertSameOrigin, handle, readJson } from "@/server/http";
import { currentAddress } from "@/server/session";
import { ENV } from "@/config/fypad";
import { budgetOf, updateCoin, videosOf } from "@/server/store";
import { disconnect, getTikTok, profileUrl } from "@/server/tiktok";
import { approveVideo, ownedCoin, regenerate } from "@/server/videogen";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** The launcher's view of one coin: settings, budget, TikTok, every video with its status. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    const d = db();
    const c = ownedCoin(d, await currentAddress(), (await params).id);
    const t = getTikTok(d, c.id);
    const b = budgetOf(c);
    return Response.json({
      coin: { id: c.id, slug: c.slug, name: c.name, ticker: c.ticker, paused: Boolean(c.paused), approve: Boolean(c.approve), perDay: c.perDay, nextVideoAt: c.nextVideoAt },
      budget: { balance: b.balance.toString(), cost: ENV.costPerVideo().toString() },
      tiktok: t ? { username: t.username, url: profileUrl(t.username), connectedAt: t.connectedAt } : null,
      videos: videosOf(d, c.id, 40).map((v) => ({ id: v.id, status: v.status, post: v.post, caption: v.caption, error: v.error, postError: v.postError, postUrl: v.postUrl, createdAt: v.createdAt })),
    });
  });
}

/** Launcher actions on one coin: pause | resume | approve-mode {on} | approve {videoId} | regenerate | disconnect. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return handle(async () => {
    assertSameOrigin(request);
    const id = (await params).id;
    const body = await readJson<{ action?: string; on?: boolean; videoId?: string }>(request);
    const me = await currentAddress();
    const d = db();
    const c = ownedCoin(d, me, id);
    switch (body.action) {
      case "pause":
      case "resume":
        updateCoin(d, c.id, { paused: body.action === "pause" ? 1 : 0 });
        return Response.json({ ok: true });
      case "approve-mode":
        updateCoin(d, c.id, { approve: body.on ? 1 : 0 });
        return Response.json({ ok: true });
      case "approve": {
        const v = approveVideo(d, me, String(body.videoId ?? ""));
        return Response.json({ ok: true, post: v.post });
      }
      case "regenerate": {
        const v = await regenerate(d, me, c.id);
        return Response.json({ ok: true, id: v.id, status: v.status });
      }
      case "disconnect":
        await disconnect(d, c.id);
        return Response.json({ ok: true });
      default:
        throw new HttpError(400, "Unknown action.");
    }
  });
}
