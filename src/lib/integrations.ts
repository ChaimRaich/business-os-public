import type { Database } from "@/lib/database.types";

export type IntegrationCategory = Database["public"]["Enums"]["integration_category"];
export type IntegrationStatus = Database["public"]["Enums"]["integration_status"];

export type IntegrationProvider = {
  id: string;
  name: string;
  description: string;
  accountLabel: string;
  accountPlaceholder: string;
  supportsLiveKey?: boolean;
};

export type IntegrationCategoryMeta = {
  id: IntegrationCategory;
  title: string;
  shortTitle: string;
  description: string;
  requiredFor: string;
  providers: readonly IntegrationProvider[];
};

export const INTEGRATION_CATEGORIES: readonly IntegrationCategoryMeta[] = [
  {
    id: "pos_commerce",
    title: "קופה ומסחר אלקטרוני",
    shortTitle: "קופה ואתר",
    description: "סנכרון קטלוג, מלאי ומכירות בין הקופה הפיזית לאתר המסחר.",
    requiredFor: "קליטת סחורה, ייצוא לקופה וסנכרון מלאי",
    providers: [
      {
        id: "pos_excel",
        name: "קופה מבוססת Excel",
        description: "ייצוא קובץ .xls מובנה לקופה ומעקב העלאה ידני",
        accountLabel: "שם תוכנת הקופה / סניף ראשי",
        accountPlaceholder: "למשל: קופה ראשית — סניף תל אביב",
      },
      {
        id: "woocommerce",
        name: "WooCommerce (WordPress)",
        description: "חיבור API לחנות WordPress לעדכון מלאי והזמנות",
        accountLabel: "כתובת האתר (URL)",
        accountPlaceholder: "https://shop.example.co.il",
        supportsLiveKey: true,
      },
      {
        id: "shopify",
        name: "Shopify",
        description: "סנכרון דו-כיווני של מוצרים, וריאציות והזמנות",
        accountLabel: "דומיין החנות",
        accountPlaceholder: "my-store.myshopify.com",
        supportsLiveKey: true,
      },
      {
        id: "konimbo",
        name: "Konimbo / Cashcow",
        description: "חיבור API לחנויות מסחר ישראליות",
        accountLabel: "מזהה חנות / דומיין",
        accountPlaceholder: "store-id",
        supportsLiveKey: true,
      },
    ],
  },
  {
    id: "accounting",
    title: "הנהלת חשבונות ורו״ח",
    shortTitle: "הנה״ח ורו״ח",
    description: "הפקת חשבוניות, קליטת הוצאות, מע״מ והעברת חומר מסודר לרואה החשבון.",
    requiredFor: "הנהלת חשבונות, מע״מ ודוחות פיננסיים",
    providers: [
      {
        id: "morning",
        name: "Morning (חשבונית ירוקה)",
        description: "סנכרון חשבוניות, קבלות, הוצאות והקצאת מס",
        accountLabel: "ח.פ. / עוסק מורשה או מזהה API",
        accountPlaceholder: "515000000",
        supportsLiveKey: true,
      },
      {
        id: "icount",
        name: "iCount",
        description: "הפקת מסמכים חשבונאיים ואינטגרציה להנהלת חשבונות",
        accountLabel: "מזהה חברה ב-iCount",
        accountPlaceholder: "company_id",
        supportsLiveKey: true,
      },
      {
        id: "rivhit",
        name: "רווחית (Rivhit)",
        description: "הנהלת חשבונות כפולה וייצוא פקודות יומן",
        accountLabel: "מספר תיק / מזהה עסק",
        accountPlaceholder: "123456",
        supportsLiveKey: true,
      },
      {
        id: "priority",
        name: "Priority / חשבשבת",
        description: "חיבור ERP וחשבונאות לעסקים צומחים",
        accountLabel: "כתובת שרת / שם חברה",
        accountPlaceholder: "company_env",
        supportsLiveKey: true,
      },
      {
        id: "accountant_export",
        name: "תיק דיגיטלי לרו״ח (ידני)",
        description: "ריכוז מסמכים, הוצאות ומע״מ לייצוא חודשי לרואה החשבון",
        accountLabel: "מייל משרד רו״ח",
        accountPlaceholder: "cpa@office.co.il",
      },
    ],
  },
  {
    id: "payments",
    title: "סליקה, תשלומים ובנקים",
    shortTitle: "תשלומים ובנק",
    description: "חיבור מסופי אשראי, תשלומים מקוונים וחשבונות בנק לתמונת תזרים מלאה.",
    requiredFor: "תזרים מזומנים, התאמות סליקה וחשבונות",
    providers: [
      {
        id: "cardcom",
        name: "CardCom",
        description: "סליקת אשראי, הוראות קבע ודפי תשלום",
        accountLabel: "מספר מסוף (Terminal)",
        accountPlaceholder: "1000",
        supportsLiveKey: true,
      },
      {
        id: "tranzila",
        name: "Tranzila",
        description: "מסוף סליקה, ביט, Apple Pay והתאמות",
        accountLabel: "שם מסוף ב-Tranzila",
        accountPlaceholder: "myterminal",
        supportsLiveKey: true,
      },
      {
        id: "payplus",
        name: "PayPlus",
        description: "סליקה רב-ערוצית וחשבוניות אוטומטיות",
        accountLabel: "מזהה מסוף / UID",
        accountPlaceholder: "terminal-uid",
        supportsLiveKey: true,
      },
      {
        id: "grow",
        name: "Grow (Meshulam)",
        description: "תשלומי אשראי, ביט והעברות בנקאיות",
        accountLabel: "מזהה עמוד תשלום / עסק",
        accountPlaceholder: "page-code",
        supportsLiveKey: true,
      },
      {
        id: "bank_sync",
        name: "חשבון בנק / מעקב תזרים ידני",
        description: "הגדרת חשבונות הבנק והקופה לניהול יתרות ותנועות",
        accountLabel: "שם הבנק ו-4 ספרות אחרונות",
        accountPlaceholder: "בנק לאומי · 4821",
      },
    ],
  },
  {
    id: "marketing_crm",
    title: "קמפיינים, שיווק ו-CRM",
    shortTitle: "קמפיינים ו-CRM",
    description: "מעקב קמפיינים ממומנים, לידים, מועדון לקוחות והודעות WhatsApp / דיוור.",
    requiredFor: "קמפיינים, ROAS, לידים ושימור לקוחות",
    providers: [
      {
        id: "meta_ads",
        name: "Meta Ads (Facebook & Instagram)",
        description: "סנכרון קמפיינים, הוצאות פרסום ולידים",
        accountLabel: "Ad Account ID",
        accountPlaceholder: "act_1234567890",
        supportsLiveKey: true,
      },
      {
        id: "google_ads",
        name: "Google Ads",
        description: "מעקב קמפייני חיפוש, שופינג והמרות",
        accountLabel: "Customer ID",
        accountPlaceholder: "123-456-7890",
        supportsLiveKey: true,
      },
      {
        id: "whatsapp_business",
        name: "WhatsApp Business API",
        description: "שליחת הודעות ללקוחות, מבצעים ולידים",
        accountLabel: "מספר טלפון עסקי / Phone ID",
        accountPlaceholder: "+972-50-0000000",
        supportsLiveKey: true,
      },
      {
        id: "activetrail",
        name: "ActiveTrail / Mailchimp",
        description: "דיוור אלקטרוני, SMS ואוטומציות מועדון לקוחות",
        accountLabel: "שם חשבון / רשימה ראשית",
        accountPlaceholder: "VIP Club",
        supportsLiveKey: true,
      },
      {
        id: "internal_crm",
        name: "CRM וקמפיינים מובנה (ללא API חיצוני)",
        description: "ניהול מלא של קמפיינים, תקציבים ולקוחות ישירות בתוך Business OS",
        accountLabel: "שם מועדון / ערוץ ראשי",
        accountPlaceholder: "מועדון הלקוחות שלנו",
      },
    ],
  },
] as const;

export const INTEGRATION_CATEGORY_IDS: readonly IntegrationCategory[] = INTEGRATION_CATEGORIES.map((c) => c.id);

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  disconnected: "לא מחובר",
  sandbox: "מוגדר (Sandbox / ידני)",
  connected: "מחובר ופעיל",
  error: "דורש טיפול",
};

export function getCategoryMeta(category: IntegrationCategory): IntegrationCategoryMeta {
  return INTEGRATION_CATEGORIES.find((item) => item.id === category) ?? INTEGRATION_CATEGORIES[0];
}

export function getProviderMeta(category: IntegrationCategory, providerId: string): IntegrationProvider | undefined {
  return getCategoryMeta(category).providers.find((provider) => provider.id === providerId);
}

/** Never store raw API keys in plaintext hints — keep only the last 4 characters. */
export function maskCredential(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  const tail = trimmed.slice(-4);
  return `•••• ${tail}`;
}

export function isIntegrationReady(status: IntegrationStatus | undefined | null): boolean {
  return status === "connected" || status === "sandbox";
}
