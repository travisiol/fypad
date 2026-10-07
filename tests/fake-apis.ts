/**
 * Local fakes of every outside API FYPAD talks to, on one OS-assigned port (no network, no real keys):
 *   /hf/*      Higgsfield  (POST /hf/<endpoint id>, GET /hf/requests/{id}/status, GET /hf/files/{id}.mp4)
 *   /tt/*      TikTok      (authorize page that answers at once, /v2/oauth/token/, /v2/oauth/revoke/,
 *                           /v2/post/publish/creator_info/query/, /v2/post/publish/video/init/, PUT upload,
 *                           /v2/post/publish/status/fetch/)
 *   /v1/*      OpenAI      (chat completions json_schema, Sora videos)
 *   /engine    launch engine (LAUNCH_WEBHOOK)
 * Used by tests/fypad.test.ts and scripts/play-ui.mjs. Shapes follow the docs cited in src/server/higgsfield.ts
 * and src/server/tiktok.ts.
 */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface FakeApiState {
  hf: { creates: number; polls: number; bodies: Record<string, unknown>[]; auth: string[]; idem: string[]; fail: "nsfw" | "failed" | null; pollsToFinish: number; jobs: Map<string, number> };
  tt: { tokens: number; refreshes: number; revoked: number; inits: Record<string, unknown>[]; uploads: { range: string; bytes: number }[]; statusCalls: number; statusToFinish: number; validTokens: Set<string> };
  ai: { chats: number; caption: string; scene: string; videos: number };
  engine: { calls: number; bodies: Record<string, unknown>[]; secret: string[]; mint: string; onLaunch?: (mint: string) => void };
}

export const HF_CREDS = "fake-key-id:fake-key-secret";

export function newApiState(mint = ""): FakeApiState {
  return {
    hf: { creates: 0, polls: 0, bodies: [], auth: [], idem: [], fail: null, pollsToFinish: 2, jobs: new Map() },
    tt: { tokens: 0, refreshes: 0, revoked: 0, inits: [], uploads: [], statusCalls: 0, statusToFinish: 2, validTokens: new Set() },
    ai: { chats: 0, caption: "Meet $FROG, the frog who files taxes. Up 500% this week. AI video.", scene: "the frog mascot stamps paperwork at a tiny desk. It will hit $1M soon.", videos: 0 },
    engine: { calls: 0, bodies: [], secret: [], mint },
  };
}

function body(req: IncomingMessage): Promise<Buffer> {
  return new Promise((r) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => r(Buffer.concat(chunks)));
  });
}

export async function startFakeApis(state: FakeApiState = newApiState()): Promise<{ url: string; state: FakeApiState; close: () => Promise<void> }> {
  let url = "";
  const json = (res: ServerResponse, code: number, obj: unknown) => res.writeHead(code, { "content-type": "application/json" }).end(JSON.stringify(obj));
  const ok = (res: ServerResponse, data: unknown) => json(res, 200, { data, error: { code: "ok", message: "", log_id: "fake" } });
  const server = createServer(async (req, res) => {
    const raw = await body(req);
    const u = new URL(req.url ?? "/", "http://x");
    const p = u.pathname;
    const bearer = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    // ── Higgsfield
    if (p.startsWith("/hf/requests/") && p.endsWith("/status")) {
      const id = decodeURIComponent(p.split("/")[3]);
      state.hf.polls++;
      const n = (state.hf.jobs.get(id) ?? 0) + 1;
      state.hf.jobs.set(id, n);
      if (state.hf.fail) return json(res, 200, { status: state.hf.fail, request_id: id });
      if (n < state.hf.pollsToFinish) return json(res, 200, { status: "in_progress", request_id: id });
      return json(res, 200, { status: "completed", request_id: id, video: { url: `${url}/hf/files/${id}.mp4` } });
    }
    if (p.startsWith("/hf/files/")) return res.writeHead(200, { "content-type": "video/mp4" }).end(Buffer.from(`fake-mp4:${p.split("/").pop()}`));
    if (p.startsWith("/hf/") && req.method === "POST") {
      state.hf.creates++;
      state.hf.auth.push(String(req.headers.authorization ?? ""));
      state.hf.idem.push(String(req.headers["idempotency-key"] ?? ""));
      state.hf.bodies.push({ endpoint: p.slice(4), ...JSON.parse(raw.toString("utf8") || "{}") });
      if (req.headers.authorization !== `Key ${HF_CREDS}`) return json(res, 401, { detail: "bad key" });
      const id = `hf-req-${state.hf.creates}`;
      return json(res, 200, { status: "queued", request_id: id, status_url: `${url}/hf/requests/${id}/status`, cancel_url: `${url}/hf/requests/${id}/cancel` });
    }
    // ── TikTok
    if (p === "/tt/authorize") {
      const to = new URL(u.searchParams.get("redirect_uri") ?? "");
      to.searchParams.set("code", "fake-code");
      to.searchParams.set("state", u.searchParams.get("state") ?? "");
      to.searchParams.set("scopes", u.searchParams.get("scope") ?? "");
      return res.writeHead(302, { location: to.toString() }).end();
    }
    if (p === "/tt/v2/oauth/token/") {
      const f = new URLSearchParams(raw.toString("utf8"));
      if (f.get("client_key") !== "fake-client-key" || f.get("client_secret") !== "fake-client-secret") return json(res, 401, { error: "invalid_client" });
      const grant = f.get("grant_type");
      if (grant === "authorization_code" && f.get("code") !== "fake-code") return json(res, 400, { error: "invalid_grant" });
      if (grant === "refresh_token") state.tt.refreshes++;
      else state.tt.tokens++;
      const access = `act.${state.tt.tokens}.${state.tt.refreshes}`;
      state.tt.validTokens.add(access);
      return json(res, 200, { access_token: access, refresh_token: "rft.1", open_id: "open-fake-1", expires_in: 86_400, refresh_expires_in: 31_536_000, scope: "user.info.basic,video.publish", token_type: "Bearer" });
    }
    if (p === "/tt/v2/oauth/revoke/") {
      state.tt.revoked++;
      return json(res, 200, {});
    }
    if (p.startsWith("/tt/v2/") && !state.tt.validTokens.has(bearer)) return json(res, 401, { error: { code: "access_token_invalid", message: "bad token" } });
    if (p === "/tt/v2/post/publish/creator_info/query/") return ok(res, { creator_username: "fypad.frog", creator_nickname: "Frog", privacy_level_options: ["SELF_ONLY"], max_video_post_duration_sec: 600, comment_disabled: false, duet_disabled: false, stitch_disabled: false });
    if (p === "/tt/v2/post/publish/video/init/") {
      const b = JSON.parse(raw.toString("utf8"));
      state.tt.inits.push(b);
      const n = state.tt.inits.length;
      return ok(res, { publish_id: `v_pub_file~v2.${n}`, upload_url: `${url}/tt/upload/${n}` });
    }
    if (p.startsWith("/tt/upload/") && req.method === "PUT") {
      state.tt.uploads.push({ range: String(req.headers["content-range"] ?? ""), bytes: raw.length });
      return res.writeHead(201).end();
    }
    if (p === "/tt/v2/post/publish/status/fetch/") {
      state.tt.statusCalls++;
      if (state.tt.statusCalls < state.tt.statusToFinish) return ok(res, { status: "PROCESSING_UPLOAD", uploaded_bytes: 10 });
      // raw 64-bit integer, as TikTok sends it (a JS number would round it)
      return res.writeHead(200, { "content-type": "application/json" }).end('{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":[7300000000000000001]},"error":{"code":"ok","message":""}}');
    }
    // ── OpenAI
    if (p === "/v1/chat/completions") {
      state.ai.chats++;
      return json(res, 200, { choices: [{ message: { content: JSON.stringify({ scene: state.ai.scene, caption: state.ai.caption }) } }] });
    }
    const video = (status: string) => ({ id: "video_fake_1", object: "video", model: "sora-2", status, progress: 0, created_at: 1, completed_at: null, expires_at: null, prompt: "", remixed_from_video_id: null, seconds: "8", size: "720x1280", error: null });
    if (p === "/v1/videos" && req.method === "POST") {
      state.ai.videos++;
      return json(res, 200, video("queued"));
    }
    if (p === "/v1/videos/video_fake_1") return json(res, 200, video("completed"));
    if (p.startsWith("/v1/videos/video_fake_1/content")) return res.writeHead(200, { "content-type": "video/mp4" }).end(Buffer.from("fake-sora-mp4"));
    // ── launch engine
    if (p === "/engine" && req.method === "POST") {
      state.engine.calls++;
      state.engine.bodies.push(JSON.parse(raw.toString("utf8")));
      state.engine.secret.push(String(req.headers["x-fypad-secret"] ?? ""));
      state.engine.onLaunch?.(state.engine.mint);
      return json(res, 200, { mint: state.engine.mint, signature: "1".repeat(64), creator: "", tokensBought: "0" });
    }
    res.writeHead(404).end("{}");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, state, close: () => new Promise<void>((r) => server.close(() => r())) };
}
