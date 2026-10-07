import { db } from "@/server/db";
import { HttpError } from "@/server/errors";
import { getCoin } from "@/server/store";
import { handleCallback } from "@/server/tiktok";

export const maxDuration = 60;

/** TikTok redirects here with ?code&state (or ?error). We store the tokens and send the launcher back. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const d = db();
  const back = (slug: string | null, q: string) => Response.redirect(new URL(slug ? `/manage/${slug}?${q}` : `/manage?${q}`, url.origin), 303);
  const st = d.prepare("SELECT coinId FROM oauth_states WHERE state = ?").get(state) as { coinId: string } | undefined;
  const slug = st ? (getCoin(d, st.coinId)?.slug ?? null) : null;
  if (!code) {
    d.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
    return back(slug, "tiktok=cancelled");
  }
  try {
    await handleCallback(d, code, state);
    return back(slug, "tiktok=connected");
  } catch (e) {
    return back(slug, `tiktok=error&reason=${encodeURIComponent(e instanceof HttpError ? e.message : "TikTok did not answer.")}`);
  }
}
