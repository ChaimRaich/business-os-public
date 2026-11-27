import type { ReactNode } from "react";
import Link from "next/link";
import { LandingSections } from "@/components/landing";
import { LogoTile } from "@/components/logo";
import { FooterArt, SectionDots, SiteHeader, ThemeToggle } from "@/components/motion";
import { LANDING_FOOTER_COLUMNS, type FooterColumn } from "@/lib/nav";

export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-3" dir="ltr" aria-label="BusinessOS, לדף הראשי">
      <LogoTile />
      <span className="wordmark">
        Business<span className="wordmark-os">OS</span>
      </span>
    </Link>
  );
}

/** Closes the frame: brand, link columns on the entry screens only, and a ruled base line between two speaker grilles. */
export function SiteFooter({ columns = [], home = "/" }: { columns?: FooterColumn[]; home?: string }) {
  return (
    <footer className="site-footer">
      <div className="rail">
        <div className="flex items-center justify-between gap-4">
          <Wordmark href={home} />
          <a href="#top" className="round-btn" aria-label="חזרה לראש העמוד" title="חזרה למעלה">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </a>
        </div>
        {columns.length > 0 && (
          <nav aria-label="קישורים בתחתית העמוד" className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 sm:grid-cols-3 lg:max-w-3xl">
            {columns.map((column) => (
              <div key={column.title} className="flex min-w-0 flex-col items-start gap-1">
                <h2 className="eyebrow mb-1">{column.title}</h2>
                {column.links.map((link) => (
                  <Link key={link.href} href={link.href} className="footer-link">
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        )}
        <div className={columns.length > 0 ? "footer-base" : "footer-base mt-6!"}>
          <span className="grille" aria-hidden="true" />
          <p>© Business OS · מצלמים · בודקים · מאשרים</p>
          <span className="grille" aria-hidden="true" />
        </div>
      </div>
    </footer>
  );
}

/** The entry screens (login, signup, first business): hero copy over a form card, then the full story. */
export function EntryScreen({
  badge,
  title,
  lede,
  children,
  footer,
}: {
  badge: string;
  title: ReactNode;
  lede: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <div className="frame">
        <SiteHeader>
          <div className="rail nav-in flex min-h-20 items-center gap-4 py-4">
            <Wordmark href="/login" />
            <span className="eyebrow ms-auto hidden md:block">מלאי · קמפיינים · ראיית חשבון</span>
            <span className="ms-auto md:ms-0">
              <ThemeToggle />
            </span>
          </div>
        </SiteHeader>
        <main className="rail flex-1">
          <section className="bleed hero frame-row scroll-mt-24 py-12 text-center sm:py-16" id="enter" data-fx suppressHydrationWarning>
            <div><div className="hero-in flex flex-col items-center">
              <span className="pill">{badge}</span>
              <p className="hero-title mt-5 max-w-3xl">{title}</p>
              <p className="lede mt-6 max-w-xl">{lede}</p>
              <div className="card mt-10 w-full max-w-sm text-start">{children}</div>
              {footer && <div className="mt-4 text-sm text-muted">{footer}</div>}
            </div></div>
          </section>
          <LandingSections cta={{ href: "#enter", label: "מתחילים עכשיו" }} />
        </main>
        <SiteFooter columns={LANDING_FOOTER_COLUMNS} home="/login" />
        <SectionDots />
      </div>
      <FooterArt />
    </>
  );
}
