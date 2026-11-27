export type NavLink = { href: string; label: string };

export type Area = NavLink & {
  /** Path prefixes that belong to the area. */
  paths: string[];
  links?: NavLink[];
  managersOnly?: boolean;
};

// The top row is what the business runs on; each area keeps its own screens below it.
export const AREAS: Area[] = [
  { href: "/", label: "ראשי", paths: [] },
  {
    href: "/products",
    label: "מלאי",
    paths: ["/products", "/receiving", "/suppliers", "/exports", "/sales", "/reports"],
    links: [
      { href: "/products", label: "מוצרים ומלאי" },
      { href: "/receiving", label: "קליטת סחורה" },
      { href: "/suppliers", label: "ספקים" },
      { href: "/exports", label: "ייצוא לקופה" },
      { href: "/sales", label: "מכירות" },
      { href: "/reports/stock", label: "חוסרים" },
      { href: "/reports/sales", label: "דוח מכירות" },
    ],
  },
  {
    href: "/campaigns",
    label: "קמפיינים",
    paths: ["/campaigns", "/ads", "/crm"],
    links: [
      { href: "/campaigns", label: "קמפיינים ותוכן" },
      { href: "/ads", label: "פרסום ממומן" },
      { href: "/crm", label: "לקוחות" },
    ],
  },
  {
    href: "/accounting",
    label: "ראיית חשבון",
    paths: ["/accounting", "/finance"],
    links: [
      { href: "/accounting", label: "ראיית חשבון" },
      { href: "/finance", label: "יומן כספים" },
    ],
    managersOnly: true,
  },
  {
    href: "/settings",
    label: "הגדרות",
    paths: ["/settings", "/integrations"],
    links: [
      { href: "/settings", label: "הגדרות" },
      { href: "/integrations", label: "אינטגרציות" },
    ],
  },
];

export type FooterColumn = { title: string; links: NavLink[] };

/** Footer of the entry screens: jumps to the sections of the landing story. */
export const LANDING_FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "המערכת",
    links: [
      { href: "#initiative", label: "יוזמות" },
      { href: "#how", label: "איך זה עובד" },
      { href: "#features", label: "יכולות" },
    ],
  },
  {
    title: "עזרה",
    links: [
      { href: "#faq", label: "שאלות נפוצות" },
      { href: "#start", label: "מתחילים" },
    ],
  },
  {
    title: "חשבון",
    links: [
      { href: "/login", label: "התחברות" },
      { href: "/signup", label: "הרשמה" },
    ],
  },
];
