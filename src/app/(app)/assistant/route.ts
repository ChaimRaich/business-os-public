import type { NextRequest } from "next/server";
import { getBusinessContext } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { channelById, isChannelId } from "@/lib/assistant-channels";
import { askAssistant, AssistantError, type AssistantFailure, type ChatMessage } from "@/lib/assistant";

const MAX_TURNS = 16;
const MAX_CHARS = 2000;

const FAILURE_MESSAGES: Record<AssistantFailure, string> = {
  not_configured: "העוזר עוד לא מחובר למודל. צריך להגדיר מפתח במשתני הסביבה של המערכת.",
  auth: "המפתח של המודל נדחה. בדקו את ההגדרות.",
  rate_limited: "יש כרגע עומס על המודל. נסו שוב בעוד רגע.",
  unavailable: "לא הצלחתי להגיע למודל. נסו שוב בעוד רגע.",
  empty: "לא התקבלה תשובה. נסו לנסח את השאלה אחרת.",
};

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

function parseMessages(input: unknown): ChatMessage[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
  const messages: ChatMessage[] = [];
  for (const item of input.slice(-MAX_TURNS)) {
    if (typeof item !== "object" || item === null) return null;
    const { role, content } = item as Record<string, unknown>;
    if ((role !== "user" && role !== "assistant") || typeof content !== "string" || !content.trim()) return null;
    messages.push({ role, content: content.slice(0, MAX_CHARS) });
  }
  // The model must be answering a question, and the history must open with one.
  while (messages.length && messages[0].role !== "user") messages.shift();
  if (!messages.length || messages[messages.length - 1].role !== "user") return null;
  return messages;
}

/** One turn of one of the business chats. The business comes from the session, never from the request. */
export async function POST(request: NextRequest) {
  const context = await getBusinessContext();
  if (!context) {
    return json({ error: "צריך לפתוח עסק לפני שמשתמשים בעוזר." }, 403);
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "הבקשה לא תקינה." }, 400);
  }
  const { messages: rawMessages, channel = "main" } = (payload ?? {}) as { messages?: unknown; channel?: unknown };
  const messages = parseMessages(rawMessages);
  if (!messages || !isChannelId(channel)) {
    return json({ error: "הבקשה לא תקינה." }, 400);
  }
  if (channelById(channel).managersOnly && !can(context.active.role, "accounting.view")) {
    return json({ error: "הצ׳אט הזה פתוח לבעלים ולמנהלים בלבד." }, 403);
  }

  try {
    return json({ reply: await askAssistant(context, channel, messages) });
  } catch (error) {
    if (error instanceof AssistantError) {
      console.error(`Assistant failed (${error.reason}): ${error.message}`);
      return json({ error: FAILURE_MESSAGES[error.reason] }, error.reason === "rate_limited" ? 429 : 502);
    }
    throw error;
  }
}
