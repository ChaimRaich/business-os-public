import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ExtractionError, resolveProvider } from "@/lib/extraction/extract";
import { CHANNEL_LABELS, type Channel } from "@/lib/campaigns";

export { isExtractionConfigured as isAiConfigured } from "@/lib/extraction/extract";

const SYSTEM_PROMPT = `אתה כותב פוסטים לרשתות חברתיות עבור עסק קטן בישראל.
כתוב בעברית טבעית וחמה, בגוף ראשון רבים של העסק, בלי סופרלטיבים ריקים.
השתמש רק בעובדות שנמסרו לך. אל תמציא מחיר, הנחה, חומר, מידה, מלאי, תאריך, משלוח או הבטחה שלא נמסרו. פרט שחסר: כתוב בלעדיו.
החזר את טקסט הפוסט בלבד: בלי הקדמה, בלי הסבר ובלי מרכאות מסביב.`;

const CHANNEL_GUIDANCE: Record<Channel, string> = {
  instagram: "כיתוב לאינסטגרם: שורת פתיחה שתופסת, 2 עד 4 שורות קצרות, ובסוף עד 5 האשטגים רלוונטיים.",
  facebook: "פוסט לפייסבוק: 3 עד 5 משפטים, וקריאה לפעולה אחת בסוף. בלי האשטגים.",
  tiktok: "כיתוב לסרטון טיקטוק: שורה או שתיים קצרות מאוד, ועד 4 האשטגים.",
  whatsapp: "הודעת וואטסאפ ללקוחות: אישית וקצרה, עד 4 שורות, בלי האשטגים.",
  google: "עדכון לפרופיל העסק בגוגל: ענייני ומדויק, 2 עד 4 משפטים, בלי האשטגים ובלי אימוג׳י.",
  other: "פוסט קצר וכללי, 3 עד 4 משפטים.",
};

export type PostFacts = {
  businessName: string;
  channel: Channel;
  campaignName: string;
  campaignGoal: string | null;
  campaignDates: string;
  productName: string | null;
  /** Selling price in shekels, only when every variant of the product has the same one. */
  productPrice: number | null;
  brief: string | null;
};

/** A draft for the user to edit. Nothing is published by this. */
export async function suggestPostText(facts: PostFacts): Promise<string> {
  const provider = resolveProvider();
  const prompt = [
    `הערוץ: ${CHANNEL_LABELS[facts.channel]}. ${CHANNEL_GUIDANCE[facts.channel]}`,
    "",
    "העובדות:",
    `שם העסק: ${facts.businessName}`,
    `הקמפיין: ${facts.campaignName} (${facts.campaignDates})`,
    facts.campaignGoal && `מטרת הקמפיין: ${facts.campaignGoal}`,
    facts.productName && `המוצר: ${facts.productName}`,
    facts.productPrice !== null && `מחיר המוצר: ${facts.productPrice} ₪`,
    facts.brief && `מה בעל העסק רוצה לומר בפוסט: ${facts.brief}`,
  ].filter((line) => line !== null && line !== false).join("\n");

  if (provider.kind === "claude") {
    let message;
    try {
      message = await provider.client.messages
        .stream({
          model: provider.model,
          max_tokens: 2000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: prompt }],
        })
        .finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new ExtractionError("auth", error.message);
      }
      if (error instanceof Anthropic.RateLimitError) {
        throw new ExtractionError("rate_limited", error.message);
      }
      if (error instanceof Anthropic.APIError) {
        throw new ExtractionError("unavailable", `${error.status ?? ""} ${error.message}`.trim());
      }
      throw error;
    }
    if (message.stop_reason === "refusal") {
      throw new ExtractionError("refused", "The model declined to write this post.");
    }
    return finish(message.content.map((block) => (block.type === "text" ? block.text : "")).join(""));
  }

  let response: Response;
  try {
    response = await fetch(provider.url, {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": provider.apiKey },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 4000,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
      }),
    });
  } catch (error) {
    throw new ExtractionError("unavailable", error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    const detail = `${response.status} ${(await response.text()).slice(0, 500)}`;
    if (response.status === 401 || response.status === 403) throw new ExtractionError("auth", detail);
    if (response.status === 429) throw new ExtractionError("rate_limited", detail);
    throw new ExtractionError("unavailable", detail);
  }
  const body = (await response.json()) as {
    choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[];
  };
  const choice = body.choices?.[0];
  if (choice?.finish_reason === "content_filter" || choice?.message?.refusal) {
    throw new ExtractionError("refused", "The model declined to write this post.");
  }
  return finish(choice?.message?.content ?? "");
}

function finish(text: string): string {
  const cleaned = text.trim().replace(/^["״«]+|["״»]+$/g, "").trim();
  if (!cleaned) {
    throw new ExtractionError("invalid_output", "The model returned no text.");
  }
  return cleaned.slice(0, 5000);
}
