"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  catalogErrorMessage,
  isCodeKind,
  optional,
  takenCodeMessage,
  text,
  type CodeKind,
} from "@/lib/catalog";
import type { FormState } from "@/components/action-form";

type VariantInput = {
  label: string;
  codes: { kind: CodeKind; code: string }[];
};

// The form posts its variant rows as one JSON field; everything in it is untrusted.
function parseVariants(raw: string): VariantInput[] | null {
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(rows) || rows.length > 100) {
    return null;
  }
  const variants: VariantInput[] = [];
  for (const row of rows) {
    if (typeof row !== "object" || row === null) {
      return null;
    }
    const record = row as Record<string, unknown>;
    const label = typeof record.label === "string" ? record.label.trim() : "";
    const codes: VariantInput["codes"] = [];
    for (const kind of ["barcode", "supplier_sku", "pos", "web"] as const) {
      const value = typeof record[kind] === "string" ? (record[kind] as string).trim() : "";
      if (value) {
        codes.push({ kind, code: value });
      }
    }
    variants.push({ label, codes });
  }
  return variants;
}

type Code = { kind: CodeKind; code: string };

// The database rejects a duplicate without saying which code it was, so look it up
// to tell the user exactly what to fix. Matching ignores case, like the unique index.
async function findTakenCodes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  businessId: string,
  codes: Code[],
): Promise<Code[]> {
  const unique = codes.filter((c) => c.kind !== "supplier_sku");
  if (unique.length === 0) {
    return [];
  }
  const { data } = await supabase
    .from("variant_codes")
    .select("kind, code_norm")
    .eq("business_id", businessId)
    .neq("kind", "supplier_sku")
    .in("code_norm", unique.map((c) => c.code.toUpperCase()));
  const taken = new Set((data ?? []).map((row) => `${row.kind}:${row.code_norm}`));
  return unique.filter((c) => taken.has(`${c.kind}:${c.code.toUpperCase()}`));
}

function repeatedCodes(codes: Code[]): Code[] {
  const seen = new Set<string>();
  return codes.filter((c) => {
    if (c.kind === "supplier_sku") {
      return false;
    }
    const key = `${c.kind}:${c.code.toUpperCase()}`;
    const repeated = seen.has(key);
    seen.add(key);
    return repeated;
  });
}

export async function createProduct(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const name = text(formData, "name");
  const supplierId = optional(formData, "supplier_id");
  if (!name) {
    return { error: "יש להזין שם מוצר." };
  }

  const parsed = parseVariants(text(formData, "variants"));
  if (!parsed) {
    return { error: "הטופס לא נשלח כראוי. רעננו את העמוד ונסו שוב." };
  }
  // Rows the user left completely blank are dropped rather than rejected.
  const variants = parsed.filter((v, i) => i === 0 || v.label || v.codes.length > 0);
  if (variants.length > 1 && variants.some((v) => !v.label)) {
    return { error: "כשיש יותר מווריאציה אחת, לכל אחת צריך שם (למשל: מידה 7)." };
  }
  if (!supplierId && variants.some((v) => v.codes.some((c) => c.kind === "supplier_sku"))) {
    return { error: "כדי לשמור מק״ט ספק צריך לבחור ספק." };
  }

  const allCodes = variants.flatMap((v) => v.codes);
  const repeated = repeatedCodes(allCodes);
  if (repeated.length > 0) {
    const list = repeated.map((c) => c.code).join(", ");
    return { error: `אותו קוד הוזן ביותר מווריאציה אחת: ${list}. לכל וריאציה צריך ברקוד ומק״ט קופה משלה.` };
  }

  const supabase = await createClient();
  const { data: productId, error } = await supabase.rpc("create_product", {
    p_business_id: active.businessId,
    p_name: name,
    p_supplier_id: supplierId ?? undefined,
    p_notes: optional(formData, "notes") ?? undefined,
    p_variants: variants,
  });
  if (error || !productId) {
    const taken = error?.code === "23505" ? await findTakenCodes(supabase, active.businessId, allCodes) : [];
    if (taken.length > 0) {
      return { error: takenCodeMessage(taken) };
    }
    return { error: error ? catalogErrorMessage(error) : "הפעולה נכשלה." };
  }
  revalidatePath("/products");
  redirect(`/products/${productId}`);
}

export async function updateProduct(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!id || !name) {
    return { error: "יש להזין שם מוצר." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({
      name,
      supplier_id: optional(formData, "supplier_id"),
      notes: optional(formData, "notes"),
    })
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "המוצר לא נמצא." };
  }
  revalidatePath("/products");
  revalidatePath(`/products/${id}`);
  return { ok: "המוצר נשמר." };
}

export async function deleteProduct(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const id = text(formData, "id");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .delete()
    .eq("id", id)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים למחוק מוצר." };
  }
  revalidatePath("/products");
  redirect("/products");
}

export async function addVariant(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const productId = text(formData, "product_id");
  const label = text(formData, "label");
  if (!productId || !label) {
    return { error: "יש להזין שם לווריאציה (למשל: מידה 7)." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_variants")
    .insert({ business_id: active.businessId, product_id: productId, label });
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath(`/products/${productId}`);
  return { ok: `הווריאציה ${label} נוספה.` };
}

export async function renameVariant(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const productId = text(formData, "product_id");
  const variantId = text(formData, "variant_id");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .update({ label: text(formData, "label") })
    .eq("id", variantId)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "הווריאציה לא נמצאה." };
  }
  revalidatePath(`/products/${productId}`);
  return { ok: "נשמר." };
}

export async function deleteVariant(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const productId = text(formData, "product_id");
  const variantId = text(formData, "variant_id");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_variants")
    .delete()
    .eq("id", variantId)
    .eq("business_id", active.businessId)
    .select("id");
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  if (data.length === 0) {
    return { error: "רק בעלים או מנהל יכולים למחוק וריאציה." };
  }
  revalidatePath(`/products/${productId}`);
  return { ok: "הווריאציה נמחקה." };
}

export async function addCode(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const productId = text(formData, "product_id");
  const variantId = text(formData, "variant_id");
  const kind = formData.get("kind");
  const code = text(formData, "code");
  const supplierId = optional(formData, "supplier_id");
  if (!variantId || !isCodeKind(kind) || !code) {
    return { error: "יש לבחור סוג ולהזין קוד." };
  }
  if (kind === "supplier_sku" && !supplierId) {
    return { error: "למק״ט ספק חובה לבחור ספק." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("variant_codes").insert({
    business_id: active.businessId,
    variant_id: variantId,
    kind,
    code,
    supplier_id: kind === "supplier_sku" ? supplierId : null,
  });
  if (error) {
    const taken = error.code === "23505" ? await findTakenCodes(supabase, active.businessId, [{ kind, code }]) : [];
    return { error: taken.length > 0 ? takenCodeMessage(taken) : catalogErrorMessage(error) };
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: "הקוד נוסף." };
}

export async function deleteCode(_: FormState, formData: FormData): Promise<FormState> {
  const { active } = await requireBusiness();
  const productId = text(formData, "product_id");

  const supabase = await createClient();
  const { error } = await supabase
    .from("variant_codes")
    .delete()
    .eq("id", text(formData, "code_id"))
    .eq("business_id", active.businessId);
  if (error) {
    return { error: catalogErrorMessage(error) };
  }
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return null;
}
