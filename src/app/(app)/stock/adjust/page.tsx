import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ArrowRight, Info, ShieldAlert, SlidersHorizontal } from "lucide-react";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatQuantity, itemTitle } from "@/lib/stock";
import { ActionForm } from "@/components/action-form";
import { adjustStock } from "../actions";

export const metadata: Metadata = { title: "התאמת מלאי" };

const param = (value: string | string[] | undefined) =>
  z.uuid().safeParse(value).success ? (value as string) : null;

export default async function AdjustStockPage({ searchParams }: PageProps<"/stock/adjust">) {
  const query = await searchParams;
  const variantId = param(query.variant);
  const documentId = param(query.document);
  const { active } = await requireBusiness();
  if (!variantId) {
    notFound();
  }

  const supabase = await createClient();
  const [{ data: variant }, { data: warehouses }, { data: balances }] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, label, products (id, name)")
      .eq("id", variantId)
      .eq("business_id", active.businessId)
      .maybeSingle(),
    supabase.from("warehouses").select("id, name, is_default").eq("business_id", active.businessId).order("created_at"),
    supabase.from("stock_balances").select("warehouse_id, quantity").eq("variant_id", variantId).eq("business_id", active.businessId),
  ]);
  if (!variant) {
    notFound();
  }
  const balanceOf = (warehouseId: string) =>
    balances?.find((balance) => balance.warehouse_id === warehouseId)?.quantity ?? 0;
  const selected =
    param(query.warehouse) ?? warehouses?.find((warehouse) => warehouse.is_default)?.id ?? warehouses?.[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href={`/products/${variant.products.id}`} className="back-link">
          <ArrowRight className="size-4" aria-hidden />
          <span>לדף המוצר</span>
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight">התאמת מלאי</h1>
        <p className="mt-1 text-base font-medium text-muted">{itemTitle(variant.products.name, variant.label)}</p>
      </div>

      {documentId && (
        <div className="flex items-start gap-3 rounded-2xl border border-accent/25 bg-accent-soft px-4 py-3.5 text-sm text-accent-strong">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            תיקון של{" "}
            <Link href={`/receiving/${documentId}`} className="font-semibold underline underline-offset-4">
              הקליטה הזו
            </Link>
            . הקליטה עצמה לא משתנה; נרשמת תנועת תיקון.
          </p>
        </div>
      )}

      <section className="card">
        <h2 className="section-heading mb-4">
          <SlidersHorizontal className="size-4.5 text-accent" aria-hidden />
          <span>פרטי התנועה</span>
        </h2>
        {!can(active.role, "stock.adjust") ? (
          <div className="flex items-center gap-3 rounded-xl bg-surface-subtle/70 px-4 py-3 text-sm text-muted">
            <ShieldAlert className="size-4 shrink-0" aria-hidden />
            <span>רק בעלים או מנהל יכולים להתאים מלאי.</span>
          </div>
        ) : (
          <ActionForm action={adjustStock} submitLabel="רישום ההתאמה" pendingLabel="רושם…" submitClassName="btn sm:col-span-2 sm:justify-self-start" className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="variant_id" value={variant.id} />
            <input type="hidden" name="document_id" value={documentId ?? ""} />
            {/* New on every render, so one filled form is applied at most once. */}
            <input type="hidden" name="request_id" value={randomUUID()} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="warehouse_id">מחסן (יתרה נוכחית)</label>
              <select className="field min-h-11" id="warehouse_id" name="warehouse_id" defaultValue={selected}>
                {(warehouses ?? []).map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name} ({formatQuantity(balanceOf(warehouse.id))})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="direction">פעולה</label>
              <select className="field min-h-11" id="direction" name="direction" defaultValue="remove">
                <option value="remove">הורדה מהמלאי</option>
                <option value="add">הוספה למלאי</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="quantity">כמות</label>
              <input className="field tabular-nums" id="quantity" name="quantity" dir="ltr" inputMode="decimal" required />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="reason">סיבה</label>
              <input className="field" id="reason" name="reason" maxLength={300} required placeholder="למשל: בספירה נמצאו 2 במקום 3" />
            </div>
          </ActionForm>
        )}
      </section>
    </div>
  );
}
