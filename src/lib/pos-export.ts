import * as XLSX from "xlsx";
import {
  effectivePrices,
  MATERIAL_LABELS,
  PRODUCT_TYPE_LABELS,
  type Material,
  type PricingRule,
  type ProductType,
} from "./pricing.ts";

// The POS upload file, as in the sample the POS accepted (SPEC 6 and 13.4):
// .xls, one sheet, one header row, these 12 columns in this order.

/** Bump when columns, types or mapping rules change; stored with every export. */
export const TEMPLATE_VERSION = "pos-products-v1";

export const POS_HEADERS = [
  "ברקוד",
  "שם פריט",
  "מחיר מכירה",
  "שם מחירון",
  "מחיר מועדון",
  "קוד ספק",
  "שם ספק ראשי",
  "קוד מחלקה",
  "מחלקה",
  "תת מחלקה",
  'מחיר עלות ללא מע"מ',
  "כמות",
] as const;

export const PRICE_LIST_NAME = "מועדון";

/** One row in header order. Strings become text cells and numbers numeric cells. */
export type PosRow = [
  string, string, number, string, number, number, string, number, string, string, number, number,
];

export type ExportLine = {
  variantId: string;
  /** How the item is named in the missing-data list. */
  title: string;
  productId: string;
  quantity: number;
  unitCost: number | null;
  salePrice: number | null;
  clubPrice: number | null;
  productType: ProductType | null;
  material: Material | null;
  /** Current catalog values, used when the line was approved without them. */
  product: {
    salePrice: number | null;
    clubPrice: number | null;
    productType: ProductType | null;
    material: Material | null;
  };
  posCode: string | null;
};

export type ExportSupplier = { name: string; posCode: string | null; posName: string | null } & PricingRule;

export type Department = {
  productType: ProductType;
  code: number;
  department: string;
  subDepartment: string;
};

export type Problem = { message: string; href: string; action: string };

export type ExportPlan = { problems: Problem[]; rows: PosRow[]; variantIds: string[] };

export const isPosSupplierCode = (value: string | null): value is string => /^[0-9]{1,9}$/.test(value ?? "");

const round2 = (value: number) => Math.round(value * 100 + 1e-7) / 100;

function groupByVariant(lines: ExportLine[]): ExportLine[][] {
  const groups = new Map<string, ExportLine[]>();
  for (const line of lines) {
    const group = groups.get(line.variantId);
    if (group) {
      group.push(line);
    } else {
      groups.set(line.variantId, [line]);
    }
  }
  return [...groups.values()];
}

/**
 * Checks everything the file needs and builds its rows, one per item, in document
 * order. Rows are returned only when nothing is missing.
 */
export function planExport(input: {
  supplier: ExportSupplier;
  supplierHref: string;
  departments: Department[];
  lines: ExportLine[];
  /** True for the on-screen check: internal barcodes are allocated when the file is created. */
  barcodesPending?: boolean;
}): ExportPlan {
  const { supplier, supplierHref, lines, barcodesPending = false } = input;
  const problems: Problem[] = [];
  const supplierProblem = (message: string) =>
    problems.push({ message, href: supplierHref, action: "לכרטיס הספק" });

  if (!supplier.posCode) {
    supplierProblem(`חסר קוד ספק בקופה לספק ${supplier.name}. בלעדיו אי אפשר גם להקצות ברקוד פנימי.`);
  } else if (!isPosSupplierCode(supplier.posCode)) {
    supplierProblem(`קוד הספק בקופה של ${supplier.name} חייב להיות מספר (עד 9 ספרות).`);
  }
  if (!supplier.posName) {
    supplierProblem(`חסר שם הספק בקופה לספק ${supplier.name}.`);
  }
  if (lines.length === 0) {
    problems.push({ message: "אין שורות לייצוא.", href: supplierHref, action: "לכרטיס הספק" });
  }

  const departments = new Map(input.departments.map((d) => [d.productType, d]));
  const missingDepartments = new Set<ProductType>();
  const rows: PosRow[] = [];
  const variantIds: string[] = [];

  for (const group of groupByVariant(lines)) {
    const [first] = group;
    const productHref = `/products/${first.productId}`;
    const itemProblem = (what: string, href = productHref, action = "לדף המוצר") =>
      problems.push({ message: `${first.title}: ${what}`, href, action });

    const quantity = group.reduce((sum, line) => sum + line.quantity, 0);
    // Same item at different costs: the quantity-weighted average.
    const hasCost = group.every((line) => line.unitCost !== null);
    const cost = hasCost
      ? round2(group.reduce((sum, line) => sum + line.unitCost! * line.quantity, 0) / quantity)
      : null;

    const type = first.productType ?? first.product.productType;
    const material = first.material ?? first.product.material;
    const prices = effectivePrices(
      { sale: first.salePrice, club: first.clubPrice },
      { sale: first.product.salePrice, club: first.product.clubPrice },
      cost,
      supplier,
    );
    const department = type ? departments.get(type) : undefined;

    if (!type) {
      itemProblem("חסר סוג מוצר.");
    } else if (!department) {
      missingDepartments.add(type);
    }
    if (!material) {
      itemProblem("חסר חומר (כסף / זהב).");
    }
    if (cost === null || cost <= 0) {
      // The fix is on the document page itself.
      itemProblem("חסרה עלות ליחידה.", "#missing-cost", "להשלמת העלות");
    }
    if (prices.sale === null) {
      itemProblem("חסר מחיר מכירה.");
    }
    if (prices.club === null) {
      itemProblem("חסר מחיר מועדון.");
    }
    if (!first.posCode && !barcodesPending) {
      itemProblem("חסר ברקוד פנימי.");
    }

    variantIds.push(first.variantId);
    if (
      type && material && department && cost !== null && prices.sale !== null && prices.club !== null &&
      isPosSupplierCode(supplier.posCode) && supplier.posName && (first.posCode || barcodesPending)
    ) {
      rows.push([
        first.posCode ?? "",
        `${PRODUCT_TYPE_LABELS[type]} ${MATERIAL_LABELS[material]}`,
        prices.sale,
        PRICE_LIST_NAME,
        prices.club,
        Number(supplier.posCode),
        supplier.posName,
        department.code,
        department.department,
        department.subDepartment,
        cost,
        quantity,
      ]);
    }
  }

  for (const type of missingDepartments) {
    problems.push({
      message: `חסרים קוד מחלקה, מחלקה ותת מחלקה לסוג ״${PRODUCT_TYPE_LABELS[type]}״.`,
      href: "/settings#departments",
      action: "להגדרות",
    });
  }

  return { problems, rows: problems.length === 0 ? rows : [], variantIds };
}

/** Excel sheet names: at most 31 characters, without []:*?/\ */
export function sheetName(supplierPosName: string): string {
  return `פריטי ${supplierPosName}`.replace(/[[\]:*?/\\]/g, " ").slice(0, 31).trim();
}

/** An Excel 97-2003 (BIFF8) workbook with General formatting in every cell. */
export function buildPosWorkbook(rows: PosRow[], name: string): Buffer {
  const sheet = XLSX.utils.aoa_to_sheet([[...POS_HEADERS], ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, name);
  return XLSX.write(workbook, { type: "buffer", bookType: "biff8" }) as Buffer;
}
