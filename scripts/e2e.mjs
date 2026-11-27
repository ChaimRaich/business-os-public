// Clicks through the real screens in a headless browser, against the local stack.
//
// Usage:
//   npx playwright install chromium        (once)
//   npx supabase start
//   npm run build && WOOCOMMERCE_ALLOW_LOCAL=1 PORT=3115 npm run start
//   npm run test:e2e
//
// The app must run with WOOCOMMERCE_ALLOW_LOCAL=1 so it may call the stand-in store
// this script starts on 127.0.0.1. E2E_BASE_URL overrides the app address.
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as XLSX from "xlsx";
import assert from "node:assert/strict";

const env = Object.fromEntries(readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n").map((l) => l.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3115";
assert.ok(/127\.0\.0\.1|localhost/.test(env.NEXT_PUBLIC_SUPABASE_URL), "refusing to run against a non-local database");

// A sales report laid out like the till's "daily sales by item" export (SPEC 13.5):
// no date, no transaction number, a general item, a zero line, a return, a blank line.
const work = mkdtempSync(join(tmpdir(), "e2e-"));
const reportFile = join(work, "sales.xls");
const sheet = XLSX.utils.aoa_to_sheet([
  ["שם חנות", "שם פריט", "ברקוד", "דגם", "כמות", "ספק", "קבוצות", "מחלקה", "תת מחלקה", "מותג", "מחיר נוכחי", "תיאור פריט", "ברקוד", "תאור צבע", "תאור מידה"],
  ["סניף", "טבעת", "N12000229", "", 1, "נובה", "", "תכשיטי כסף", "טבעות", "", 279, "", "", "", ""],
  ["סניף", "עגיל זהב", "N12000045", "", 0, "נובה", "", "תכשיטי כסף", "עגילים", "", 208, "", "", "", ""],
  ["סניף", "פריט כללי", "1", "", 106, "", "", "מחלקה כללית", "", "", 0, "", "", "", ""],
  ["סניף", "שרשרת", "CH112", "", 2, "גמא", "", "תכשיטי כסף", "שרשראות", "", 206, "", "", "", ""],
  ["סניף", "טבעת מידה 8", "KT10050-1", "KT10050-1", -1, "אלפא סילבר", "", "תכשיטי כסף", "טבעות", "", 141.9, "", "", "", ""],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
]);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, "Sheet");
writeFileSync(reportFile, XLSX.write(book, { bookType: "biff8", type: "buffer" }));
const run = Date.now();
const email = `e2e-${run}@example.test`;
const password = "correct-horse-battery";
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
assert.ifError((await s.auth.signUp({ email, password })).error);
const { data: business } = await s.rpc("create_business", { p_name: "חנות בדיקה" });
const { data: warehouse } = await s.from("warehouses").select("id").eq("business_id", business).single();
const { data: supplier } = await s.from("suppliers").insert({ business_id: business, name: "נובה", pos_code: "12", pos_name: "נובה", pos_next_barcode: "N12000900", price_multiplier: 2.9 }).select("id").single();
await s.from("pos_departments").insert({ business_id: business, code: "11", department: "תכשיטי כסף", sub_department: "טבעות", item_name: "טבעת כסף" });
const { data: ringProduct } = await s.rpc("create_product", { p_business_id: business, p_name: "טבעת נובה 229", p_supplier_id: supplier.id, p_variants: [{ label: "", codes: [{ kind: "pos", code: "N12000229" }] }] });
const { data: ring } = await s.from("product_variants").select("id").eq("product_id", ringProduct).single();
await s.rpc("adjust_stock", { p_variant_id: ring.id, p_warehouse_id: warehouse.id, p_delta: 4, p_reason: "פתיחה" });
// A received document in review, with one line the catalog does not know.
const documentId = crypto.randomUUID();
assert.ifError((await s.from("documents").insert({ id: documentId, business_id: business, warehouse_id: warehouse.id, status: "review", supplier_id: supplier.id, doc_number: "E2E-1", doc_type: "delivery_note" })).error);
assert.ifError((await s.rpc("replace_document_lines", { p_document_id: documentId, p_lines: [{ supplier_sku: "RG-229", description: "טבעת כסף דגם 229", quantity: 3, unit_cost: 50 }] })).error);

// A stand-in WooCommerce store with one paid order of two rings.
const KEY = "ck_" + "a".repeat(40), SECRET = "cs_" + "b".repeat(40);
const woo = createServer((req, res) => {
  const ok = req.headers.authorization === `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString("base64")}`;
  res.writeHead(ok ? 200 : 401, { "content-type": "application/json" });
  const now = new Date().toISOString().slice(0, 19);
  res.end(JSON.stringify(!ok ? { code: "x" } : new URL(req.url, "http://x").searchParams.get("page") > 1 ? [] : [{ id: 7001, status: "processing", date_created_gmt: now, date_modified_gmt: now, refunds: [], line_items: [{ id: 1, name: "טבעת", product_id: 5, variation_id: 0, quantity: 2, sku: "N12000229", price: 279 }] }]));
});
await new Promise((r) => woo.listen(0, "127.0.0.1", r));
const wooUrl = `http://127.0.0.1:${woo.address().port}`;

const browser = await chromium.launch();
const context = await browser.newContext({ locale: "he-IL", permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text().slice(0, 200)}`));
let passed = 0;
const failures = [];
async function step(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL  ${name}\n        ${String(error.message).split("\n")[0]}`);
    await page.screenshot({ path: join(work, `fail-${failures.length}.png`), fullPage: true }).catch(() => {});
  }
}
const level = async () => (await s.from("stock_levels").select("quantity").eq("variant_id", ring.id).single()).data.quantity;
const rawGoto = page.goto.bind(page);
page.goto = async (url, options) => { const r = await rawGoto(url, options); await page.waitForLoadState("networkidle"); return r; };
const see = (text) => page.getByText(text, { exact: false }).first().waitFor();

await step("login through the form", async () => {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "התחברות" }).click();
  await see("מה מחכה לטיפול");
});

await step("settings: the business shortage threshold is saved", async () => {
  await page.goto(`${BASE}/settings`);
  await page.fill("#low_stock_default", "5");
  await page.getByRole("button", { name: "שמירת הסף" }).click();
  await see("הסף הכללי נשמר");
  assert.equal((await s.from("businesses").select("low_stock_default").eq("id", business).single()).data.low_stock_default, 5);
});

await step("product: an item threshold and a stock correction are saved", async () => {
  await page.goto(`${BASE}/products/${ringProduct}`);
  await page.getByText("סף חוסר:").first().click();
  await page.fill(`#threshold-${ring.id}`, "1");
  await page.getByRole("button", { name: "שמירת הסף" }).click();
  await see("הסף נשמר");
  await page.getByText("תיקון מלאי").first().click();
  await page.locator('input[name="delta"]').fill("+2");
  await page.locator('input[name="reason"]').fill("ספירה");
  await page.getByRole("button", { name: "רישום התיקון" }).click();
  await see("המלאי עודכן");
  assert.equal(await level(), 6);
});

await step("sales: a till summary report is read, dated and imported", async () => {
  await page.goto(`${BASE}/sales/import`);
  await page.setInputFiles("#sales-file", reportFile);
  await see("2. איזו עמודה היא מה");
  assert.equal(await page.locator("#column-code").evaluate((el) => el.selectedOptions[0].textContent), "ברקוד");
  assert.equal(await page.locator("#column-quantity").evaluate((el) => el.selectedOptions[0].textContent), "כמות");
  await see("4 שורות מכירה ייובאו");
  await see("2 שורות ידולגו");
  assert.ok(await page.getByRole("button", { name: "ייבוא והורדה מהמלאי" }).isDisabled(), "no import without the report date");
  await page.fill("#report-date", "2026-11-26");
  await page.getByRole("button", { name: "ייבוא והורדה מהמלאי" }).click();
  await page.waitForURL(`${BASE}/sales`);
  await see("מכירות שלא זוהו בקטלוג");
  assert.equal(await level(), 5, "the one catalog item in the report (N12000229) went down by one");
});

await step("sales: 'not a stock item' removes the general item for good", async () => {
  const row = page.locator("li", { hasText: "פריט כללי" }).first();
  await row.getByRole("button", { name: "לא פריט מלאי" }).click();
  await see("קודים שאינם פריטי מלאי (1)");
  assert.equal((await s.from("sales_ignored_codes").select("code").eq("business_id", business)).data[0].code, "1");
});

await step("sales: the same report cannot be imported twice", async () => {
  await page.goto(`${BASE}/sales/import`);
  await page.setInputFiles("#sales-file", reportFile);
  await page.fill("#report-date", "2026-11-26");
  await page.getByRole("button", { name: "ייבוא והורדה מהמלאי" }).click();
  await see("כבר יובא");
  assert.equal(await level(), 5);
});

await step("sales: cancelling the import puts the stock back", async () => {
  await page.goto(`${BASE}/sales`);
  await page.getByText("ביטול הייבוא", { exact: true }).first().click();
  await page.getByRole("button", { name: "ביטול הייבוא והחזרת המלאי" }).click();
  await see("המלאי הוחזר");
  assert.equal(await level(), 6);
});

await step("connections: a wrong key is refused, a right one connects, and a sync lowers stock once", async () => {
  await page.goto(`${BASE}/settings/connections`);
  await page.fill("#store_url", wooUrl);
  await page.fill("#consumer_key", KEY);
  await page.fill("#consumer_secret", "cs_" + "c".repeat(40));
  await page.fill("#sync_from", "2026-11-01");
  await page.getByRole("button", { name: "בדיקה וחיבור" }).click();
  await see("האתר דחה את המפתח");
  await page.fill("#store_url", wooUrl);
  await page.fill("#consumer_key", KEY);
  await page.fill("#consumer_secret", SECRET);
  await page.fill("#sync_from", "2026-11-01");
  await page.getByRole("button", { name: "בדיקה וחיבור" }).click();
  await see("סנכרון עכשיו");
  await page.getByRole("button", { name: "סנכרון עכשיו" }).click();
  await see("נקראו 1 הזמנות");
  assert.equal(await level(), 4);
  await page.getByRole("button", { name: "סנכרון עכשיו" }).click();
  await see("המלאי כבר היה מעודכן");
  assert.equal(await level(), 4);
});

await step("receiving: an unknown line is linked to an existing product", async () => {
  await page.goto(`${BASE}/receiving/${documentId}`);
  await see("לא נמצא בקטלוג");
  await page.getByText("שיוך למוצר קיים").first().click();
  await page.locator('input[type="search"]').first().fill("נובה 229");
  await page.getByRole("button", { name: "חיפוש", exact: true }).click();
  await page.getByRole("button", { name: /טבעת נובה 229/ }).click();
  await see("בקטלוג:");
  const { data: codes } = await s.from("variant_codes").select("kind, code").eq("variant_id", ring.id).eq("kind", "supplier_sku");
  assert.deepEqual(codes, [{ kind: "supplier_sku", code: "RG-229" }]);
});

await step("receiving: approval raises stock by the received quantity", async () => {
  await page.goto(`${BASE}/receiving/${documentId}`);
  await page.getByRole("button", { name: /אישור הקליטה ועדכון המלאי/ }).first().click();
  await see("הקליטה אושרה");
  assert.equal(await level(), 7);
});

let exportId;
await step("till file: created with prices, downloads as .xls", async () => {
  await page.goto(`${BASE}/receiving/${documentId}/export`);
  await page.locator(`#dep-${ring.id}`).selectOption({ index: 1 });
  if (!(await page.locator(`#name-${ring.id}`).inputValue())) await page.locator(`#name-${ring.id}`).fill("טבעת כסף");
  assert.equal(await page.locator(`#club-${ring.id}`).inputValue(), "145", "cost 50 x 2.9");
  await page.getByRole("button", { name: /יצירת|הכנת/ }).last().click();
  await see("ממתין להעלאה לקופה");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "הורדה" }).first().click()]);
  assert.match(download.suggestedFilename(), /\.xls$/);
  const { data } = await s.from("pos_exports").select("id, rows").eq("document_id", documentId).single();
  exportId = data.id;
  assert.equal(data.rows[0].barcode, "N12000229");
  assert.equal(data.rows[0].quantity, 3);
  assert.equal(await level(), 7, "a till file never touches stock");
});

await step("till file: a problem is reported, then the file is confirmed", async () => {
  await page.getByText("הקופה לא קיבלה את הקובץ").first().click();
  await page.locator(`#problem-${exportId}`).fill("שגיאה בשורה 1");
  await page.getByRole("button", { name: "שמירת התקלה" }).click();
  await see("תקלה בקופה");
  await page.goto(`${BASE}/exports?status=problem`);
  await see("שגיאה בשורה 1");
  await page.getByRole("button", { name: "הקובץ נקלט בקופה" }).first().click();
  // Wait for the save to land before leaving: navigating away mid-request cancels it.
  await see("אין קבצים בסטטוס הזה");
  await page.goto(`${BASE}/exports`);
  await see("נקלט בקופה");
  await see("תקלה קודמת");
});

await step("shortages: the item under its threshold is listed, and the order draft copies", async () => {
  await s.rpc("adjust_stock", { p_variant_id: ring.id, p_warehouse_id: warehouse.id, p_delta: -6, p_reason: "בדיקה" });
  await page.goto(`${BASE}/reports/stock`);
  await see("מתחת לסף (1)");
  await page.getByRole("link", { name: /נובה \(1\)/ }).click();
  await see("טיוטת הזמנה: נובה");
  assert.match(await page.locator("#order-draft").inputValue(), /טבעת נובה 229 \(מק״ט RG-229\): \d+ יח׳/);
  await page.getByRole("button", { name: "העתקת הטיוטה" }).click();
  await see("הועתק");
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /הזמנה מחנות בדיקה/);
});

await step("sales report: by product and by supplier", async () => {
  await page.goto(`${BASE}/reports/sales`);
  await see("טבעת נובה 229");
  await page.getByRole("link", { name: "לפי ספק" }).click();
  await see("פריט אחד");
  await see("מהן באתר");
});

await step("home: the shortage shows under what is waiting", async () => {
  await page.goto(`${BASE}/`);
  await see("פריט אחד מתחת לסף החוסר");
});

await step("phone width: the main screens have no sideways scroll", async () => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ["/", "/sales", "/reports/stock", "/reports/sales", "/settings/connections", `/receiving/${documentId}`, "/exports"]) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${path} scrolls sideways by ${overflow}px`);
  }
});

await browser.close();
woo.close();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log(`screenshots of the failures: ${work}`);
if (errors.length) console.log("browser errors:\n" + [...new Set(errors)].slice(0, 10).join("\n"));
process.exit(failures.length ? 1 : 0);
