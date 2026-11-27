"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  checkConnection,
  normalizeStoreUrl,
  readOrderLines,
  WOO_ERROR_MESSAGES,
  WooError,
  type WooCredentials,
} from "@/lib/woocommerce";
import type { FormState } from "@/components/action-form";

const GENERIC_ERROR = "הפעולה נכשלה. נסו שוב בעוד רגע.";
const FORBIDDEN = "רק בעלים או מנהל יכולים לנהל את החיבור לאתר.";

/** Each sync re-reads a little before the last one ended, so nothing falls between two runs. */
const OVERLAP_MS = 5 * 60_000;

function revalidate() {
  revalidatePath("/settings/connections");
  revalidatePath("/sales");
  revalidatePath("/products");
}

/** Saves the store address and key, after proving that they work. */
export async function connectWebStore(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const storeUrl = normalizeStoreUrl(String(formData.get("store_url") ?? ""));
  const key = String(formData.get("consumer_key") ?? "").trim();
  const secret = String(formData.get("consumer_secret") ?? "").trim();
  const warehouseId = String(formData.get("warehouse_id") ?? "");
  const syncFrom = String(formData.get("sync_from") ?? "");
  if (!storeUrl) {
    return { error: "כתובת האתר אינה תקינה. הזינו כתובת מלאה שמתחילה ב-https, למשל https://example.co.il" };
  }
  if (!/^ck_[0-9a-f]{20,}$/i.test(key) || !/^cs_[0-9a-f]{20,}$/i.test(secret)) {
    return { error: "המפתח צריך להתחיל ב-ck_ והסוד ב-cs_, כפי שהם מוצגים ב-WooCommerce." };
  }
  if (!z.uuid().safeParse(warehouseId).success || !z.iso.date().safeParse(syncFrom).success) {
    return { error: "בחרו מחסן ותאריך התחלה." };
  }

  try {
    await checkConnection({ storeUrl, key, secret });
  } catch (error) {
    return { error: error instanceof WooError ? WOO_ERROR_MESSAGES[error.kind] : GENERIC_ERROR };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_web_connection", {
    p_business_id: active.businessId,
    p_store_url: storeUrl,
    p_consumer_key: key,
    p_consumer_secret: secret,
    p_warehouse_id: warehouseId,
    // The start of that day in Israel.
    p_sync_from: new Date(`${syncFrom}T00:00:00+02:00`).toISOString(),
  });
  if (error) {
    return { error: error.code === "42501" ? FORBIDDEN : GENERIC_ERROR };
  }
  revalidate();
  return { ok: "האתר חובר. לחצו ״סנכרון עכשיו״ כדי לקרוא את ההזמנות." };
}

/** Reads the orders that changed since the last sync and brings stock in line with them. */
export async function syncWebStore(): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_web_credentials", { p_business_id: active.businessId });
  if (error) {
    return { error: error.code === "42501" ? FORBIDDEN : GENERIC_ERROR };
  }
  const connection = data[0];
  if (!connection) {
    return { error: "האתר לא מחובר." };
  }
  const credentials: WooCredentials = {
    storeUrl: connection.store_url,
    key: connection.consumer_key,
    secret: connection.consumer_secret,
  };
  const syncFrom = new Date(connection.sync_from);
  const startedAt = new Date();
  const since = connection.synced_until
    ? new Date(Math.max(new Date(connection.synced_until).getTime() - OVERLAP_MS, syncFrom.getTime()))
    : syncFrom;

  let result: Awaited<ReturnType<typeof readOrderLines>>;
  try {
    result = await readOrderLines(credentials, since, syncFrom);
  } catch (caught) {
    const message = caught instanceof WooError ? WOO_ERROR_MESSAGES[caught.kind] : GENERIC_ERROR;
    await supabase.rpc("record_web_sync_error", { p_business_id: active.businessId, p_error: message });
    revalidate();
    return { error: message };
  }

  const { data: changed, error: recordError } = await supabase.rpc("record_web_sync", {
    p_business_id: active.businessId,
    p_lines: result.lines,
    p_synced_until: startedAt.toISOString(),
    p_orders: result.orders,
  });
  if (recordError) {
    const message = "ההזמנות נקראו מהאתר, אבל שמירתן נכשלה. המלאי לא השתנה.";
    await supabase.rpc("record_web_sync_error", { p_business_id: active.businessId, p_error: message });
    revalidate();
    return { error: message };
  }
  revalidate();
  return {
    ok:
      result.orders === 0
        ? "אין הזמנות חדשות או שינויים מאז הסנכרון הקודם."
        : `נקראו ${result.orders} הזמנות. ${changed === 0 ? "המלאי כבר היה מעודכן." : `${changed} שורות עדכנו את המלאי.`}`,
  };
}

export async function disconnectWebStore(): Promise<FormState> {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_web_connection", { p_business_id: active.businessId });
  if (error) {
    return { error: error.code === "42501" ? FORBIDDEN : GENERIC_ERROR };
  }
  revalidate();
  return null;
}
