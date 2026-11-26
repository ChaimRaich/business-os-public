import type { Database } from "./database.types.ts";

export type ProductType = Database["public"]["Enums"]["product_type"];
export type Material = Database["public"]["Enums"]["material"];

export const PRODUCT_TYPES: ProductType[] = ["ring", "earring", "necklace", "bracelet"];
export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  ring: "טבעת",
  earring: "עגיל",
  necklace: "שרשרת",
  bracelet: "צמיד",
};

export const MATERIALS: Material[] = ["silver", "gold"];
export const MATERIAL_LABELS: Record<Material, string> = { silver: "כסף", gold: "זהב" };

export const asProductType = (value: unknown): ProductType | null =>
  PRODUCT_TYPES.includes(value as ProductType) ? (value as ProductType) : null;
export const asMaterial = (value: unknown): Material | null =>
  MATERIALS.includes(value as Material) ? (value as Material) : null;

export type PricingRule = { clubMultiplier: number; saleMarkupPct: number };

// Whole shekels, half up. The epsilon absorbs binary floating point, so the result
// agrees with the database's decimal round() in approve_document().
const roundShekel = (value: number) => Math.round(value + 1e-9);

export function ruleClubPrice(cost: number | null, rule: PricingRule): number | null {
  if (cost === null) {
    return null;
  }
  return roundShekel(cost * rule.clubMultiplier) || null;
}

export function ruleSalePrice(club: number | null, rule: PricingRule): number | null {
  return club === null ? null : roundShekel((club * (100 + rule.saleMarkupPct)) / 100);
}

/**
 * The prices that apply to one item: what was typed, else what the product
 * already sells for, else the supplier's pricing rule.
 */
export function effectivePrices(
  typed: { sale: number | null; club: number | null },
  product: { sale: number | null; club: number | null } | null,
  cost: number | null,
  rule: PricingRule | null,
): { sale: number | null; club: number | null } {
  const club = typed.club ?? product?.club ?? (rule ? ruleClubPrice(cost, rule) : null);
  const sale = typed.sale ?? product?.sale ?? (rule ? ruleSalePrice(club, rule) : null);
  return { sale, club };
}
