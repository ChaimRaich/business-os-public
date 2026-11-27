"use server";

import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { catalogErrorMessage, optional, text } from "@/lib/catalog";
import { parseAmount } from "@/lib/documents";
import type { FormState } from "@/components/action-form";

function supplierFields(formData: FormData) {
  return {
    name: text(formData, "name"),
    tax_id: optional(formData, "tax_id"),
    phone: optional(formData, "phone"),
    address: optional(formData, "address"),
    pos_code: optional(formData, "pos_code"),
    pos_name: optional(formData, "pos_name"),
    pos_barcode_source: text(formData, "pos_barcode_source") === "supplier" ? "supplier" : "internal",
    pos_next_barcode: optional(formData, "pos_next_barcode"),
    price_mode: text(formData, "price_mode") === "retail" ? "retail" : "multiplier",
    price_multiplier: parseAmount(text(formData, "price_multiplier")),
    notes: optional(formData, "notes"),
  };
}

function rulesError(
  fields: Pick<ReturnType<typeof supplierFields>, "price_multiplier" | "pos_next_barcode">,
): string | null {
  if (fields.price_multiplier === undefined || fields.price_multiplier === 0 || (fields.price_multiplier ?? 0) >= 1000) {
    return "המכפלה צריכה להיות מספר, למשל 2.9.";
  }
  if (fields.pos_next_barcode && !/^\S{0,16}\d{1,12}$/.test(fields.pos_next_barcode)) {
    return "הברקוד הפנימי הבא צריך להסתיים במספר, בלי רווחים. למשל N12000101.";
  }
  return null;
}

export async function createSupplier(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const fields = supplierFields(formData);
  if (!fields.name) {
    return { error: "יש להזין שם ספק." };
  }
  const invalid = rulesError(fields);
  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .insert({ ...fields, business_id: active.businessId });
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
  const invalid = rulesError(fields);
  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(fields)
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

/**
 * The till details of a supplier, filled in from the till-file screen of a document:
 * the file cannot be made without them, so they are asked for where they are missing.
 */
export async function saveSupplierTillDetails(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");
  const fields = {
    pos_code: optional(formData, "pos_code"),
    pos_name: optional(formData, "pos_name"),
    pos_barcode_source: text(formData, "pos_barcode_source") === "supplier" ? "supplier" : "internal",
    pos_next_barcode: optional(formData, "pos_next_barcode"),
    price_mode: text(formData, "price_mode") === "retail" ? "retail" : "multiplier",
    price_multiplier: parseAmount(text(formData, "price_multiplier")),
  };
  if (!fields.pos_code || !fields.pos_name) {
    return { error: "צריך את קוד הספק ואת שם הספק, כמו שהם מוגדרים בקופה." };
  }
  if (fields.pos_barcode_source === "internal" && !fields.pos_next_barcode) {
    return { error: "לברקוד פנימי צריך את הברקוד הבא בתור, למשל N12000101. אם הקופה עובדת עם הקוד של הספק, בחרו באפשרות הזו." };
  }
  const invalid = rulesError(fields);
  if (invalid) {
    return { error: invalid };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("suppliers")
    .update(fields)
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "הספק לא נמצא." };
  }
  revalidatePath("/receiving/[id]/export", "page");
  revalidatePath(`/suppliers/${id}`);
  return { ok: "הפרטים נשמרו." };
}
