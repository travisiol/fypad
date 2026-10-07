/** Site identity. */
export const SITE = {
  name: "FYPAD",
  ticker: "FYP",
  hook: "Every coin gets a TikTok.",
  description: "Launch a coin, connect a TikTok account for it, and FYPAD makes and posts short AI videos of the coin every day, paid by the coin's own creator fees.",
  port: 3954,
  xHandle: (process.env.NEXT_PUBLIC_X_HANDLE?.trim() || "").replace(/^@/, ""),
  url: process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3954",
  disclaimer: "Every video on FYPAD is AI-generated and labeled as such on TikTok. Tokens are speculative: you can lose what you put in. Not financial advice. Not affiliated with pump.fun, TikTok or Higgsfield.",
} as const;
