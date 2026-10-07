import type { Metadata } from "next";
import { explorerUrl } from "@/config/solana";
import type { Cluster } from "@/config/solana";
import { formatSol, shortAddress } from "@/lib/format";
import { listLedger } from "@/server/operator";

export const dynamic = "force-dynamic";
const KIND: Record<string, string> = { "launch-in": "First buy received", sol: "Fee share paid to a launcher", token: "First-buy tokens forwarded", claim: "Creator fees collected", buy: "$FYP bought", burn: "$FYP burned" };
export const metadata: Metadata = { title: "Ledger" };

export default function LedgerPage() {
  const rows = listLedger();
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <h1 className="display-xl glitch-sm text-[clamp(44px,6vw,88px)]">Ledger</h1>
      <p className="mt-3 max-w-xl text-muted">Every transfer into and out of the launch wallet: first buys, creator fees collected from pump.fun, launcher payouts, forwarded tokens, and every $FYP buy and burn, each with its transaction on Solscan.</p>
      <div className="tile mt-8 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-6 text-muted" data-testid="ledger-empty">No transfers yet.</p>
        ) : (
          <table className="table" data-testid="ledger-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Kind</th>
                <th>To</th>
                <th>Amount</th>
                <th>Transaction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const cluster = row.cluster as Cluster;
                return (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap">{new Date(row.at).toISOString().replace("T", " ").slice(0, 16)} UTC</td>
                    <td>{KIND[row.kind] ?? row.kind}</td>
                    <td className="mono">
                      {row.to ? (
                        <a className="link" href={explorerUrl("account", row.to, cluster)} target="_blank" rel="noreferrer">{shortAddress(row.to)}</a>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="mono">{row.kind === "token" || row.kind === "burn" ? row.amount : `${formatSol(BigInt(row.amount))} SOL`}</td>
                    <td className="mono">
                      <a className="link" href={explorerUrl("tx", row.sig, cluster)} target="_blank" rel="noreferrer" data-testid="ledger-sig">
                        {shortAddress(row.sig)}
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
