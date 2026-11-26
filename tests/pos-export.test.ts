import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as XLSX from "xlsx";
import { buildPosWorkbook, planExport, sheetName, type ExportLine } from "../src/lib/pos-export.ts";
import { effectivePrices } from "../src/lib/pricing.ts";

// The POS sample file is not in the repository. This is its layout as recorded in
// SPEC.md sections 6 and 13.4: header, type and sample value of every column.
const SAMPLE_COLUMNS: [header: string, cellType: "s" | "n", value: string | number][] = [
  ["ברקוד", "s", "N12000001"],
  ["שם פריט", "s", "טבעת כסף"],
  ["מחיר מכירה", "n", 87],
  ["שם מחירון", "s", "מועדון"],
  ["מחיר מועדון", "n", 79],
  ["קוד ספק", "n", 12],
  ["שם ספק ראשי", "s", "נובה"],
  ["קוד מחלקה", "n", 11],
  ["מחלקה", "s", "תכשיטי כסף"],
  ["תת מחלקה", "s", "טבעות"],
  ['מחיר עלות ללא מע"מ', "n", 27.24],
  ["כמות", "n", 1],
];

const supplier = { name: "נובה", posCode: "12", posName: "נובה", clubMultiplier: 2.9, saleMarkupPct: 10 };
const departments = [
  { productType: "ring" as const, code: 11, department: "תכשיטי כסף", subDepartment: "טבעות" },
  { productType: "earring" as const, code: 8, department: "תכשיטי כסף", subDepartment: "עגילים" },
  { productType: "necklace" as const, code: 13, department: "תכשיטי כסף", subDepartment: "שרשראות" },
];
const noProductValues = { salePrice: null, clubPrice: null, productType: null, material: null };

const line = (overrides: Partial<ExportLine> = {}): ExportLine => ({
  variantId: "v1",
  title: "פריט",
  productId: "p1",
  quantity: 1,
  unitCost: 27.24,
  salePrice: null,
  clubPrice: null,
  productType: "ring",
  material: "silver",
  product: noProductValues,
  posCode: "N12000001",
  ...overrides,
});

const plan = (lines: ExportLine[], extra: Partial<Parameters<typeof planExport>[0]> = {}) =>
  planExport({ supplier, supplierHref: "/suppliers/s", departments, lines, ...extra });

const read = (file: Buffer) => XLSX.read(file, { type: "buffer", cellNF: true });

describe("the POS file", () => {
  const { rows, problems } = plan([line()]);
  const file = buildPosWorkbook(rows, sheetName(supplier.posName));
  const workbook = read(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  test("is a binary .xls (OLE2) with one sheet", () => {
    assert.deepEqual(problems, []);
    assert.equal(file.subarray(0, 8).toString("hex"), "d0cf11e0a1b11ae1");
    assert.deepEqual(workbook.SheetNames, ["פריטי נובה"]);
    assert.equal(sheet["!ref"], "A1:L2");
    assert.equal(sheet["!merges"]?.length ?? 0, 0);
  });

  SAMPLE_COLUMNS.forEach(([header, cellType, value], index) => {
    test(`column ${index + 1} matches the sample: ${header}`, () => {
      const column = XLSX.utils.encode_col(index);
      assert.equal(sheet[`${column}1`].v, header);
      const cell = sheet[`${column}2`];
      assert.deepEqual([cell.t, cell.v], [cellType, value]);
      assert.equal(cell.z ?? "General", "General");
    });
  });

  test("keeps leading zeros in a barcode that came from the POS", () => {
    const { rows } = plan([line({ posCode: "000123" })]);
    const sheet = Object.values(read(buildPosWorkbook(rows, "a")).Sheets)[0];
    assert.deepEqual([sheet.A2.t, sheet.A2.v], ["s", "000123"]);
  });
});

describe("rows", () => {
  test("the pricing rule matches the ends of the sample's price ranges", () => {
    const rule = { clubMultiplier: 2.9, saleMarkupPct: 10 };
    const none = { sale: null, club: null };
    assert.deepEqual(effectivePrices(none, null, 27.24, rule), { club: 79, sale: 87 });
    assert.deepEqual(effectivePrices(none, null, 206.55, rule), { club: 599, sale: 659 });
  });

  test("one row per item: quantities summed and cost averaged by quantity", () => {
    const { rows } = plan([
      line({ quantity: 1, unitCost: 10 }),
      line({ variantId: "v2", posCode: "N12000002", productType: "earring" }),
      line({ quantity: 3, unitCost: 20 }),
    ]);
    assert.deepEqual(rows.map((r) => [r[0], r[10], r[11]]), [["N12000001", 17.5, 4], ["N12000002", 27.24, 1]]);
  });

  test("lists everything missing and produces no rows", () => {
    const result = plan(
      [
        line({ unitCost: null, material: null, posCode: null }),
        line({ variantId: "v2", productType: "bracelet" }),
        line({ variantId: "v3", productType: null }),
      ],
      { supplier: { ...supplier, posCode: null, posName: null } },
    );
    assert.deepEqual(result.rows, []);
    const text = result.problems.map((p) => p.message).join("\n");
    for (const missing of [
      "קוד ספק בקופה", "שם הספק בקופה", "חסרה עלות", "חסר מחיר מכירה", "חסר מחיר מועדון",
      "חסר חומר", "חסר סוג מוצר", "״צמיד״", "חסר ברקוד פנימי",
    ]) {
      assert.ok(text.includes(missing), missing);
    }
  });

  test("one bad item blocks the whole file", () => {
    assert.deepEqual(plan([line(), line({ variantId: "v2", material: null })]).rows, []);
  });

  test("falls back to the product for values the approved line lacks", () => {
    const { rows } = plan([
      line({
        productType: null,
        material: null,
        unitCost: 50,
        product: { salePrice: 300, clubPrice: 250, productType: "necklace", material: "gold" },
      }),
    ]);
    assert.deepEqual([rows[0][1], rows[0][2], rows[0][4], rows[0][7]], ["שרשרת זהב", 300, 250, 13]);
  });

  test("barcodes still to be allocated do not count as missing in the on-screen check", () => {
    assert.deepEqual(plan([line({ posCode: null })], { barcodesPending: true }).problems, []);
  });

  test("sheet names are valid for Excel", () => {
    assert.equal(sheetName('א/ב:ג*ד?[ה]'), "פריטי א ב ג ד  ה");
    assert.ok(sheetName("ש".repeat(60)).length <= 31);
  });
});
