import type { Database } from "@/lib/database.types";

export type LedgerEntryKind = Database["public"]["Enums"]["ledger_entry_kind"];
export type LedgerEntryStatus = Database["public"]["Enums"]["ledger_entry_status"];
export type CampaignChannel = Database["public"]["Enums"]["campaign_channel"];
export type CampaignStatus = Database["public"]["Enums"]["campaign_status"];
export type CustomerStage = Database["public"]["Enums"]["customer_stage"];

export const ACCOUNT_TYPES = ["bank", "clearing", "cash", "accounting"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: "חשבון בנק",
  clearing: "מסוף סליקה",
  cash: "קופה מזומן",
  accounting: "כרטיס הנה״ח",
};

export const LEDGER_KINDS: readonly LedgerEntryKind[] = ["income", "expense", "invoice", "tax_payment"];
export const LEDGER_KIND_LABELS: Record<LedgerEntryKind, string> = {
  income: "הכנסה",
  expense: "הוצאה",
  invoice: "חשבונית לקוח",
  tax_payment: "תשלום מע״מ / מס",
};

export const LEDGER_STATUSES: readonly LedgerEntryStatus[] = ["draft", "pending", "paid", "overdue"];
export const LEDGER_STATUS_LABELS: Record<LedgerEntryStatus, string> = {
  draft: "טיוטה",
  pending: "ממתין לתשלום",
  paid: "שולם",
  overdue: "באיחור",
};

export const CAMPAIGN_CHANNELS: readonly CampaignChannel[] = ["meta_ads", "google_ads", "whatsapp", "email", "sms"];
export const CAMPAIGN_CHANNEL_LABELS: Record<CampaignChannel, string> = {
  meta_ads: "Meta Ads",
  google_ads: "Google Ads",
  whatsapp: "WhatsApp",
  email: "דיוור (Email)",
  sms: "SMS",
};

export const CAMPAIGN_STATUSES: readonly CampaignStatus[] = ["draft", "active", "paused", "completed"];
export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "טיוטה",
  active: "פעיל",
  paused: "מושהה",
  completed: "הסתיים",
};

export const CUSTOMER_STAGES: readonly CustomerStage[] = ["lead", "prospect", "active", "vip", "inactive"];
export const CUSTOMER_STAGE_LABELS: Record<CustomerStage, string> = {
  lead: "ליד חדש",
  prospect: "בהתעניינות",
  active: "לקוח פעיל",
  vip: "מועדון VIP",
  inactive: "לא פעיל",
};

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(amount);
}

const dateTimeFormat = new Intl.DateTimeFormat("he-IL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "Asia/Jerusalem",
});
export const formatDateTime = (value: string) => dateTimeFormat.format(new Date(value));
