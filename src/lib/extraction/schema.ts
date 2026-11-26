import { z } from "zod";

// What the model returns for one receiving document. Everything is nullable:
// a value that is not printed on the document must come back as null, never guessed.

export const LINE_FIELDS = [
  "supplier_sku",
  "barcode",
  "description",
  "variant",
  "quantity",
  "unit_cost",
  "retail_price",
  "discount_pct",
  "line_total",
] as const;

export const ExtractedLine = z.object({
  supplier_sku: z.string().nullable().describe("Supplier item / model code exactly as printed, without any row counter."),
  barcode: z.string().nullable().describe("Barcode digits exactly as printed (kept as text, leading zeros included)."),
  description: z.string().nullable().describe("Product description as printed, multi-line text joined with a space. Do not fix the supplier's spelling."),
  variant: z.string().nullable().describe("Variation attribute if the row states one, e.g. 'מידה: 7' or 'צבע אבנים: כחול'."),
  quantity: z.number().nullable(),
  unit: z.string().nullable().describe("Unit of measure if printed."),
  unit_cost: z.number().nullable().describe("What the business pays per unit, BEFORE VAT, after any line discount."),
  retail_price: z.number().nullable().describe("Supplier's suggested consumer price per unit, only if the document prints one."),
  discount_pct: z.number().nullable(),
  line_total: z.number().nullable().describe("The row total exactly as printed in the document's row-total column."),
  uncertain_fields: z.array(z.enum(LINE_FIELDS)).describe("Fields of this row you could not read with confidence."),
  note: z.string().nullable().describe("Short Hebrew note for the reviewer when something about this row needs a human check."),
});

export const ExtractedDocument = z.object({
  readable: z.boolean().describe("False when the document cannot be read well enough to extract rows."),
  doc_type: z.enum(["delivery_note", "tax_invoice", "tax_invoice_receipt", "other"]).nullable(),
  doc_number: z.string().nullable(),
  doc_date: z.string().nullable().describe("ISO date YYYY-MM-DD."),
  supplier_name: z.string().nullable(),
  supplier_tax_id: z.string().nullable().describe("Supplier company / VAT registration number, digits only."),
  vat_rate: z.number().nullable().describe("VAT percentage printed on the document, e.g. 18."),
  printed_subtotal: z.number().nullable().describe("Total before VAT as printed."),
  printed_vat: z.number().nullable(),
  printed_total: z.number().nullable().describe("Final total including VAT as printed."),
  printed_quantity: z.number().nullable().describe("Total item count if the document prints one."),
  notes: z.string().nullable().describe("Short Hebrew note for the reviewer: which column was used as the cost and why, anything unusual."),
  lines: z.array(ExtractedLine),
});

export type ExtractedLine = z.infer<typeof ExtractedLine>;
export type ExtractedDocument = z.infer<typeof ExtractedDocument>;
