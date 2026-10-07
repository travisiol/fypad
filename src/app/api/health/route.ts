import { ENV } from "@/config/fypad";
import { SITE } from "@/config/site";
import { serverCluster, serverMint } from "@/config/solana";
import { dbInfo } from "@/server/db";
import { operatorAddress } from "@/server/operator";

export const dynamic = "force-dynamic";

export async function GET() {
  const { persistent } = dbInfo();
  return Response.json(
    {
      ok: true,
      name: SITE.name,
      cluster: serverCluster(),
      mint: serverMint(),
      operator: operatorAddress(),
      launching: Boolean(ENV.launchWebhook() && operatorAddress()),
      video: ENV.videoProvider(),
      generation: Boolean(ENV.videoProvider() === "openai" ? ENV.openaiKey() : ENV.higgsfieldCredentials()),
      tiktok: Boolean(ENV.tiktokClientKey() && ENV.tiktokClientSecret() && ENV.tokenSecret()),
      storage: persistent ? "disk" : "ephemeral",
      at: new Date().toISOString(),
    },
    { headers: { "cache-control": "no-store" } },
  );
}
