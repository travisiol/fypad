import { db } from "@/server/db";
import { getVideo } from "@/server/store";
import { videoBytes } from "@/server/videogen";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const v = getVideo(db(), (await params).id);
  const bytes = v && v.post !== "discarded" ? videoBytes(v) : null;
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "content-type": "video/mp4", "cache-control": "public, max-age=31536000, immutable" } });
}
