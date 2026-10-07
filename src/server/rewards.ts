/**
 * Creator fees → launcher + content budget + $FYP burn. Nothing loops: `runSweep()` runs from `/api/sweep` (cron)
 * or from `after()` on a page load when overdue.
 *  attribute(): reads each launched coin's bonding-curve signatures since its cursor, parses pump.fun TradeEvent
 *               logs, records each `creator_fee` once and splits it: PLATFORM_SHARE % platform (buys and burns
 *               $FYP, burn.ts), the coin's contentPct % to its content budget (spent on videos), the rest to the
 *               launcher (withdrawable).
 *  claim():     collects the operator's pump.fun creator vault when ≥ MIN_CLAIM_LAMPORTS.
 *  withdraw():  the signed-in launcher takes their whole available balance (≥ MIN_PAYOUT_LAMPORTS).
 */
import type { DatabaseSync } from "node:sqlite";
import { PublicKey } from "@solana/web3.js";
import { MIN_CLAIM_LAMPORTS, MIN_PAYOUT_LAMPORTS, SIGS_PER_COIN, SWEEP_EVERY_MS, splitFee } from "../config/fypad.ts";
import { connection, creatorClaimable } from "./chain.ts";
import { db as defaultDb } from "./db.ts";
import { HttpError } from "./errors.ts";
import { PAYOUTS_CLOSED, operatorKeypair, sendAndRecord, sendSol } from "./operator.ts";
import type { PayoutResult } from "./operator.ts";
import { bondingCurvePda, collectCreatorFeeInstruction } from "./pump/instructions.ts";
import { parseEventLogs } from "./pump/events.ts";
import { runBurn } from "./burn.ts";
import type { BurnStep } from "./burn.ts";
import { creditFee, kvGet, kvSet, listCoins, ownerBalance, setOwnerPaid, updateCoin } from "./store.ts";

export interface Cursor {
  lastSig: string | null;
  pendingNewest: string | null;
  beforeSig: string | null;
}

export async function scanMint(mint: string, creator: string | null, cursor: Cursor): Promise<{ hits: { sig: string; slot: number; lamports: bigint }[]; cursor: Cursor }> {
  const conn = connection();
  const curve = bondingCurvePda(new PublicKey(mint));
  const page = await conn.getSignaturesForAddress(curve, { limit: SIGS_PER_COIN, until: cursor.lastSig ?? undefined, before: cursor.beforeSig ?? undefined }, "confirmed");
  const next: Cursor = { ...cursor };
  if (!next.pendingNewest && page.length) next.pendingNewest = page[0].signature;
  const hits: { sig: string; slot: number; lamports: bigint }[] = [];
  for (const s of [...page].reverse()) {
    if (s.err) continue;
    const tx = await conn.getTransaction(s.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" }).catch(() => null);
    let lamports = BigInt(0);
    for (const e of parseEventLogs(tx?.meta?.logMessages ?? [])) {
      if (e.kind !== "trade" || e.mint !== mint) continue;
      if (creator && e.creator !== creator) continue;
      lamports += e.creatorFee;
    }
    if (lamports > BigInt(0)) hits.push({ sig: s.signature, slot: s.slot, lamports });
  }
  if (page.length >= SIGS_PER_COIN) {
    next.beforeSig = page[page.length - 1].signature;
  } else {
    next.lastSig = next.pendingNewest ?? next.lastSig;
    next.pendingNewest = null;
    next.beforeSig = null;
  }
  return { hits, cursor: next };
}

export interface AttributeResult {
  coins: number;
  events: number;
  ownerLamports: bigint;
  contentLamports: bigint;
  platformLamports: bigint;
}

export async function attribute(db: DatabaseSync = defaultDb()): Promise<AttributeResult> {
  const out: AttributeResult = { coins: 0, events: 0, ownerLamports: BigInt(0), contentLamports: BigInt(0), platformLamports: BigInt(0) };
  for (const p of listCoins(db, 10_000)) {
    out.coins++;
    try {
      const { hits, cursor } = await scanMint(p.mint, p.creator, { lastSig: p.lastSig, pendingNewest: p.pendingNewest, beforeSig: p.beforeSig });
      for (const h of hits) {
        const { owner, content, platform } = splitFee(h.lamports, p.contentPct);
        if (creditFee(db, { mint: p.mint, sig: h.sig, slot: h.slot, lamports: h.lamports, coinId: p.id, owner: p.owner, ownerShare: owner, content, platform })) {
          out.events++;
          out.ownerLamports += owner;
          out.contentLamports += content;
          out.platformLamports += platform;
        }
      }
      updateCoin(db, p.id, cursor);
    } catch {
      // RPC refused this coin; its cursor is unchanged and the next sweep retries.
    }
  }
  return out;
}

export type StepResult = { skipped: string } | { sig: string; lamports: bigint } | { error: string };

export async function claim(db: DatabaseSync = defaultDb()): Promise<StepResult> {
  const operator = operatorKeypair();
  if (!operator) return { skipped: "no operator key" };
  const { curveLamports } = await creatorClaimable(operator.publicKey.toBase58());
  if (curveLamports < MIN_CLAIM_LAMPORTS) return { skipped: "under the claim minimum" };
  const result = await sendAndRecord(
    operator,
    [collectCreatorFeeInstruction(operator.publicKey)],
    { kind: "claim", to: operator.publicKey.toBase58(), mint: null, amount: curveLamports, note: "creator fees collected from pump.fun" },
    db,
  );
  if ("sig" in result) {
    kvSet(db, "claimedLamports", (BigInt(kvGet(db, "claimedLamports") ?? "0") + curveLamports).toString());
    return { sig: result.sig, lamports: curveLamports };
  }
  return result;
}

export async function runSweep(db: DatabaseSync = defaultDb(), fetcher: typeof fetch = fetch): Promise<{ at: number; attribute: AttributeResult; claim: StepResult; burn: BurnStep } | { skipped: string }> {
  const lock = Number(kvGet(db, "sweepLock") ?? 0);
  if (Date.now() - lock < 90_000) return { skipped: "a sweep is already running" };
  kvSet(db, "sweepLock", String(Date.now()));
  try {
    const attributed = await attribute(db);
    const claimed = await claim(db).catch(() => ({ error: "claim failed" }) as StepResult);
    const burned = await runBurn(db, fetcher).catch(() => ({ error: "burn failed" }) as BurnStep);
    const at = Date.now();
    kvSet(db, "lastSweepTry", String(at));
    return { at, attribute: attributed, claim: claimed, burn: burned };
  } finally {
    kvSet(db, "sweepLock", "0");
  }
}

export function sweepDue(db: DatabaseSync = defaultDb(), now = Date.now()): boolean {
  return now - Number(kvGet(db, "lastSweepTry") ?? 0) > SWEEP_EVERY_MS;
}

type Sender = (to: string, lamports: bigint, note: string, db: DatabaseSync, memo: string) => Promise<PayoutResult>;
const defaultSender: Sender = (to, lamports, note, db, memo) => sendSol(to, lamports, note, db, memo);

/** Pays the owner's whole available balance. Reserved before sending so a second request cannot pay twice. */
export async function withdraw(owner: string | null, db: DatabaseSync = defaultDb(), send: Sender = defaultSender): Promise<{ sig: string; lamports: string }> {
  if (!owner) throw new HttpError(401, "Sign in with your wallet first.");
  const { available, paid } = ownerBalance(db, owner);
  if (available < MIN_PAYOUT_LAMPORTS) throw new HttpError(400, "You have less than 0.001 SOL to withdraw.");
  if (!operatorKeypair() && send === defaultSender) throw new HttpError(503, PAYOUTS_CLOSED);
  setOwnerPaid(db, owner, paid + available);
  let result: PayoutResult;
  try {
    result = await send(owner, available, "launcher share of creator fees withdrawn", db, `fypad fees ${owner.slice(0, 8)}`);
  } catch {
    result = { error: "The payout could not be sent." };
  }
  if ("error" in result) {
    setOwnerPaid(db, owner, paid);
    throw new HttpError(502, result.error);
  }
  return { sig: result.sig, lamports: available.toString() };
}
