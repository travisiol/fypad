"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, ensureSession, errorText, readFileAsDataUrl, sendPrepared } from "@/components/actions";
import { PlayGlyph } from "@/components/Phone";
import { useWallet } from "@/components/wallet/store";

type StyleKey = "meme" | "hype" | "presenter";

export interface FlowConfig {
  styles: { key: StyleKey; label: string; hint: string }[];
  perDay: number[];
  contentOptions: number[];
  contentDefault: number;
  platform: number;
  costSol: string;
  maxImageMb: number;
}

const STEPS = ["Identity", "Video style", "Schedule", "Fee split", "Pay"] as const;

export function LaunchFlow({ cfg }: { cfg: FlowConfig }) {
  const w = useWallet();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [description, setDescription] = useState("");
  const [image, setImage] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [style, setStyle] = useState<StyleKey>("meme");
  const [styleNote, setStyleNote] = useState("");
  const [perDay, setPerDay] = useState(1);
  const [content, setContent] = useState(cfg.contentDefault);
  const [firstBuy, setFirstBuy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const launcherPct = 100 - cfg.platform - content;
  const valid = [
    name.trim().length >= 2 && /^\$?[A-Za-z0-9]{2,10}$/.test(ticker.trim()) && description.trim().length >= 8 && Boolean(image),
    styleNote.trim().length >= 6,
    true,
    true,
    true,
  ];

  async function pickImage(file: File | undefined) {
    setError("");
    if (!file) return;
    if (file.size > cfg.maxImageMb * 1024 * 1024) return setError(`The image must be under ${cfg.maxImageMb} MB.`);
    try {
      setImage(await readFileAsDataUrl(file));
    } catch (e) {
      setError(errorText(e));
    }
  }

  async function launch() {
    setError("");
    setBusy(true);
    try {
      if (!(await ensureSession(w))) return;
      setStatus("Preparing…");
      const prep = await api<{ id: string; transaction: string | null }>("/api/launch", {
        name,
        ticker,
        description,
        imageDataUrl: image,
        website,
        x,
        style,
        styleNote,
        perDay,
        contentPct: content,
        firstBuySol: firstBuy,
      });
      let sig: string | null = null;
      if (prep.transaction) {
        setStatus("Sign the first buy in your wallet…");
        sig = await sendPrepared(prep.transaction);
      }
      setStatus("Launching on pump.fun…");
      const done = await api<{ slug: string }>("/api/launch", { action: "submit", id: prep.id, sig });
      router.push(`/${done.slug}`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }

  const styleLabel = cfg.styles.find((s) => s.key === style)?.label ?? "";

  return (
    <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="tile min-w-0 p-5 sm:p-7">
        <ol className="no-scrollbar flex gap-2 overflow-x-auto pb-1" aria-label="Steps">
          {STEPS.map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => i <= step || valid.slice(0, i).every(Boolean) ? setStep(i) : undefined}
                className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-semibold ${i === step ? "border-foreground bg-foreground text-background" : "border-border text-muted-foreground"}`}
              >
                {i + 1} · {s}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-7 min-h-[300px]">
          {step === 0 && (
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="label">Name</span>
                  <input className="field" data-testid="name" value={name} maxLength={32} onChange={(e) => setName(e.target.value)} placeholder="Frog Taxes" />
                </label>
                <label className="grid gap-1.5">
                  <span className="label">Ticker</span>
                  <input className="field mono uppercase" data-testid="ticker" value={ticker} maxLength={11} onChange={(e) => setTicker(e.target.value)} placeholder="FROG" />
                </label>
              </div>
              <label className="grid gap-1.5">
                <span className="label">What is the coin about</span>
                <textarea className="field min-h-[88px]" data-testid="description" value={description} maxLength={280} onChange={(e) => setDescription(e.target.value)} placeholder="A frog who files everyone's taxes, badly." />
              </label>
              <label className="grid gap-1.5">
                <span className="label">Image (PNG, JPG, WEBP or GIF, up to {cfg.maxImageMb} MB)</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-testid="image" className="field text-[13px]" onChange={(e) => pickImage(e.target.files?.[0])} />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1.5">
                  <span className="label">Website (optional)</span>
                  <input className="field" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="frogtaxes.xyz" />
                </label>
                <label className="grid gap-1.5">
                  <span className="label">X link (optional)</span>
                  <input className="field" value={x} onChange={(e) => setX(e.target.value)} placeholder="x.com/frogtaxes" />
                </label>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {cfg.styles.map((s) => (
                  <button key={s.key} type="button" data-testid={`style-${s.key}`} onClick={() => setStyle(s.key)} className={`tile p-4 text-left ${style === s.key ? "tile-active" : ""}`}>
                    <div className="font-display text-[18px]">{s.label}</div>
                    <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground">{s.hint}</p>
                  </button>
                ))}
              </div>
              <label className="grid gap-1.5">
                <span className="label">The coin&apos;s video style, in one sentence</span>
                <textarea className="field min-h-[80px]" data-testid="style-note" value={styleNote} maxLength={240} onChange={(e) => setStyleNote(e.target.value)} placeholder="A deadpan frog in a tiny office, stamping forms, always one step behind." />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-4">
              <span className="label">Videos a day</span>
              <div className="grid grid-cols-3 gap-3">
                {cfg.perDay.map((n) => (
                  <button key={n} type="button" data-testid={`per-day-${n}`} onClick={() => setPerDay(n)} className={`tile py-6 text-center ${perDay === n ? "tile-active" : ""}`}>
                    <div className="font-display text-[40px] leading-none">{n}</div>
                    <div className="mt-1 text-[12.5px] text-muted-foreground">a day</div>
                  </button>
                ))}
              </div>
              <p className="text-[14px] text-muted-foreground">
                Each video costs {cfg.costSol} SOL from the coin&apos;s content budget. When the budget is short, the next video waits for fees. You can pause any time.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <span className="label">Share of creator fees that pays for videos</span>
              <div className="flex flex-wrap gap-2">
                {cfg.contentOptions.map((n) => (
                  <button key={n} type="button" data-testid={`content-${n}`} onClick={() => setContent(n)} className={`rounded-full border px-4 py-2 font-semibold ${content === n ? "border-foreground bg-foreground text-background" : "border-border"}`}>
                    {n} %
                  </button>
                ))}
              </div>
              <div className="flex h-12 overflow-hidden rounded-xl text-[12.5px] font-semibold">
                <div className="grid place-items-center bg-amber text-ink" style={{ width: `${content}%` }}>
                  Content {content} %
                </div>
                {launcherPct > 0 && (
                  <div className="grid place-items-center bg-ink text-[#f6f1e8]" style={{ width: `${launcherPct}%` }}>
                    You {launcherPct} %
                  </div>
                )}
                <div className="grid place-items-center bg-sand text-ink" style={{ width: `${cfg.platform}%` }}>
                  $FYP {cfg.platform} %
                </div>
              </div>
              <p className="text-[14px] text-muted-foreground">
                You keep {launcherPct} % of the coin&apos;s creator fees, withdrawable from My coins. {cfg.platform} % buys and burns $FYP. The split is fixed at launch.
              </p>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-5">
              <dl className="grid grid-cols-2 gap-3 text-[14px] sm:grid-cols-3">
                <Row k="Coin" v={`${name || "—"} · $${ticker.replace(/^\$/, "").toUpperCase() || "—"}`} />
                <Row k="Style" v={styleLabel} />
                <Row k="Videos" v={`${perDay} a day`} />
                <Row k="Content share" v={`${content} %`} />
                <Row k="Your share" v={`${launcherPct} %`} />
                <Row k="Launch fee" v="Free" />
              </dl>
              <label className="grid gap-1.5 sm:max-w-xs">
                <span className="label">First buy in SOL (optional)</span>
                <input className="field mono" data-testid="first-buy" inputMode="decimal" value={firstBuy} onChange={(e) => setFirstBuy(e.target.value)} placeholder="0" />
              </label>
              <p className="text-[13px] text-muted-foreground">
                The coin launches on pump.fun from the FYPAD launch wallet, which is its creator of record. A first buy is one transfer you sign; the tokens it buys are forwarded to you.
              </p>
              <button type="button" className="btn-hot inline-flex h-13 items-center justify-center gap-2 rounded-full px-8 py-3.5 text-[16px] sm:w-fit" data-testid="launch" disabled={busy} onClick={launch}>
                {busy && <span className="spinner" />}
                {busy ? status || "Working…" : "Launch the coin"}
              </button>
            </div>
          )}
        </div>

        {error && (
          <p role="alert" className="notice notice-alert mt-5">
            {error}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between border-t border-border pt-5">
          <button type="button" className="btn btn-quiet" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
            Back
          </button>
          {step < STEPS.length - 1 && (
            <button type="button" className="btn btn-primary" data-testid="next" disabled={!valid[step]} onClick={() => setStep((s) => s + 1)}>
              Next
            </button>
          )}
        </div>
      </div>

      {/* the visitor's own draft, in the card shape it will take */}
      <div className="mx-auto w-full max-w-[300px]">
        <div className="phone phone-empty">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
          ) : (
            <div className="absolute inset-0 grid place-items-center">
              <PlayGlyph />
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-4">
            <div className="text-[14px] font-semibold text-white">
              {name || "Your coin"} <span className="mono text-[12px] text-white/70">${ticker.replace(/^\$/, "").toUpperCase() || "TICKER"}</span>
            </div>
            <p className="mt-1 line-clamp-3 text-[12.5px] text-white/80">{styleNote || description || "Your coin's videos land here, one card each."}</p>
            <p className="mono mt-2 text-[11px] text-white/60">
              {styleLabel} · {perDay}/day
            </p>
          </div>
        </div>
        <p className="mt-3 text-center text-[12px] text-muted-foreground">Your draft. Nothing launches until you press Launch.</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="tile p-3">
      <dt className="label">{k}</dt>
      <dd className="mt-1 font-semibold">{v}</dd>
    </div>
  );
}
