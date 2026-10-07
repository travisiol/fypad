/**
 * OpenAI adapter, server-side only. Reads OPENAI_API_KEY / OPENAI_BASE_URL / models from the env at call time;
 * the `fetcher` argument lets tests and the local rig answer instead of the API.
 *  - json():   chat completions with a strict JSON schema (the day's scene + caption).
 *  - sora():   the `openai` SDK's videos resource (Sora) as a VideoMaker, used when VIDEO_PROVIDER=openai.
 */
import OpenAI from "openai";
import { ENV, VIDEO_SECONDS } from "../config/fypad.ts";
import type { VideoJob, VideoMaker } from "./videogen.ts";

export type Fetcher = typeof fetch;

export interface Writer {
  json(system: string, user: string, name: string, schema: Record<string, unknown>): Promise<unknown>;
}

/** Null when no key is set: the scene is then written from the coin's own setup, without a model. */
export function openAiWriter(fetcher: Fetcher = fetch): Writer | null {
  const key = ENV.openaiKey();
  if (!key) return null;
  const base = ENV.openaiBase();
  return {
    async json(system, user, name, schema) {
      const r = await fetcher(`${base}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: ENV.textModel(),
          temperature: 1,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          response_format: { type: "json_schema", json_schema: { name, strict: true, schema } },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!r.ok) throw new Error(`text ${r.status}`);
      const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
      return JSON.parse(String(j.choices?.[0]?.message?.content ?? "")) as unknown;
    },
  };
}

const SORA_SECONDS = String(VIDEO_SECONDS <= 4 ? 4 : VIDEO_SECONDS <= 8 ? 8 : 12) as "4" | "8" | "12";

/** Sora through the official SDK (create → retrieve → downloadContent). Null without a key. */
export function sora(fetcher: Fetcher = fetch): VideoMaker | null {
  const key = ENV.openaiKey();
  if (!key) return null;
  const sdk = () => new OpenAI({ apiKey: key, baseURL: ENV.openaiBase(), fetch: fetcher, maxRetries: 1, timeout: 50_000 });
  const job = (v: { id: string; status: string; error?: { message?: string } | null }): VideoJob => ({
    id: v.id,
    status: (["queued", "in_progress", "completed", "failed"].includes(v.status) ? v.status : "failed") as VideoJob["status"],
    error: v.error?.message ?? null,
    url: null,
  });
  return {
    name: "openai",
    async create(prompt) {
      return job(await sdk().videos.create({ model: ENV.videoModel(), prompt, seconds: SORA_SECONDS, size: "720x1280" }));
    },
    async get(id) {
      return job(await sdk().videos.retrieve(id));
    },
    async content(j) {
      const res = await sdk().videos.downloadContent(j.id);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}
