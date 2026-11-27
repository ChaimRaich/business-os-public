"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Bot,
  FileUp,
  Landmark,
  LayoutDashboard,
  Megaphone,
  Moon,
  Package,
  PlugZap,
  Plus,
  Search,
  Settings,
  Truck,
  Users,
  X,
} from "lucide-react";

type CommandItem = {
  id: string;
  label: string;
  subtitle: string;
  keywords: string;
  href?: string;
  action?: "toggle-theme";
  /** Hidden from staff, like the matching area in the top bar. */
  managersOnly?: boolean;
  icon: typeof LayoutDashboard;
};

const COMMANDS: readonly CommandItem[] = [
  {
    id: "home",
    label: "ראשי",
    subtitle: "סקירה כללית של העסק",
    keywords: "ראשי דשבורד בית home dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    id: "workers",
    label: "עובדים",
    subtitle: "הצ׳אטים של העסק: מנהל העבודה ועובד לכל תחום",
    keywords: "עובדים צאט צ׳אט עוזר שיחה workers chat assistant",
    href: "/workers",
    icon: Bot,
  },
  {
    id: "rec-new",
    label: "קליטת סחורה חדשה",
    subtitle: "העלאת חשבונית או תעודת משלוח",
    keywords: "קליטה חדשה חשבונית העלאה upload receiving",
    href: "/receiving/new",
    icon: Plus,
  },
  {
    id: "rec",
    label: "קליטת סחורה",
    subtitle: "מסמכים, אימות וייצוא לקופה",
    keywords: "קליטה מסמכים קופה receiving",
    href: "/receiving",
    icon: FileUp,
  },
  {
    id: "prod",
    label: "מוצרים ומלאי",
    subtitle: "דגמים, וריאציות וברקודים",
    keywords: "מוצרים קטלוג ברקוד מקט מלאי products stock",
    href: "/products",
    icon: Package,
  },
  {
    id: "prod-new",
    label: "מוצר חדש",
    subtitle: "הוספת מוצר ווריאציות לקטלוג",
    keywords: "מוצר חדש הוספה new product",
    href: "/products/new",
    icon: Plus,
  },
  {
    id: "sup",
    label: "ספקים",
    subtitle: "קודי קופה, תמחור וברקוד רץ",
    keywords: "ספקים suppliers",
    href: "/suppliers",
    icon: Truck,
  },
  {
    id: "exports",
    label: "ייצוא לקופה",
    subtitle: "קבצים שהופקו לקופה",
    keywords: "ייצוא קופה אקסל exports pos",
    href: "/exports",
    icon: FileUp,
  },
  {
    id: "sales",
    label: "מכירות",
    subtitle: "ייבוא דוחות מכירה מהקופה ומהאתר",
    keywords: "מכירות ייבוא sales",
    href: "/sales",
    icon: Package,
  },
  {
    id: "rep-stock",
    label: "חוסרים",
    subtitle: "מה חסר ומה להזמין מהספקים",
    keywords: "חוסרים מלאי הזמנה דוח stock report",
    href: "/reports/stock",
    icon: Package,
  },
  {
    id: "rep-sales",
    label: "דוח מכירות",
    subtitle: "מכירות לפי תקופה, מוצר וספק",
    keywords: "דוח מכירות sales report",
    href: "/reports/sales",
    icon: Landmark,
  },
  {
    id: "camp",
    label: "קמפיינים ותוכן",
    subtitle: "קמפיינים ופוסטים",
    keywords: "קמפיינים פוסטים תוכן שיווק campaigns",
    href: "/campaigns",
    icon: Megaphone,
  },
  {
    id: "ads",
    label: "פרסום ממומן",
    subtitle: "Meta, Google, WhatsApp ו-ROAS",
    keywords: "פרסום ממומן קמפיינים שיווק תקציב ads marketing",
    href: "/ads",
    icon: Megaphone,
  },
  {
    id: "crm",
    label: "לקוחות",
    subtitle: "לידים, שלבי מכירה ומועדון VIP",
    keywords: "לקוחות לידים crm customers",
    href: "/crm",
    icon: Users,
  },
  {
    id: "acc",
    label: "ראיית חשבון",
    subtitle: "הוצאות, תשלומים לספקים וייצוא לרואה החשבון",
    keywords: "ראיית חשבון הוצאות תשלומים accounting",
    href: "/accounting",
    icon: Landmark,
    managersOnly: true,
  },
  {
    id: "fin",
    label: "יומן כספים",
    subtitle: "חשבונות בנק, הכנסות, הוצאות ומע״מ",
    keywords: "כספים הנהח חשבונות בנק מעמ יומן finance",
    href: "/finance",
    icon: Landmark,
    managersOnly: true,
  },
  {
    id: "int",
    label: "אינטגרציות",
    subtitle: "קופה, הנה״ח, סליקה ושיווק",
    keywords: "אינטגרציות חיבורים integrations api",
    href: "/integrations",
    icon: PlugZap,
  },
  {
    id: "set",
    label: "הגדרות",
    subtitle: "מחסנים, מחלקות ומשתמשים",
    keywords: "הגדרות מחסנים צוות settings",
    href: "/settings",
    icon: Settings,
  },
  {
    id: "theme",
    label: "החלפת מצב בהיר / כהה",
    subtitle: "שינוי ערכת הנושא של המערכת",
    keywords: "כהה בהיר עיצוב dark light theme",
    action: "toggle-theme",
    icon: Moon,
  },
];

export function CommandPaletteTrigger({ canManage }: { canManage: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      } else if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const commands = COMMANDS.filter((item) => canManage || !item.managersOnly);
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? commands.filter(
        (item) =>
          item.label.toLowerCase().includes(normalized) ||
          item.subtitle.toLowerCase().includes(normalized) ||
          item.keywords.toLowerCase().includes(normalized),
      )
    : commands;

  const clampedIndex = Math.min(
    selectedIndex,
    Math.max(0, filtered.length - 1),
  );

  function execute(item: CommandItem) {
    setOpen(false);
    setQuery("");
    if (item.action === "toggle-theme") {
      // Same switch and storage key as the theme button in the top bar.
      const root = document.documentElement;
      const next = root.dataset.theme === "light" ? "dark" : "light";
      root.dataset.theme = next;
      try {
        localStorage.setItem("theme", next);
      } catch {
        // Private mode: the choice simply lasts for this page.
      }
      return;
    }
    if (item.href) {
      router.push(item.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setQuery("");
          setSelectedIndex(0);
          setOpen(true);
        }}
        className="icon-btn"
        aria-label="ניווט מהיר"
        title="ניווט מהיר (Ctrl K)"
      >
        <Search className="size-4.5" aria-hidden />
      </button>

      {/* Rendered on <body>: the top bar is transformed and would otherwise clip a fixed overlay. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-xs"
            onClick={() => setOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="ניווט מהיר"
          >
            <div
              className="w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface"
              style={{ boxShadow: "var(--elevation-md)" }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                <Search className="size-4.5 shrink-0 text-accent" aria-hidden />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSelectedIndex(0);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSelectedIndex((i) =>
                        Math.min(filtered.length - 1, i + 1),
                      );
                    } else if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSelectedIndex((i) => Math.max(0, i - 1));
                    } else if (
                      event.key === "Enter" &&
                      filtered[clampedIndex]
                    ) {
                      event.preventDefault();
                      execute(filtered[clampedIndex]);
                    }
                  }}
                  placeholder="קפיצה למסך או פעולה…"
                  className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/70"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="סגירה"
                  className="cursor-pointer rounded-lg p-1 text-muted hover:bg-surface-subtle hover:text-ink"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              <ul className="max-h-80 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <li className="px-4 py-8 text-center text-sm text-muted">
                    לא נמצאו תוצאות עבור ״{query}״
                  </li>
                ) : (
                  filtered.map((item, index) => {
                    const Icon = item.icon;
                    const active = index === clampedIndex;
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onMouseEnter={() => setSelectedIndex(index)}
                          onClick={() => execute(item)}
                          className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-right transition-colors ${
                            active
                              ? "bg-accent-soft text-accent-strong"
                              : "text-ink hover:bg-surface-subtle"
                          }`}
                        >
                          <span
                            className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg ${
                              active
                                ? "bg-accent text-(--btn-fg)"
                                : "bg-surface-subtle text-muted"
                            }`}
                          >
                            <Icon className="size-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-semibold">
                              {item.label}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {item.subtitle}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })
                )}
              </ul>

              <div className="flex items-center justify-between border-t border-line bg-surface-subtle/40 px-4 py-2 text-[11px] text-muted">
                <span>חיצים לניווט · Enter לבחירה</span>
                <span>Esc לסגירה</span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
