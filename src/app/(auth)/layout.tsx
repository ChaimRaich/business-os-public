import { CheckCircle2, FileSpreadsheet, Megaphone, ScanLine, ShieldCheck, TrendingUp } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  {
    icon: ScanLine,
    title: "קריאת חשבוניות ב-AI",
    description: "צילום תעודת משלוח או PDF → שורות מובנות, התאמה לקטלוג וייצוא לקופה.",
  },
  {
    icon: FileSpreadsheet,
    title: "הנהלת חשבונות ותזרים",
    description: "חשבונות בנק וסליקה, מעקב הכנסות והוצאות וחישוב מע״מ מוכן לרו״ח.",
  },
  {
    icon: Megaphone,
    title: "קמפיינים ו-CRM משולבים",
    description: "מעקב תקציבי פרסום, לידים, ROAS ומועדון לקוחות VIP במקום אחד.",
  },
] as const;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-12">
      {/* Editorial Brand Showcase (desktop) */}
      <aside className="relative hidden overflow-hidden border-e border-line bg-surface lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-60 dark:opacity-45"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 10%, color-mix(in srgb, var(--bos-accent) 22%, transparent), transparent 46%), radial-gradient(circle at 85% 88%, color-mix(in srgb, var(--bos-accent) 16%, transparent), transparent 48%)",
          }}
          aria-hidden
        />

        <div className="relative flex items-center justify-between">
          <BrandMark />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent-strong">
            <span className="status-dot animate-pulse" aria-hidden />
            <span>ענן מאובטח</span>
          </span>
        </div>

        <div className="relative my-auto py-8">
          <span className="badge mb-3.5 bg-accent-soft text-accent-strong">
            <ShieldCheck className="size-3.5" aria-hidden />
            <span>פלטפורמת ניהול SMB מקצה לקצה</span>
          </span>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-ink">
            מלאי, כספים, קמפיינים ולקוחות — במערכת אחת חכמה.
          </h2>
          <p className="mt-2.5 text-sm leading-relaxed text-muted">
            מחברים את מערכות העסק באשף אתחול מהיר ומקבלים שליטה מלאה בזמן אמת.
          </p>

          {/* Mini Live Dashboard Preview Widget */}
          <div className="mt-6 rounded-2xl border border-line bg-canvas/80 p-4 shadow-xs backdrop-blur-xs">
            <div className="mb-3 flex items-center justify-between text-xs">
              <span className="font-bold text-ink">תמונת מצב עסקית</span>
              <span className="inline-flex items-center gap-1 font-semibold text-accent-strong">
                <TrendingUp className="size-3.5" aria-hidden />
                <bdi dir="ltr">+24.8%</bdi>
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <span className="block text-[10px] text-muted">יתרת חשבונות</span>
                <bdi dir="ltr" className="mt-0.5 block text-right text-sm font-extrabold tabular-nums text-ink">₪148,200</bdi>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <span className="block text-[10px] text-muted">ROAS קמפיינים</span>
                <bdi dir="ltr" className="mt-0.5 block text-right text-sm font-extrabold tabular-nums text-accent-strong">4.6x</bdi>
              </div>
              <div className="rounded-xl border border-line bg-surface p-2.5">
                <span className="block text-[10px] text-muted">אינטגרציות</span>
                <span className="mt-0.5 inline-flex items-center gap-1 text-sm font-extrabold tabular-nums text-ink">
                  <CheckCircle2 className="size-3.5 text-accent" aria-hidden />
                  <span>4/4</span>
                </span>
              </div>
            </div>
            {/* Decorative sparkline */}
            <svg viewBox="0 0 280 42" className="mt-3 h-9 w-full overflow-visible" fill="none" aria-hidden>
              <defs>
                <linearGradient id="authSpark" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--bos-accent)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="var(--bos-accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 34 C 35 30, 55 20, 90 23 C 125 26, 145 12, 185 15 C 220 17, 245 6, 280 4 L 280 42 L 0 42 Z"
                fill="url(#authSpark)"
              />
              <path
                d="M0 34 C 35 30, 55 20, 90 23 C 125 26, 145 12, 185 15 C 220 17, 245 6, 280 4"
                stroke="var(--bos-accent)"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          <ul className="mt-6 flex flex-col gap-4">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex items-start gap-3">
                  <span className="icon-box mt-0.5 size-8">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-bold text-ink">{item.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <p className="relative text-xs text-muted">הפרדת נתונים מלאה בין עסקים · Row Level Security</p>
      </aside>

      {/* Form side */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8 lg:col-span-7">
        <div className="absolute end-4 top-4 sm:end-6 sm:top-6">
          <ThemeToggle />
        </div>
        <div className="page-enter w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark />
          </div>
          <div className="card p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
