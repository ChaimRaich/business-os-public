"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorMessage, optional, text } from "@/lib/catalog";
import type { FormState } from "@/components/action-form";
import { parseAmount } from "@/lib/documents";

function supplierFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    tax_id: optional(formData, "tax_id"),
    phone: optional(formData, "phone"),
    address: optional(formData, "address"),
    pos_code: optional(formData, "pos_code"),
    pos_name: optional(formData, "pos_name"),
    notes: optional(formData, "notes"),
  };
}

/** The pricing rule and barcode counter, or a message naming what is wrong. */
function pricingFields(formData: FormData) {
  const multiplier = parseAmount(text(formData, "club_multiplier"));
  const markup = parseAmount(text(formData, "sale_markup_pct"));
  const next = Number(text(formData, "next_barcode_number"));
  if (!multiplier || multiplier > 1000) {
    return { error: "המכפיל למחיר מועדון צריך להיות מספר גדול מאפס." };
  }
  if (typeof markup !== "number" || markup > 1000) {
    return { error: "התוספת למחיר מכירה צריכה להיות מספר אחוזים (0 ומעלה)." };
  }
  if (!Number.isInteger(next) || next < 1 || next > 999999) {
    return { error: "המספר הרץ צריך להיות מספר שלם בין 1 ל-999999." };
  }
  return { values: { club_multiplier: multiplier, sale_markup_pct: markup, next_barcode_number: next } };
}

export async function createSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const fields = supplierFields(formData);
  if (!fields.name) {
    return { error: "יש להזין שם ספק." };
  }
  const pricing = pricingFields(formData);
  if (!pricing.values) {
    return { error: pricing.error };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .insert({ ...fields, ...pricing.values, business_id: active.businessId });
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath("/suppliers");
  return { ok: `הספק ${fields.name} נוסף.` };
}

export async function updateSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");
  const fields = supplierFields(formData);
  if (!id || !fields.name) {
    return { error: "יש להזין שם ספק." };
  }
  const pricing = pricingFields(formData);
  if (!pricing.values) {
    return { error: pricing.error };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update({ ...fields, ...pricing.values })
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "הספק לא נמצא." };
  }
  revalidatePath("/suppliers");
  revalidatePath(`/suppliers/${id}`);
  return { ok: "הפרטים נשמרו." };
}
