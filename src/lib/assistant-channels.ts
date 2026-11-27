/** The chats of the business assistant: one for the whole business, and one per area. */
export const CHANNEL_IDS = ["main", "inventory", "receiving", "sales", "marketing", "customers", "money"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export type Channel = {
  id: ChannelId;
  name: string;
  /** One line under the name: what this chat knows. */
  about: string;
  /** The second line of the opening bubble. */
  greeting: string;
  suggestions: string[];
  /** Money figures are for the owner and managers, like the accounting screens. */
  managersOnly?: boolean;
};

export const CHANNELS: Channel[] = [
  {
    id: "main",
    name: "ראשי",
    about: "כל העסק במקום אחד",
    greeting: "אפשר לשאול אותי על כל העסק: מלאי, קליטות, מכירות, קמפיינים, לקוחות וכספים.",
    suggestions: ["מה הכי דחוף לי היום?", "מה יש לי במלאי כרגע?", "אילו פוסטים צריך לפרסם השבוע?", "מה פתוח לתשלום לספקים?"],
  },
  {
    id: "inventory",
    name: "מלאי",
    about: "מוצרים, כמויות וחוסרים",
    greeting: "כאן מדברים על המלאי: מוצרים, כמויות לפי מחסן, ומה אזל או עומד להיגמר.",
    suggestions: ["מה אזל או מתחת לסף?", "אילו מוצרים במינוס?", "מה יש במלאי ולא נמכר החודש?", "כמה מוצרים יש בקטלוג?"],
  },
  {
    id: "receiving",
    name: "קליטה וספקים",
    about: "תעודות, חשבוניות וספקים",
    greeting: "כאן מדברים על קליטת סחורה ועל הספקים: מה נקלט, מה מחכה לבדיקה, וממי.",
    suggestions: ["אילו קליטות מחכות לבדיקה?", "מה נקלט לאחרונה?", "מאילו ספקים קיבלתי סחורה החודש?", "יש קליטות שנכשלו?"],
  },
  {
    id: "sales",
    name: "מכירות",
    about: "מה נמכר ב-30 הימים האחרונים",
    greeting: "כאן מדברים על המכירות: מה נמכר, מה חזר, ואילו שורות מהקופה עוד לא זוהו.",
    suggestions: ["מה נמכר הכי הרבה החודש?", "כמה יחידות נמכרו ב-30 הימים האחרונים?", "יש שורות מכירה שלא זוהו?", "מתי יובאו מכירות בפעם האחרונה?"],
  },
  {
    id: "marketing",
    name: "קמפיינים",
    about: "קמפיינים, פוסטים ופרסום ממומן",
    greeting: "כאן מדברים על השיווק: קמפיינים, פוסטים שמחכים לפרסום, ופרסום ממומן.",
    suggestions: ["אילו פוסטים צריך לפרסם השבוע?", "אילו קמפיינים פעילים עכשיו?", "כמה הוצאתי על פרסום ממומן?", "איזה קמפיין הביא הכי הרבה לידים?"],
  },
  {
    id: "customers",
    name: "לקוחות",
    about: "לקוחות, לידים ומועדון",
    greeting: "כאן מדברים על הלקוחות: לידים חדשים, לקוחות פעילים ומועדון ה-VIP.",
    suggestions: ["כמה לידים חדשים יש לי?", "מי הלקוחות הכי שווים?", "מי במועדון ה-VIP?", "מאיפה מגיעים הלקוחות?"],
  },
  {
    id: "money",
    name: "כספים",
    about: "תשלומים, מע״מ ויומן כספים",
    greeting: "כאן מדברים על הכסף: מה פתוח לתשלום, מע״מ התקופה, חשבונות ויומן הכספים.",
    suggestions: ["מה פתוח לתשלום לספקים?", "מה באיחור?", "כמה מע״מ תשומות יש בתקופה?", "מה היתרות בחשבונות?"],
    managersOnly: true,
  },
];

export function isChannelId(value: unknown): value is ChannelId {
  return (CHANNEL_IDS as readonly unknown[]).includes(value);
}

export const channelById = (id: ChannelId) => CHANNELS.find((channel) => channel.id === id)!;

export const channelsFor = (canManage: boolean) => CHANNELS.filter((channel) => canManage || !channel.managersOnly);
