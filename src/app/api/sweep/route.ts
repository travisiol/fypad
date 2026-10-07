import { ENV } from "@/config/fypad";
import { db } from "@/server/db";
import { runSweep } from "@/server/rewards";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function run(request: Request) {
  const secret = ENV.tickSecret();
  const h = request.headers.get("authorization") ?? "";
  if (!secret || (h !== `Bearer ${secret}` && request.headers.get("x-tick-secret") !== secret)) return Response.json({ error: "Not allowed." }, { status: 401 });
  const r = await runSweep(db());
  return Response.json(JSON.parse(JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v))));
}

export const GET = run;
export const POST = run;
