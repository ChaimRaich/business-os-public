export const CHANNELS = ["instagram", "facebook", "tiktok", "whatsapp", "google", "other"] as const;
export type Channel = (typeof CHANNELS)[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
  instagram: "אינסטגרם",
  facebook: "פייסבוק",
  tiktok: "טיקטוק",
  whatsapp: "וואטסאפ",
  google: "גוגל (פרופיל העסק)",
  other: "אחר",
};

export function isChannel(value: string): value is Channel {
  return (CHANNELS as readonly string[]).includes(value);
}

/** Follows from the dates; nobody sets it by hand. */
export type CampaignState = "planned" | "active" | "done";

export function campaignState(campaign: { starts_on: string; ends_on: string }, today: string): CampaignState {
  return today < campaign.starts_on ? "planned" : today > campaign.ends_on ? "done" : "active";
}

export const CAMPAIGN_STATE_LABELS: Record<CampaignState, string> = {
  planned: "מתוכנן",
  active: "פעיל עכשיו",
  done: "הסתיים",
};

export const CAMPAIGN_STATE_STYLES: Record<CampaignState, string> = {
  planned: "bg-warn-soft text-warn",
  active: "bg-accent-soft text-accent-strong",
  done: "bg-canvas text-muted",
};

/** ISO date `days` after `iso`. */
export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
