import { ENV } from "@/config/fypad";
import { db } from "@/server/db";
import { runTick } from "@/server/videogen";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function authorised(request: Request): boolean {
  const secret = ENV.tickSecret();
  if (!secret) return false;
  const h = request.headers.get("authorization") ?? "";
  return h === `Bearer ${secret}` || request.headers.get("x-tick-secret") === secret;
}

async function run(request: Request) {
  if (!authorised(request)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const r = await runTick(db());
  return Response.json(r);
}

/** Vercel cron calls GET with `Authorization: Bearer CRON_SECRET`. */
export const GET = run;
export const POST = run;
