/**
 * Higgsfield video adapter (server-side only). Async contract, verified on 2026-10-07 against
 *   https://docs.higgsfield.ai/docs/quickstart
 *   https://docs.higgsfield.ai/docs/models/seedance-2/text-to-video
 *   https://docs.higgsfield.ai/docs/how-to/webhooks
 * and the official npm package @higgsfield/client@0.2.6 (v2 client: same base URL, auth header and status path):
 *
 *   POST {base}/bytedance/seedance-2.0/text-to-video        (endpoint id = HIGGSFIELD_VIDEO_MODEL)
 *        Authorization: Key KEY_ID:KEY_SECRET, Idempotency-Key: <our video id>
 *        {prompt, duration 4–15, resolution "480p|720p|1080p|4k", aspect_ratio "9:16", generate_audio}
 *        [?hf_webhook=<https url>]                          → {status:"queued", request_id, status_url, cancel_url}
 *   GET  {base}/requests/{request_id}/status               → {status: queued|in_progress|completed|failed|nsfw|canceled,
 *                                                             video: {url}}
 *
 * The site never waits for a generation inside one request: the tick creates the job, later ticks (or the
 * webhook, which only triggers an authenticated status read) poll it, and the mp4 is downloaded once.
 * HIGGSFIELD_BASE_URL exists for the tests and the local rig.
 */
import { ENV, VIDEO_ASPECT, VIDEO_SECONDS } from "../config/fypad.ts";
import type { VideoJob, VideoMaker } from "./videogen.ts";

type HfStatus = { status?: string; request_id?: string; video?: { url?: string } | null; error?: string | null };

function toJob(r: HfStatus, fallbackId = ""): VideoJob {
  const s = String(r.status ?? "");
  const id = String(r.request_id ?? fallbackId);
  if (s === "completed") return { id, status: "completed", error: null, url: r.video?.url ?? null };
  if (s === "queued" || s === "in_progress") return { id, status: s, error: null, url: null };
  const error = s === "nsfw" ? "The video was refused by moderation." : s === "canceled" ? "The job was canceled." : "The video model could not finish this clip.";
  return { id, status: "failed", error, url: null };
}

/** Null without credentials: callers answer with their neutral message. */
export function higgsfield(fetcher: typeof fetch = fetch): VideoMaker | null {
  const creds = ENV.higgsfieldCredentials();
  if (!creds) return null;
  const base = ENV.higgsfieldBase();
  const headers = { authorization: `Key ${creds}`, "content-type": "application/json" };
  return {
    name: "higgsfield",
    async create(prompt, opts) {
      const hook = opts.webhookUrl?.startsWith("https://") ? `?hf_webhook=${encodeURIComponent(opts.webhookUrl)}` : "";
      const r = await fetcher(`${base}/${ENV.higgsfieldModel().replace(/^\//, "")}${hook}`, {
        method: "POST",
        headers: { ...headers, "idempotency-key": opts.idempotencyKey },
        body: JSON.stringify({ prompt, duration: VIDEO_SECONDS, resolution: ENV.higgsfieldResolution(), aspect_ratio: VIDEO_ASPECT, generate_audio: true }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`higgsfield create ${r.status}`);
      const job = toJob((await r.json()) as HfStatus);
      if (!job.id) throw new Error("higgsfield: no request_id");
      return job;
    },
    async get(id) {
      const r = await fetcher(`${base}/requests/${encodeURIComponent(id)}/status`, { headers, signal: AbortSignal.timeout(20_000) });
      if (!r.ok) throw new Error(`higgsfield status ${r.status}`);
      return toJob((await r.json()) as HfStatus, id);
    },
    async content(job) {
      if (!job.url) throw new Error("higgsfield: no video url");
      const r = await fetcher(job.url, { signal: AbortSignal.timeout(45_000) });
      if (!r.ok) throw new Error(`higgsfield download ${r.status}`);
      return Buffer.from(await r.arrayBuffer());
    },
  };
}
