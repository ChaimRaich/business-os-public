import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Showcase, type ShowcaseTab } from "@/components/motion";

const vars = (values: Record<string, string | number>) => values as CSSProperties;

/* ---------- Animated product mocks. All figures in them are illustrative. ---------- */

const DEMO_ROWS = [
  { code: "7290011223344", name: "טבעת כסף 925", qty: 12, matched: true },
  { code: "SL-2207", name: "שרשרת זהב 14K", qty: 4, matched: true },
  { code: "7290055667788", name: "עגילי פנינה", qty: 20, matched: true },
  { code: "BR-0913", name: "צמיד חרוזים", qty: 8, matched: false },
];

function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="demo-toast pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
      <span className="mock flex items-center gap-2 px-4 py-2.5 text-sm">
        <span className="glyph" style={vars({ "--glyph": "#b4d61f" })}>✓</span>
        {children}
      </span>
    </div>
  );
}

function ReceivingDemo() {
  return (
    <div className="stage relative grid items-center gap-5 p-4 pb-20 sm:grid-cols-[0.75fr_1.5fr] sm:p-8 sm:pb-20" aria-hidden="true">
      <div className="paper mx-auto w-full max-w-52 p-4 sm:-rotate-3">
        <p className="text-[11px] font-bold">תעודת משלוח 4471</p>
        <div className="mt-3 flex flex-col gap-2.5">
          <i className="dark w-2/3" />
          <i />
          <i className="w-5/6" />
          <i className="w-3/4" />
          <i />
          <i className="w-2/3" />
          <i className="w-5/6" />
          <i className="dark w-1/3" />
        </div>
        <span className="scan-beam" />
      </div>
      <div className="mock p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
          <span className="text-sm font-medium">שורות שזוהו</span>
          <span className="chip">קורא את המסמך…</span>
        </div>
        <ul className="divide-y divide-line">
          {DEMO_ROWS.map((row, index) => (
            <li key={row.code} className="demo-row flex items-center gap-3 py-2.5 text-sm" style={vars({ "--i": index })}>
              <bdi dir="ltr" className="hidden w-32 shrink-0 font-mono text-xs text-muted sm:block">{row.code}</bdi>
              <span className="min-w-0 flex-1 truncate">{row.name}</span>
              <span className="tabular-nums text-muted">×{row.qty}</span>
              <span className={row.matched ? "chip" : "chip chip-warn"}>{row.matched ? "זוהה" : "לבדיקה"}</span>
            </li>
          ))}
        </ul>
      </div>
      <Toast>המלאי עודכן · 4 שורות</Toast>
    </div>
  );
}

function CatalogDemo() {
  return (
    <div className="stage relative p-4 sm:p-8" aria-hidden="true">
      <div className="mock mx-auto max-w-xl p-4 sm:p-5">
        <div className="field flex items-center gap-2 text-sm">
          <span className="text-muted">⌕</span>
          <span className="caret font-mono"><span className="typed">SL-2207</span></span>
        </div>
        <div className="demo-row mt-4" style={vars({ "--i": 2 })}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="display text-2xl">שרשרת זהב 14K</span>
            <span className="text-sm text-muted">ספק לדוגמה</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip">45 ס״מ · 6 במלאי</span>
            <span className="chip">50 ס״מ · 3 במלאי</span>
          </div>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            {[
              ["ברקוד", "7290033445566"],
              ["מק״ט ספק", "SL-2207"],
              ["מק״ט קופה", "001482"],
            ].map(([label, code]) => (
              <div key={label} className="rounded-lg bg-canvas px-3 py-2">
                <dt className="text-xs text-muted">{label}</dt>
                <dd><bdi dir="ltr" className="font-mono">{code}</bdi></dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

function ExportDemo() {
  const rows = [
    ["11", "טבעת כסף 925", "תכשיטי כסף", "12"],
    ["14", "שרשרת זהב 14K", "תכשיטי זהב", "4"],
    ["11", "עגילי פנינה", "תכשיטי כסף", "20"],
  ];
  return (
    <div className="stage relative p-4 pb-20 sm:p-8 sm:pb-20" aria-hidden="true">
      <div className="mock mx-auto max-w-xl overflow-hidden text-sm">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-xs text-muted">
          <span className="glyph" style={vars({ "--glyph": "#3ccf7a" })}>X</span>
          <bdi dir="ltr">kupa-export.xlsx</bdi>
        </div>
        <div className="grid grid-cols-[3rem_1.4fr_1fr_3rem] bg-canvas px-4 py-2 text-xs text-muted">
          <span>קוד</span>
          <span>שם פריט</span>
          <span>מחלקה</span>
          <span>כמות</span>
        </div>
        {rows.map((row, index) => (
          <div key={row[1]} className="demo-row grid grid-cols-[3rem_1.4fr_1fr_3rem] border-t border-line px-4 py-2.5" style={vars({ "--i": index })}>
            <span className="tabular-nums text-muted">{row[0]}</span>
            <span className="truncate">{row[1]}</span>
            <span className="truncate text-muted">{row[2]}</span>
            <span className="tabular-nums">{row[3]}</span>
          </div>
        ))}
      </div>
      <Toast>הקובץ מוכן להורדה</Toast>
    </div>
  );
}

/** What the home screen looks like on a working morning. */
const MORNING = [
  { glyph: "↓", tone: "var(--tone-a)", title: "הכנתי הזמנה לספק לדוגמה", reason: "6 פריטים ירדו מתחת לסף, מתוכם 2 אזלו.", action: "לבדיקה ולשליחה" },
  { glyph: "✦", tone: "var(--tone-b)", title: "הכנתי מבצע למלאי שלא זז", reason: "4 מוצרים במלאי לא נמכרו 30 יום.", action: "לפתיחת הקמפיין" },
  { glyph: "₪", tone: "var(--tone-c)", title: "החומר של אוקטובר מוכן לרואה החשבון", reason: "החודש נסגר. 23 מסמכים רוכזו לקובץ אחד.", action: "להורדת הקובץ" },
];

function MorningDemo() {
  return (
    <div className="stage relative p-4 pb-20 sm:p-8 sm:pb-20" aria-hidden="true">
      <div className="mock mx-auto max-w-2xl overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <p className="text-xs text-muted">יום ראשון, 8:02</p>
          <p className="display mt-1 text-xl sm:text-2xl">3 דברים מחכים לכם היום.</p>
        </div>
        <ul className="divide-y divide-line">
          {MORNING.map((item, index) => (
            <li key={item.title} className="demo-row flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4" style={vars({ "--i": index })}>
              <span className="glyph size-9! rounded-[9px]! text-base!" style={vars({ "--glyph": item.tone })}>{item.glyph}</span>
              <span className="min-w-40 flex-1 text-start">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.reason}</span>
              </span>
              <span className="chip">{item.action}</span>
            </li>
          ))}
        </ul>
      </div>
      <Toast>ההזמנה אושרה · נפתחת בוואטסאפ</Toast>
    </div>
  );
}

const HOW_STEPS = [
  {
    title: "מצלמים את תעודת המשלוח",
    body: "המערכת קוראת את השורות, מתאימה אותן לקטלוג ומסמנת מה שלא זוהה. המלאי מתעדכן רק אחרי שאישרתם.",
  },
  {
    title: "מייבאים את המכירות מהקופה",
    body: "מה שנמכר יורד מהמלאי. מכאן המערכת יודעת מה זז, מה עומד על המדף ומה עומד להיגמר.",
  },
  {
    title: "מאשרים את מה שהיא הכינה",
    body: "ההזמנה לספק, המבצע והחומר לרואה החשבון מחכים בדף הבית, מוכנים. אתם בודקים ומאשרים.",
  },
];

const TABS: ShowcaseTab[] = [
  { id: "receiving", label: "קליטה", glyph: "↓", tone: "var(--tone-a)" },
  { id: "catalog", label: "קטלוג", glyph: "≡", tone: "var(--tone-b)" },
  { id: "export", label: "ייצוא לקופה", glyph: "↗", tone: "#4a9bff" },
];

const DOCUMENT_KINDS = [
  "תעודת משלוח",
  "חשבונית מס",
  "חשבונית מס / קבלה",
  "צילום מהנייד",
  "קובץ PDF",
  "מסמך של כמה עמודים",
  "ברקוד",
  "מק״ט ספק",
  "מק״ט קופה",
  "Excel לקופה",
];

const FEATURES = [
  {
    glyph: "#",
    tone: "var(--tone-a)",
    title: "כמה קודים לכל פריט",
    body: "ברקוד, מק״ט ספק, מק״ט קופה ומזהה באתר — לכל וריאציה כמה קודים שצריך. הקוד נשמר בדיוק כפי שהודפס, כולל אפסים מובילים.",
  },
  {
    glyph: "=",
    tone: "var(--tone-b)",
    title: "בלי כפילויות",
    body: "ברקוד, מק״ט קופה ומזהה באתר ייחודיים בעסק. אותו פריט לא ייפתח פעמיים רק כי הספק כתב אותו אחרת.",
  },
  {
    glyph: "▦",
    tone: "var(--tone-c)",
    title: "מוצר, וריאציות, מלאי",
    body: "מוצר הוא דגם; כל מידה וצבע הם וריאציה עם מלאי משלה. מחפשים לפי שם, ספק, או חלק מכל קוד.",
  },
  {
    glyph: "⌂",
    tone: "#4a9bff",
    title: "כמה מחסנים וסניפים",
    body: "לכל עסק מחסן ברירת מחדל, ואפשר להוסיף מחסנים וסניפים. בכל קליטה בוחרים לאן הסחורה נכנסת.",
  },
  {
    glyph: "☺",
    tone: "#3ccf7a",
    title: "הרשאות לפי תפקיד",
    body: "בעלים, מנהל ועובד. כל אחד רואה ועושה רק את מה שהתפקיד שלו מאפשר.",
  },
  {
    glyph: "◈",
    tone: "#ff6b9d",
    title: "הנתונים של העסק נשארים שלו",
    body: "כל רשומה שייכת לעסק אחד ונראית רק לחברים בו. מנהלים כמה עסקים? עוברים ביניהם בלחיצה.",
  },
];

/** What the system starts on its own. The first three work today and are shown in the morning demo; the last three are planned and not built yet. */
const INITIATIVES = [
  {
    glyph: "↓",
    tone: "var(--tone-a)",
    title: "חסר מלאי? ההזמנה כבר מוכנה",
    body: "כשפריט יורד מתחת לסף, המערכת מכינה הזמנה לספק עם הכמויות המוצעות. אתם בודקים ושולחים בוואטסאפ או במייל בלחיצה.",
  },
  {
    glyph: "✦",
    tone: "var(--tone-b)",
    title: "מוצר שלא זז? המבצע מוכן",
    body: "מוצר שנמצא במלאי ולא נמכר 30 יום מקבל קמפיין מוכן לעריכה. אתם מחליטים אם ומתי לפתוח אותו.",
  },
  {
    glyph: "₪",
    tone: "var(--tone-c)",
    title: "נסגר חודש? החומר מרוכז",
    body: "בתחילת כל חודש המערכת מרכזת את הקניות וההוצאות של החודש שנסגר לקובץ אחד לרואה החשבון.",
  },
  {
    glyph: "@",
    tone: "#4a9bff",
    title: "הזמנה שיוצאת לספק לבד",
    body: "ההזמנה תישלח לספק במייל מעצמה, לפי כללים שתקבעו: איזה ספק, מאיזו כמות ובאיזה יום.",
  },
  {
    glyph: "↗",
    tone: "#ff6b9d",
    title: "מבצע שעולה לרשתות",
    body: "הפוסטים של המבצע יתפרסמו באינסטגרם ובפייסבוק ישירות מהמערכת, אחרי האישור שלכם.",
  },
  {
    glyph: "!",
    tone: "#3ccf7a",
    title: "הודעה לטלפון כשיש יוזמה",
    body: "הודעה בוואטסאפ או במייל ברגע שהמערכת הכינה משהו שמחכה לאישור, בלי להיכנס לבדוק.",
  },
];

const FAQ = [
  {
    q: "המערכת עושה דברים בלי לשאול אותי?",
    a: "לא. היא מזהה, מכינה ומציעה: הזמנה לספק, מבצע, קובץ לרואה החשבון. שום דבר לא נשלח, לא מתפרסם ולא מוזמן בלי שאישרתם.",
  },
  {
    q: "אילו מסמכים אפשר להעלות?",
    a: "תעודת משלוח או חשבונית — כצילום או כקובץ PDF. למסמך של כמה עמודים מוסיפים את כולם, לפי הסדר.",
  },
  {
    q: "מה קורה כשפריט לא מזוהה?",
    a: "השורה מסומנת לבדיקה ומופיעה כ״לא נמצא בקטלוג״. אתם מחליטים אם להתאים אותה למוצר קיים או לפתוח מוצר חדש.",
  },
  {
    q: "מתי המלאי מתעדכן?",
    a: "רק אחרי שאישרתם את הקליטה. עד אז השורות הן טיוטה שאפשר לתקן, להוסיף ולמחוק.",
  },
  {
    q: "איך זה מגיע לקופה?",
    a: "מכל קליטה מאושרת נוצר קובץ Excel במבנה של הקופה, עם קוד, מחלקה ותת־מחלקה כפי שהגדרתם בהגדרות.",
  },
  {
    q: "מי רואה את הנתונים שלי?",
    a: "רק משתמשים שצירפתם לעסק. בעלים מנהל את המשתמשים ויכול לשנות תפקיד או להסיר גישה בכל רגע.",
  },
];

/** The long-form story under the hero. `cta` is where the closing button leads. */
export function LandingSections({ cta }: { cta: { href: string; label: string } }) {
  return (
    <>
      <section className="section" id="initiative" data-nav="יוזמות" aria-labelledby="initiative-heading">
        <div className="mx-auto max-w-2xl text-center">
          <p className="eyebrow reveal" suppressHydrationWarning>זה מה שמחכה לכם בכניסה</p>
          <h2 id="initiative-heading" className="section-title reveal mt-3" suppressHydrationWarning style={vars({ "--d": 1 })}>
            המערכת יוזמת. אתם מאשרים.
          </h2>
          <p className="lede reveal mt-4" suppressHydrationWarning style={vars({ "--d": 2 })}>
            רוב המערכות מחכות שתיזכרו. Business OS עוקב אחרי המלאי, המכירות והלוח, ומכין את הצעד הבא לפני שביקשתם.
          </p>
        </div>
        <div className="fx-tilt mx-auto mt-10 max-w-4xl" data-fx suppressHydrationWarning>
          <MorningDemo />
          <p className="mt-3 text-center text-xs text-muted">ההדגמה להמחשה בלבד; הפריטים והמספרים אינם אמיתיים.</p>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-3">
          {INITIATIVES.slice(3).map((item, index) => (
            <article key={item.title} className="card lift spot reveal" suppressHydrationWarning style={vars({ "--d": index })}>
              <span className="glyph size-9! rounded-[9px]! text-base!" style={vars({ "--glyph": item.tone })} aria-hidden="true">
                {item.glyph}
              </span>
              <h3 className="display mt-4 text-xl">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section" id="how" data-nav="איך זה עובד" aria-labelledby="how-heading">
        <div className="max-w-2xl">
          <p className="eyebrow reveal" suppressHydrationWarning>איך זה עובד</p>
          <h2 id="how-heading" className="section-title reveal mt-3" suppressHydrationWarning style={vars({ "--d": 1 })}>
            שלושה צעדים, ומכאן היא עובדת בשבילכם
          </h2>
        </div>
        <ol className="mt-10 grid gap-3 lg:grid-cols-3">
          {HOW_STEPS.map((step, index) => (
            <li key={step.title} className="card reveal" suppressHydrationWarning style={vars({ "--d": index })}>
              <span className="display block text-5xl tabular-nums text-ghost">{index + 1}</span>
              <h3 className="display mt-4 text-xl">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="fx-tilt mx-auto mt-12 max-w-4xl" data-fx suppressHydrationWarning>
          <Showcase tabs={TABS}>
            <ReceivingDemo />
            <CatalogDemo />
            <ExportDemo />
          </Showcase>
          <p className="mt-3 text-center text-xs text-muted">ההדגמה להמחשה בלבד; הפריטים והמספרים אינם אמיתיים.</p>
        </div>
        <p className="eyebrow reveal mt-14 text-center" suppressHydrationWarning>עובד עם המסמכים והקודים שכבר יש לכם</p>
        <div className="marquee reveal mt-6" suppressHydrationWarning style={vars({ "--d": 1 })}>
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex" aria-hidden={copy === 1}>
                {DOCUMENT_KINDS.map((kind) => (
                  <span key={kind} className="marquee-item">
                    <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                    {kind}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="features" data-nav="יכולות" aria-labelledby="features-heading">
        <div className="max-w-2xl">
          <p className="eyebrow reveal" suppressHydrationWarning>בנוי לעסק אמיתי</p>
          <h2 id="features-heading" className="section-title reveal mt-3" suppressHydrationWarning style={vars({ "--d": 1 })}>
            מסתגל לאיך שהעסק שלכם עובד
          </h2>
        </div>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <article key={feature.title} className="card lift spot reveal" suppressHydrationWarning style={vars({ "--d": index % 3 })}>
              <span className="glyph size-9! rounded-[9px]! text-base!" style={vars({ "--glyph": feature.tone })} aria-hidden="true">
                {feature.glyph}
              </span>
              <h3 className="display mt-4 text-xl">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section grid gap-10 lg:grid-cols-[1fr_1.5fr]" id="faq" data-nav="שאלות" aria-labelledby="faq-heading">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <p className="eyebrow reveal" suppressHydrationWarning>שאלות נפוצות</p>
          <h2 id="faq-heading" className="section-title reveal mt-3" suppressHydrationWarning style={vars({ "--d": 1 })}>לפני שמתחילים</h2>
        </div>
        <div className="flex flex-col gap-2">
          {FAQ.map((item, index) => (
            <details key={item.q} className="card reveal group p-0! sm:p-0!" suppressHydrationWarning style={vars({ "--d": index })}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 font-medium [&::-webkit-details-marker]:hidden">
                {item.q}
                <span className="text-xl text-muted transition-transform duration-300 group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="px-5 pb-5 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="section hero text-center" id="start" data-nav="מתחילים" aria-labelledby="cta-heading">
        <h2 id="cta-heading" className="hero-title reveal mx-auto max-w-3xl" suppressHydrationWarning>תנו לעסק להפעיל את עצמו.</h2>
        <p className="lede reveal mx-auto mt-5 max-w-lg" suppressHydrationWarning style={vars({ "--d": 1 })}>
          קלטו את הסחורה וייבאו את המכירות. מכאן המערכת מכינה את ההזמנה הבאה, את המבצע הבא ואת החומר לרואה החשבון.
        </p>
        <div className="reveal mt-8" suppressHydrationWarning style={vars({ "--d": 2 })}>
          <Link href={cta.href} className="btn btn-lg">{cta.label}</Link>
        </div>
      </section>
    </>
  );
}
