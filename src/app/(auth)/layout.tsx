import { CheckCircle2, FileSpreadsheet, ScanLine, ShieldCheck } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";
import { ThemeToggle } from "@/components/theme-toggle";

const HIGHLIGHTS = [
  {
    icon: ScanLine,
    title: "קריאת חשבוניות ב-AI",
    description: "צלמו תעודת משלוח או העלו PDF וקבלו שורות מובנות ומוכנות לאימות.",
  },
  {
    icon: CheckCircle2,
    title: "מלאי מדויק לכל מחסן",
    description: "תנועות, יתרות, וריאציות וברקודים פנימיים מעודכנים באותה פעולה.",
  },
  {
    icon: FileSpreadsheet,
    title: "ייצוא מוכן לקופה",
    description: "קובץ Excel בתבנית הקופה עם בדיקת חוסרים אוטומטית ומעקב העלאה.",
  },
] as const;

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-full flex-1 lg:grid-cols-12">
      {/* Brand showcase side (desktop) */}
      <aside className="relative hidden overflow-hidden border-e border-line bg-surface lg:col-span-5 lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-50 dark:opacity-35"
          style={{
            backgroundImage:
              "radial-gradient(circle at 18% 12%, color-mix(in srgb, var(--bos-accent) 18%, transparent), transparent 48%), radial-gradient(circle at 82% 88%, color-mix(in srgb, var(--bos-accent) 14%, transparent), transparent 50%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <BrandMark />
        </div>

        <div className="relative my-auto py-10">
          <span className="badge mb-4 bg-accent-soft text-accent-strong">
            <ShieldCheck className="size-3.5" aria-hidden />
            <span>מערכת תפעול לעסקים קטנים ובינוניים</span>
          </span>
          <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-ink">
            מקליטת סחורה ועד מלאי מסונכרן — במקום אחד.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            פחות הקלדות ידניות, אפס כפילויות, ושליטה מלאה על קטלוג, ספקים ומחירים.
          </p>

          <ul className="mt-8 flex flex-col gap-5">
            {HIGHLIGHTS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.title} className="flex items-start gap-3.5">
                  <span className="icon-box mt-0.5">
                    <Icon className="size-4.5" aria-hidden />
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
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <BrandMark />
          </div>
          <div className="card p-6 sm:p-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
