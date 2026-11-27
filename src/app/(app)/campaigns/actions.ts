"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { optional, text } from "@/lib/catalog";
import { parseAmount } from "@/lib/documents";
import { formatDay, isIsoDate } from "@/lib/accounting";
import { isChannel, CHANNELS } from "@/lib/campaigns";
import { suggestPostText } from "@/lib/ai-text";
import { ExtractionError, type ExtractionFailure } from "@/lib/extraction/extract";
import type { FormState } from "@/components/action-form";

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";

function campaignFields(formData: FormData) {
  const name = text(formData, "name");
  const starts_on = text(formData, "starts_on");
  const ends_on = text(formData, "ends_on");
  const budget = parseAmount(text(formData, "budget"));
  const spent = parseAmount(text(formData, "spent"));
  if (!name) return { error: "יש לתת שם לקמפיין." };
  if (!isIsoDate(starts_on) || !isIsoDate(ends_on)) return { error: "יש לבחור תאריך התחלה ותאריך סיום." };
  if (ends_on < starts_on) return { error: "תאריך הסיום לא יכול להיות לפני תאריך ההתחלה." };
  if (budget === undefined || spent === undefined) return { error: "התקציב וההוצאה בפועל צריכים להיות מספרים, או להישאר ריקים." };
  return { fields: { name, goal: optional(formData, "goal"), starts_on, ends_on, budget, spent } };
}

export async function createCampaign(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const parsed = campaignFields(formData);
  if (!parsed.fields) {
    return { error: parsed.error };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .insert({ ...parsed.fields, business_id: active.businessId })
    .select("id")
    .single();
  if (error) {
    return { error: error.code === "23514" || error.code === "22001" ? "אחד השדות ארוך מדי." : GENERIC_ERROR };
  }
  revalidatePath("/campaigns");
  redirect(`/campaigns/${data.id}`);
}

export async function updateCampaign(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");
  const parsed = campaignFields(formData);
  if (!parsed.fields) {
    return { error: parsed.error };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update(parsed.fields)
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error || data.length === 0) {
    return { error: error?.code === "23514" || error?.code === "22001" ? "אחד השדות ארוך מדי." : GENERIC_ERROR };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${id}`);
  return { ok: "הפרטים נשמרו." };
}

export async function deleteCampaign(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: GENERIC_ERROR };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים למחוק קמפיין." };
  }
  revalidatePath("/campaigns");
  redirect("/campaigns");
}

export async function createPost(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const campaignId = text(formData, "campaign_id");
  const channel = text(formData, "channel");
  const body = text(formData, "body");
  const scheduled = text(formData, "scheduled_for");
  if (!isChannel(channel)) {
    return { error: "יש לבחור ערוץ." };
  }
  if (!body) {
    return { error: "יש לכתוב את טקסט הפוסט." };
  }
  if (body.length > 5000) {
    return { error: "הטקסט ארוך מדי (עד 5,000 תווים)." };
  }
  if (scheduled && !isIsoDate(scheduled)) {
    return { error: "תאריך הפרסום אינו תקין." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_posts").insert({
    business_id: active.businessId,
    campaign_id: campaignId,
    channel,
    body,
    product_id: optional(formData, "product_id"),
    scheduled_for: scheduled || null,
  });
  if (error) {
    return { error: GENERIC_ERROR };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${campaignId}`);
  return { ok: "הפוסט נשמר. הוא עוד לא פורסם." };
}

/** The user posted it on the network themselves and records that here, with the link if they have one. */
export async function markPostPublished(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const undo = text(formData, "intent") === "undo";
  const url = text(formData, "published_url");
  if (!undo && url && !/^https?:\/\/\S+$/i.test(url)) {
    return { error: "הקישור צריך להתחיל ב-https://" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_posts")
    .update(undo ? { published_at: null, published_url: null } : { published_at: new Date().toISOString(), published_url: url || null })
    .eq("id", text(formData, "id"))
    .eq("business_id", active.businessId)
    .select("campaign_id");
  if (error || data.length === 0) {
    return { error: GENERIC_ERROR };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${data[0].campaign_id}`);
  return null;
}

export async function deletePost(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaign_posts")
    .delete()
    .eq("id", text(formData, "id"))
    .eq("business_id", active.businessId)
    .select("campaign_id");
  if (error || data.length === 0) {
    return { error: GENERIC_ERROR };
  }
  revalidatePath("/campaigns");
  revalidatePath(`/campaigns/${data[0].campaign_id}`);
  return null;
}

const SuggestInput = z.object({
  campaignId: z.uuid(),
  channel: z.enum(CHANNELS),
  productId: z.uuid().nullable(),
  brief: z.string().trim().max(500),
});

const SUGGEST_ERRORS: Record<ExtractionFailure, string> = {
  not_configured: "לא הוגדר מודל AI במערכת, ולכן אין הצעות טקסט. אפשר לכתוב את הפוסט ידנית.",
  auth: "החיבור למודל ה-AI נדחה. בדקו את המפתח בהגדרות השרת.",
  rate_limited: "המודל עמוס כרגע. נסו שוב בעוד דקה.",
  too_large: GENERIC_ERROR,
  refused: "המודל לא כתב הצעה לבקשה הזו. נסו לנסח אחרת.",
  truncated: GENERIC_ERROR,
  unavailable: "המודל לא זמין כרגע. נסו שוב בעוד רגע, או כתבו את הפוסט ידנית.",
  invalid_output: "המודל לא החזיר טקסט. נסו שוב.",
};

/** A draft from the AI model, built only from what the system knows and what the user typed. */
export async function suggestPost(input: unknown): Promise<{ text: string } | { error: string }> {
  const { active } = await requireBusiness();
  const parsed = SuggestInput.safeParse(input);
  if (!parsed.success) {
    return { error: "יש לבחור ערוץ לפני שמבקשים הצעה." };
  }
  const { campaignId, channel, productId, brief } = parsed.data;
  const supabase = await createClient();
  const [{ data: campaign }, { data: product }] = await Promise.all([
    supabase.from("campaigns").select("name, goal, starts_on, ends_on").eq("id", campaignId).eq("business_id", active.businessId).maybeSingle(),
    productId
      ? supabase.from("products").select("name, product_variants (sale_price)").eq("id", productId).eq("business_id", active.businessId).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!campaign) {
    return { error: "הקמפיין לא נמצא." };
  }
  const prices = new Set(product?.product_variants.map((variant) => variant.sale_price));
  const [price] = prices.size === 1 ? [...prices] : [null];

  try {
    const suggestion = await suggestPostText({
      businessName: active.businessName,
      channel,
      campaignName: campaign.name,
      campaignGoal: campaign.goal,
      campaignDates: `${formatDay(campaign.starts_on)} עד ${formatDay(campaign.ends_on)}`,
      productName: product?.name ?? null,
      productPrice: price ?? null,
      brief: brief || null,
    });
    return { text: suggestion };
  } catch (error) {
    if (error instanceof ExtractionError) {
      console.error(`Post suggestion failed (${error.reason}): ${error.message}`);
      return { error: SUGGEST_ERRORS[error.reason] };
    }
    throw error;
  }
}
