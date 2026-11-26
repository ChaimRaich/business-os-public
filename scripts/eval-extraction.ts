// Runs the real extraction on sample documents and compares the rows with the
// expected results recorded in SPEC.md (sections 13.1 and 13.2).
//
// Usage: npm run eval:extraction -- path/to/invoice.pdf [more files...]
// Needs model credentials in .env.local (see .env.example). Each run costs API usage.
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { extractDocument, type SourceFile } from "../src/lib/extraction/extract.ts";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.+)$/);
  if (match) process.env[match[1]] ??= match[2];
}

type Expected = { sku: string | null; barcode: string | null; quantity: number; cost: number };

/** Reads the "expected extraction" table that follows a heading in SPEC.md. */
function expectedFromSpec(heading: string, columns: { sku: number; barcode: number | null; quantity: number; cost: number }): Expected[] {
  const spec = readFileSync(new URL("../SPEC.md", import.meta.url), "utf8");
  const section = spec.slice(spec.indexOf(heading));
  const table = section.slice(section.indexOf("**תוצאת חילוץ צפויה**"));
  const rows: Expected[] = [];
  for (const line of table.split("\n").slice(1)) {
    if (!line.startsWith("|")) {
      if (rows.length > 0) break;
      continue;
    }
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (!/^\d+$/.test(cells[0])) continue;
    const number = (index: number) => Number(cells[index].replace(/,/g, ""));
    rows.push({
      sku: cells[columns.sku] || null,
      barcode: columns.barcode === null ? null : cells[columns.barcode] || null,
      quantity: number(columns.quantity),
      cost: number(columns.cost),
    });
  }
  return rows;
}

const EXPECTED: Record<string, Expected[]> = {
  "1001": expectedFromSpec("### 13.1", { sku: 1, barcode: 2, quantity: 5, cost: 6 }),
  "2002": expectedFromSpec("### 13.2", { sku: 1, barcode: null, quantity: 3, cost: 6 }),
};

const MIME: Record<string, SourceFile["mimeType"]> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: npm run eval:extraction -- <file> [<file>...]");
  process.exit(2);
}

let failures = 0;
for (const path of paths) {
  const mimeType = MIME[extname(path).toLowerCase()];
  if (!mimeType) {
    console.error(`${path}: unsupported file type`);
    failures += 1;
    continue;
  }
  const started = Date.now();
  const { result, model } = await extractDocument([{ mimeType, data: readFileSync(path) }]);
  console.log(`\n${path}\n  model ${model}, ${((Date.now() - started) / 1000).toFixed(0)}s`);
  console.log(`  ${result.supplier_name} (${result.supplier_tax_id}) · ${result.doc_type} ${result.doc_number} · ${result.doc_date}`);
  console.log(`  rows ${result.lines.length}, printed quantity ${result.printed_quantity}, total ${result.printed_total}`);
  if (result.notes) console.log(`  notes: ${result.notes}`);

  const expected = result.doc_number ? EXPECTED[result.doc_number] : undefined;
  if (!expected) {
    console.log("  no expected result recorded for this document; printing rows only");
    console.table(result.lines.map((l) => ({ sku: l.supplier_sku, barcode: l.barcode, variant: l.variant, qty: l.quantity, cost: l.unit_cost, unsure: l.uncertain_fields.join(",") })));
    continue;
  }

  const problems: string[] = [];
  if (result.lines.length !== expected.length) {
    problems.push(`row count ${result.lines.length}, expected ${expected.length}`);
  }
  expected.forEach((want, index) => {
    const got = result.lines[index];
    if (!got) return;
    const diffs = [
      got.supplier_sku !== want.sku && `sku ${got.supplier_sku} ≠ ${want.sku}`,
      want.barcode !== null && got.barcode !== want.barcode && `barcode ${got.barcode} ≠ ${want.barcode}`,
      got.quantity !== want.quantity && `quantity ${got.quantity} ≠ ${want.quantity}`,
      (got.unit_cost === null || Math.abs(got.unit_cost - want.cost) > 0.005) && `cost ${got.unit_cost} ≠ ${want.cost}`,
    ].filter(Boolean);
    if (diffs.length > 0) {
      const flagged = got.uncertain_fields.length > 0 ? ` (flagged: ${got.uncertain_fields.join(",")})` : "";
      problems.push(`row ${index + 1}: ${diffs.join("; ")}${flagged}`);
    }
  });

  if (problems.length === 0) {
    console.log(`  PASS: all ${expected.length} rows match SPEC.md`);
  } else {
    failures += 1;
    console.log(`  FAIL: ${problems.length} differences`);
    for (const problem of problems) console.log(`    ${problem}`);
  }
}
process.exit(failures > 0 ? 1 : 0);
