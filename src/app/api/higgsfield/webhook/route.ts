import { db } from "@/server/db";
import { pollVideo } from "@/server/videogen";

export const maxDuration = 60;

/**
 * Higgsfield webhook (https://docs.higgsfield.ai/docs/how-to/webhooks). The payload is not trusted: it only
 * tells us which job to re-read through the authenticated status endpoint, exactly like a tick would.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { request_id?: string; status?: string } | null;
  if (!body?.request_id || !body.status) return Response.json({ error: "Bad envelope." }, { status: 400 });
  const d = db();
  const row = d.prepare("SELECT id FROM videos WHERE jobId = ? AND provider = 'higgsfield'").get(String(body.request_id)) as { id: string } | undefined;
  if (row) await pollVideo(d, row.id).catch(() => null);
  return Response.json({ ok: true });
}
