import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Barlow_Condensed, IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { Header, XIcon } from "@/components/Chrome";
import { Logo } from "@/components/Logo";
import { WalletDialog } from "@/components/wallet/WalletDialog";
import { SITE } from "@/config/site";
import { CLUSTER } from "@/config/solana";
import "./globals.css";

const display = Barlow_Condensed({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-barlow" });
const body = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-jakarta" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.hook}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: `${SITE.name} — ${SITE.hook}`, description: SITE.description },
};

export const viewport: Viewport = { themeColor: "#f6f1e8" };

const xUrl = SITE.xHandle ? `https://x.com/${SITE.xHandle}` : null;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="min-h-svh">
        <div className="min-h-screen bg-background">
          <Header xUrl={xUrl} />
          <main>{children}</main>
          <footer className="border-t border-border bg-background">
            <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
              <div>
                <Link href="/" className="inline-flex items-center gap-2.5">
                  <Logo className="h-8 w-8" />
                  <span className="font-display text-[24px] leading-none tracking-tight">FYPAD</span>
                </Link>
                <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">{SITE.disclaimer}</p>
              </div>
              <FooterCol title="Product" links={[["/explore", "Explore"], ["/foryou", "For you"], ["/launch", "Launch"], ["/manage", "My coins"]]} />
              <FooterCol title="Open books" links={[["/docs", "Documentation"], ["/ledger", "Ledger"], ["/api/health", "Status"]]} />
              <FooterCol title="Support" links={[["/docs#faq", "Help"], ...(xUrl ? [[xUrl, `X @${SITE.xHandle}`] as [string, string]] : [])]} />
            </div>
            <div className="border-t border-border">
              <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-5 text-xs text-muted-foreground sm:px-6 lg:px-8">
                <span className="flex items-center gap-2">
                  © 2026 FYPAD
                  {xUrl && (
                    <a href={xUrl} className="inline-flex items-center gap-1 hover:text-foreground">
                      · <XIcon className="h-3 w-3" />@{SITE.xHandle}
                    </a>
                  )}
                </span>
                <span className="mono">Solana · {CLUSTER === "devnet" ? "devnet" : "mainnet"}</span>
              </div>
            </div>
          </footer>
        </div>
        <WalletDialog />
      </body>
    </html>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="label">{title}</div>
      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
        {links.map(([href, label]) => (
          <li key={href}>
            <a href={href} className="hover:text-foreground">
              {label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
