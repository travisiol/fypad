import { DatabaseSync } from "node:sqlite";
import { accessSync, constants, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/**
 * One SQLite file (node:sqlite). Path: `FYPAD_DB_PATH`, else `./data/fypad.db`, else the OS temp
 * dir when the disk is read-only (Vercel: /tmp, per instance and ephemeral).
 */
export function resolveDbPath(): { path: string; persistent: boolean } {
  const explicit = process.env["FYPAD_DB_PATH"]?.trim();
  const candidates = explicit ? [explicit] : [join(process.cwd(), "data", "fypad.db")];
  for (const file of candidates) {
    try {
      mkdirSync(/* turbopackIgnore: true */ dirname(file), { recursive: true });
      accessSync(/* turbopackIgnore: true */ dirname(file), constants.W_OK);
      return { path: file, persistent: !process.env["VERCEL"] };
    } catch {
      // fall through to the temp dir
    }
  }
  const dir = join(tmpdir(), "fypad");
  mkdirSync(dir, { recursive: true });
  return { path: join(dir, "fypad.db"), persistent: false };
}

export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, "to" TEXT, mint TEXT, amount TEXT NOT NULL,
    sig TEXT NOT NULL, at INTEGER NOT NULL, note TEXT, cluster TEXT NOT NULL DEFAULT 'mainnet-beta'
  );
  CREATE INDEX IF NOT EXISTS ledger_at ON ledger(at DESC);
  CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes BLOB NOT NULL, createdAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS launches (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, ticker TEXT NOT NULL, setup TEXT NOT NULL,
    imageId TEXT NOT NULL, launcher TEXT NOT NULL, firstBuyLamports TEXT NOT NULL DEFAULT '0', status TEXT NOT NULL,
    paySig TEXT, mint TEXT, sig TEXT, error TEXT, createdAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS coins (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, mint TEXT UNIQUE NOT NULL, name TEXT NOT NULL, ticker TEXT NOT NULL,
    description TEXT NOT NULL, style TEXT NOT NULL, styleNote TEXT NOT NULL, perDay INTEGER NOT NULL, contentPct INTEGER NOT NULL,
    imageId TEXT, owner TEXT NOT NULL, creator TEXT, launchSig TEXT, website TEXT, xUrl TEXT,
    paused INTEGER NOT NULL DEFAULT 0, approve INTEGER NOT NULL DEFAULT 1, nextVideoAt INTEGER NOT NULL,
    videoCount INTEGER NOT NULL DEFAULT 0, lastRegenAt INTEGER NOT NULL DEFAULT 0,
    budgetIn TEXT NOT NULL DEFAULT '0', budgetSpent TEXT NOT NULL DEFAULT '0', createdAt INTEGER NOT NULL,
    lastSig TEXT, pendingNewest TEXT, beforeSig TEXT
  );
  CREATE TABLE IF NOT EXISTS tiktok (
    coinId TEXT PRIMARY KEY, openId TEXT NOT NULL, username TEXT, nickname TEXT, access TEXT NOT NULL, refresh TEXT NOT NULL,
    expiresAt INTEGER NOT NULL, refreshExpiresAt INTEGER NOT NULL, scope TEXT, privacyLevels TEXT, connectedAt INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS oauth_states (state TEXT PRIMARY KEY, coinId TEXT NOT NULL, wallet TEXT NOT NULL, createdAt INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS fee_events (
    mint TEXT NOT NULL, sig TEXT NOT NULL, slot INTEGER NOT NULL, lamports TEXT NOT NULL, coinId TEXT, owner TEXT,
    ownerShare TEXT NOT NULL, content TEXT NOT NULL DEFAULT '0', platform TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (mint, sig)
  );
  CREATE TABLE IF NOT EXISTS owners (wallet TEXT PRIMARY KEY, lamports TEXT NOT NULL DEFAULT '0', paidLamports TEXT NOT NULL DEFAULT '0');
  CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY, coinId TEXT NOT NULL, prompt TEXT NOT NULL, caption TEXT NOT NULL, provider TEXT NOT NULL,
    jobId TEXT, status TEXT NOT NULL, file TEXT, error TEXT, cost TEXT NOT NULL DEFAULT '0',
    post TEXT NOT NULL DEFAULT 'none', publishId TEXT, postUrl TEXT, postError TEXT, postedAt INTEGER,
    createdAt INTEGER NOT NULL, doneAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS videos_coin ON videos(coinId, createdAt DESC);
  CREATE INDEX IF NOT EXISTS videos_done ON videos(status, doneAt DESC);
  CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL);
`;

export function openDb(path: string): DatabaseSync {
  const db = new DatabaseSync(path);
  if (path !== ":memory:") db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec(SCHEMA);
  return db;
}

const holder = globalThis as unknown as { __fypadDb?: { db: DatabaseSync; path: string; persistent: boolean } };

/** The process-wide database (survives dev hot reloads). */
export function db(): DatabaseSync {
  if (!holder.__fypadDb) {
    const { path, persistent } = resolveDbPath();
    holder.__fypadDb = { db: openDb(path), path, persistent };
  }
  return holder.__fypadDb.db;
}

export function dbInfo(): { path: string; persistent: boolean } {
  db();
  const { path, persistent } = holder.__fypadDb!;
  return { path, persistent };
}
