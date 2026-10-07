# FYPAD — Every coin gets a TikTok.

Launch a pump.fun coin, connect a TikTok account for it, and FYPAD makes and posts short AI videos of the coin every
day, paid by the coin's own creator fees. Next 16 + React 19 + Tailwind 4, `@solana/web3.js`, `node:sqlite`. Port 3954.
Off-chain + SPL: no custom program.

## Mechanic

| Piece | Where |
|---|---|
| Constants (split, styles, per-day options, cost, env names) | `src/config/fypad.ts` |
| Launch wizard (identity → video style → schedule → fee split → pay). Free; optional first buy = one SOL transfer + memo `fypad launch <id>` read back from chain → `LAUNCH_WEBHOOK`. Operator wallet = creator of record. 3 launches / wallet / day | `src/server/launch.ts`, `POST /api/launch`, `/launch` |
| Sweep: pump.fun TradeEvent attribution per coin → **20 % platform** (Jupiter buy & burn of $FYP, held until `NEXT_PUBLIC_MINT`), **content 30–80 %** (launcher's choice, credited to the coin's budget), launcher gets the rest (withdrawable); `collectCreatorFee` claim | `src/server/rewards.ts`, `src/server/burn.ts`, `/api/sweep` |
| Video engine: due coin + budget ≥ `COST_PER_VIDEO_SOL` → job started (cost debited), polled on later ticks, mp4 stored; failed/nsfw jobs refunded. Draft when approve-before-post is ON (default), auto-approved when OFF | `src/server/videogen.ts`, `/api/tick` (cron + `after()` on visits) |
| Higgsfield adapter (default provider): `POST /bytedance/seedance-2.0/text-to-video`, `GET /requests/{id}/status`, `Authorization: Key id:secret`, `Idempotency-Key`, optional `hf_webhook` | `src/server/higgsfield.ts`, `/api/higgsfield/webhook` |
| OpenAI: optional scene/caption writer (json_schema, `$`/`%`/`x` figures stripped); Sora when `VIDEO_PROVIDER=openai` | `src/server/ai.ts` |
| TikTok: OAuth (state, launcher only), tokens AES-GCM at rest + refresh, creator_info → Direct Post init (FILE_UPLOAD, one chunk, `is_aigc`) → PUT → status fetch → published + link | `src/server/tiktok.ts`, `/api/tiktok/connect`, `/api/tiktok/callback` |
| Manage (launcher): connect/disconnect, pause, approve toggle, approve drafts, regenerate (1 / 30 min) | `/manage`, `/manage/[slug]`, `/api/coins/[id]` |
| Pages | `/` `/explore` `/foryou` `/[slug]` `/launch` `/manage` `/ledger` `/docs` |

Webhook contract: `POST LAUNCH_WEBHOOK`, header `x-fypad-secret: LAUNCH_SECRET`, body
`{id, name, ticker, description, imageDataUrl, website, twitter, launcher, firstBuyLamports}` →
`200 {mint, signature, creator, tokensBought?}` (`tokensBought` is forwarded to the launcher).

## Keys and what they unlock

| Key | Unlocks | Without it |
|---|---|---|
| `LAUNCH_WEBHOOK` + `OPERATOR_SECRET_KEY` | launching, sweep claims, payouts | "Launching is not open yet." |
| `HIGGSFIELD_API_KEY` + `HIGGSFIELD_API_SECRET` | video generation (default provider) | ticks start nothing; Regenerate answers "Video generation is not available right now." |
| `OPENAI_API_KEY` | scene/caption writer; Sora if `VIDEO_PROVIDER=openai` | scenes built from the coin's own setup |
| `TIKTOK_CLIENT_KEY` + `TIKTOK_CLIENT_SECRET` + `TOKEN_ENCRYPTION_SECRET` | Connect TikTok + posting | "TikTok connection is not available right now." at click |
| `NEXT_PUBLIC_MINT` | $FYP buy & burn | platform share held |
| `TICK_SECRET` / `CRON_SECRET` | `/api/tick`, `/api/sweep` from cron | visits still trigger overdue runs |

TikTok: register the redirect URI `<NEXT_PUBLIC_SITE_URL>/api/tiktok/callback`, scopes `user.info.basic` and
`video.publish`. **Until TikTok audits the app, Direct Post only allows private (SELF_ONLY) posts and daily caps
apply.** FYPAD never creates TikTok accounts.

The content budget is accounting: its SOL stays in the operator wallet, which pays the video provider (Higgsfield
credits are bought separately by the owner).

## Serverless notes

On Vercel without a persistent `FYPAD_DB_PATH`, coins, budgets, TikTok tokens and fee accounting live in `/tmp` per
instance and are lost on a cold start; mp4s in `FYPAD_VIDEO_DIR` likewise. Plug a durable disk/DB + object store before
launch. Vercel Hobby runs daily crons only; visits also trigger overdue ticks and sweeps.

## Commands

```
npm run dev          # next dev -p 3954
npm test             # node tests on the fake RPC + fake Higgsfield/TikTok/OpenAI/engine (no network)
npx eslint . ; npx next typegen && npx tsc --noEmit ; npx next build
npm run play         # after a build: CDP flow (fake RPC 8954, "Fypad Test" stub wallet) → shots/play-*.png
node scripts/capture.mjs http://localhost:3954
```
