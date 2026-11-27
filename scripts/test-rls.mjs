// Tenant-isolation check against the local Supabase stack.
// Usage: npm run test:rls   (requires `npx supabase start`)
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(url.includes("127.0.0.1") || url.includes("localhost"), "refusing to run against a non-local database");

const run = Date.now();
const client = () => createClient(url, key, { auth: { persistSession: false } });

async function newUser(label) {
  const supabase = client();
  const email = `${label}-${run}@example.test`;
  const { data, error } = await supabase.auth.signUp({ email, password: "correct-horse-battery" });
  assert.ifError(error);
  return { supabase, email, id: data.user.id };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

const anon = client();
const alice = await newUser("alice");
const bob = await newUser("bob");
const carol = await newUser("carol");

const { data: shopA, error: errA } = await alice.supabase.rpc("create_business", { p_name: "חנות א" });
assert.ifError(errA);
const { data: shopB, error: errB } = await bob.supabase.rpc("create_business", { p_name: "חנות ב" });
assert.ifError(errB);

await check("anonymous sees nothing and cannot create a business", async () => {
  for (const table of ["businesses", "business_members", "profiles"]) {
    const { data } = await anon.from(table).select("*");
    assert.equal(data?.length ?? 0, 0, table);
  }
  const { error } = await anon.rpc("create_business", { p_name: "x" });
  assert.ok(error);
});

await check("a user sees only their own business", async () => {
  const { data } = await alice.supabase.from("businesses").select("id");
  assert.deepEqual(data.map((b) => b.id), [shopA]);
  const { data: other } = await alice.supabase.from("businesses").select("id").eq("id", shopB);
  assert.equal(other.length, 0);
});

await check("a user sees only members and profiles of their own business", async () => {
  const { data: members } = await alice.supabase.from("business_members").select("user_id, business_id");
  assert.deepEqual(members, [{ user_id: alice.id, business_id: shopA }]);
  const { data: profiles } = await alice.supabase.from("profiles").select("id");
  assert.deepEqual(profiles.map((p) => p.id), [alice.id]);
});

await check("direct inserts are blocked; businesses are only created through the RPC", async () => {
  const { error: e1 } = await alice.supabase.from("businesses").insert({ name: "hack" });
  assert.ok(e1);
  const { error: e2 } = await alice.supabase
    .from("business_members")
    .insert({ business_id: shopB, user_id: alice.id, role: "owner" });
  assert.ok(e2);
});

await check("a user cannot rename, join, or manage another business", async () => {
  const { data: renamed } = await alice.supabase.from("businesses").update({ name: "pwned" }).eq("id", shopB).select();
  assert.equal(renamed.length, 0);
  const { error } = await alice.supabase.rpc("add_member_by_email", { p_business_id: shopB, p_email: alice.email, p_role: "owner" });
  assert.match(error.message, /forbidden/);
  const { data: removed } = await alice.supabase.from("business_members").delete().eq("business_id", shopB).select();
  assert.equal(removed.length, 0);
});

await check("owner adds a staff member, who then sees that business only", async () => {
  const { error } = await alice.supabase.rpc("add_member_by_email", { p_business_id: shopA, p_email: carol.email, p_role: "staff" });
  assert.ifError(error);
  const { data } = await carol.supabase.from("businesses").select("id");
  assert.deepEqual(data.map((b) => b.id), [shopA]);
  const { data: profiles } = await carol.supabase.from("profiles").select("id");
  assert.deepEqual(profiles.map((p) => p.id).sort(), [alice.id, carol.id].sort());
});

await check("staff cannot rename the business, change roles, add or remove others", async () => {
  const { data: renamed } = await carol.supabase.from("businesses").update({ name: "x" }).eq("id", shopA).select();
  assert.equal(renamed.length, 0);
  const { data: promoted } = await carol.supabase.from("business_members").update({ role: "owner" }).eq("business_id", shopA).eq("user_id", carol.id).select();
  assert.equal(promoted.length, 0);
  const { error } = await carol.supabase.rpc("add_member_by_email", { p_business_id: shopA, p_email: bob.email, p_role: "staff" });
  assert.match(error.message, /forbidden/);
  const { data: removed } = await carol.supabase.from("business_members").delete().eq("business_id", shopA).eq("user_id", alice.id).select();
  assert.equal(removed.length, 0);
});

await check("membership keys cannot be rewritten to move a member between businesses", async () => {
  const { error } = await alice.supabase.from("business_members").update({ business_id: shopB }).eq("business_id", shopA).eq("user_id", carol.id);
  assert.ok(error);
});

await check("the last owner cannot be demoted or removed", async () => {
  const { error: e1 } = await alice.supabase.from("business_members").update({ role: "staff" }).eq("business_id", shopA).eq("user_id", alice.id);
  assert.match(e1.message, /last_owner/);
  const { error: e2 } = await alice.supabase.from("business_members").delete().eq("business_id", shopA).eq("user_id", alice.id);
  assert.match(e2.message, /last_owner/);
});

// --- Catalog -----------------------------------------------------------------

const { data: supplierA, error: supErr } = await alice.supabase
  .from("suppliers").insert({ business_id: shopA, name: "אלפא סילבר" }).select("id").single();
assert.ifError(supErr);

const { data: ringId, error: ringErr } = await alice.supabase.rpc("create_product", {
  p_business_id: shopA,
  p_name: "טבעת כסף CAG020-1",
  p_supplier_id: supplierA.id,
  p_variants: [
    { label: "מידה 6", codes: [{ kind: "barcode", code: "700007835787" }, { kind: "supplier_sku", code: "cag020-1" }, { kind: "pos", code: "000123" }] },
    { label: "מידה 7", codes: [{ kind: "barcode", code: "700007835794" }, { kind: "supplier_sku", code: "cag020-1" }] },
  ],
});
assert.ifError(ringErr);

const search = async (who, business, query) => {
  const { data, error } = await who.supabase.rpc("search_products", { p_business_id: business, p_query: query });
  assert.ifError(error);
  return data.map((p) => p.id);
};

await check("a new business gets a default warehouse", async () => {
  const { data } = await alice.supabase.from("warehouses").select("name, is_default").eq("business_id", shopA);
  assert.deepEqual(data, [{ name: "מחסן ראשי", is_default: true }]);
});

await check("a product is found by name, barcode, POS code, supplier SKU (any case) and variant", async () => {
  for (const query of ["טבעת", "700007835794", "7835787", "CAG020", "cag020-1", "000123", "מידה 7", "אלפא"]) {
    assert.deepEqual(await search(alice, shopA, query), [ringId], query);
  }
  assert.deepEqual(await search(alice, shopA, "999999"), []);
  assert.deepEqual(await search(alice, shopA, "%"), [], "wildcards are literal");
});

await check("codes keep leading zeros and original case", async () => {
  const { data } = await alice.supabase.from("variant_codes").select("code").in("kind", ["pos", "supplier_sku"]).order("code");
  assert.deepEqual([...new Set(data.map((c) => c.code))], ["000123", "cag020-1"]);
});

await check("another business cannot see or search the catalog", async () => {
  for (const table of ["products", "product_variants", "variant_codes", "suppliers", "warehouses"]) {
    const { data } = await bob.supabase.from(table).select("id").eq("business_id", shopA);
    assert.equal(data.length, 0, table);
  }
  assert.deepEqual(await search(bob, shopA, "טבעת"), []);
  assert.deepEqual(await search(bob, shopB, "טבעת"), []);
});

await check("another business cannot write into the catalog or link to its rows", async () => {
  const { error: e1 } = await bob.supabase.from("products").insert({ business_id: shopA, name: "hack" });
  assert.ok(e1);
  const { error: e2 } = await bob.supabase.rpc("create_product", { p_business_id: shopA, p_name: "hack" });
  assert.ok(e2);
  // Own business_id, someone else's parent rows: blocked by the composite foreign keys.
  const { error: e3 } = await bob.supabase.from("product_variants").insert({ business_id: shopB, product_id: ringId, label: "x" });
  assert.ok(e3);
  const { error: e4 } = await bob.supabase.from("products").insert({ business_id: shopB, name: "x", supplier_id: supplierA.id });
  assert.ok(e4);
  const { data: renamed } = await bob.supabase.from("products").update({ name: "pwned" }).eq("id", ringId).select();
  assert.equal(renamed.length, 0);
  const { data: deleted } = await bob.supabase.from("products").delete().eq("id", ringId).select();
  assert.equal(deleted.length, 0);
});

await check("a barcode or POS code is unique within a business, but free in another", async () => {
  const dup = await alice.supabase.rpc("create_product", { p_business_id: shopA, p_name: "כפול", p_variants: [{ label: "", codes: [{ kind: "barcode", code: "700007835787" }] }] });
  assert.match(dup.error.message, /variant_codes_unique_code/);
  const { data: left } = await alice.supabase.from("products").select("id").eq("name", "כפול");
  assert.equal(left.length, 0, "failed create leaves nothing behind");
  const other = await bob.supabase.rpc("create_product", { p_business_id: shopB, p_name: "אותו ברקוד", p_variants: [{ label: "", codes: [{ kind: "barcode", code: "700007835787" }] }] });
  assert.ifError(other.error);
});

await check("a supplier SKU needs a supplier; other codes must not have one", async () => {
  const { data: variant } = await alice.supabase.from("product_variants").select("id").eq("product_id", ringId).limit(1).single();
  const base = { business_id: shopA, variant_id: variant.id };
  const { error: e1 } = await alice.supabase.from("variant_codes").insert({ ...base, kind: "supplier_sku", code: "X1" });
  assert.ok(e1);
  const { error: e2 } = await alice.supabase.from("variant_codes").insert({ ...base, kind: "barcode", code: "X2", supplier_id: supplierA.id });
  assert.ok(e2);
});

await check("staff can add products but cannot delete them or manage warehouses", async () => {
  const created = await carol.supabase.rpc("create_product", { p_business_id: shopA, p_name: "עגיל" });
  assert.ifError(created.error);
  const { data: deleted } = await carol.supabase.from("products").delete().eq("id", created.data).select();
  assert.equal(deleted.length, 0);
  const { error } = await carol.supabase.from("warehouses").insert({ business_id: shopA, name: "סניף" });
  assert.ok(error);
  const { data: owned } = await alice.supabase.from("products").delete().eq("id", created.data).select();
  assert.equal(owned.length, 1);
});

await check("a product keeps at least one variant; deleting the product removes everything", async () => {
  const { data: variants } = await alice.supabase.from("product_variants").select("id").eq("product_id", ringId);
  assert.equal(variants.length, 2);
  const first = await alice.supabase.from("product_variants").delete().eq("id", variants[0].id);
  assert.ifError(first.error);
  const second = await alice.supabase.from("product_variants").delete().eq("id", variants[1].id);
  assert.match(second.error.message, /last_variant/);
  const gone = await alice.supabase.from("products").delete().eq("id", ringId).select();
  assert.equal(gone.data.length, 1);
  const { data: codes } = await alice.supabase.from("variant_codes").select("id").eq("business_id", shopA);
  assert.equal(codes.length, 0);
});

await check("only one default warehouse, switched atomically", async () => {
  const { data: branch, error } = await alice.supabase.from("warehouses").insert({ business_id: shopA, name: "סניף" }).select("id").single();
  assert.ifError(error);
  const denied = await bob.supabase.rpc("set_default_warehouse", { p_warehouse_id: branch.id });
  assert.ok(denied.error);
  const done = await alice.supabase.rpc("set_default_warehouse", { p_warehouse_id: branch.id });
  assert.ifError(done.error);
  const { data } = await alice.supabase.from("warehouses").select("name").eq("business_id", shopA).eq("is_default", true);
  assert.deepEqual(data, [{ name: "סניף" }]);
});

// --- Documents ----------------------------------------------------------------

const { randomUUID } = await import("node:crypto");
const docA = randomUUID();
const pathA = `${shopA}/${docA}/1.pdf`;
const pdfBytes = new Blob(["%PDF-1.4 test"], { type: "application/pdf" });
const { data: warehouseA } = await alice.supabase.from("warehouses").select("id").eq("business_id", shopA).limit(1).single();
const { data: warehouseB } = await bob.supabase.from("warehouses").select("id").eq("business_id", shopB).limit(1).single();

await check("a member uploads a document file; other businesses cannot read, upload or delete it", async () => {
  const up = await alice.supabase.storage.from("documents").upload(pathA, pdfBytes, { contentType: "application/pdf" });
  assert.ifError(up.error);
  const theirs = await bob.supabase.storage.from("documents").download(pathA);
  assert.ok(theirs.error);
  const signed = await bob.supabase.storage.from("documents").createSignedUrl(pathA, 60);
  assert.ok(signed.error);
  const intrude = await bob.supabase.storage.from("documents").upload(`${shopA}/${randomUUID()}/1.pdf`, pdfBytes, { contentType: "application/pdf" });
  assert.ok(intrude.error);
  await bob.supabase.storage.from("documents").remove([pathA]);
  const still = await alice.supabase.storage.from("documents").download(pathA);
  assert.ifError(still.error);
  const anonRead = await anon.storage.from("documents").download(pathA);
  assert.ok(anonRead.error);
});

await check("only images and PDFs are accepted by the bucket", async () => {
  const bad = await alice.supabase.storage.from("documents").upload(`${shopA}/${docA}/x.html`, new Blob(["<script>"], { type: "text/html" }), { contentType: "text/html" });
  assert.ok(bad.error);
});

await check("documents and their lines are invisible and unwritable to other businesses", async () => {
  const created = await alice.supabase.from("documents").insert({ id: docA, business_id: shopA, warehouse_id: warehouseA.id });
  assert.ifError(created.error);
  const lines = await alice.supabase.rpc("replace_document_lines", { p_document_id: docA, p_lines: [{ barcode: "0001", quantity: 2, unit_cost: 10.5 }] });
  assert.ifError(lines.error);
  for (const table of ["documents", "document_lines", "document_files"]) {
    const { data } = await bob.supabase.from(table).select("id").eq("business_id", shopA);
    assert.equal(data.length, 0, table);
  }
  const overwrite = await bob.supabase.rpc("replace_document_lines", { p_document_id: docA, p_lines: [] });
  assert.ok(overwrite.error);
  const { data: kept } = await alice.supabase.from("document_lines").select("barcode, quantity").eq("document_id", docA);
  assert.deepEqual(kept, [{ barcode: "0001", quantity: 2 }]);
  // Own business, someone else's warehouse / document: blocked by the composite keys.
  const cross = await bob.supabase.from("documents").insert({ id: randomUUID(), business_id: shopB, warehouse_id: warehouseA.id });
  assert.ok(cross.error);
  const crossLine = await bob.supabase.from("document_lines").insert({ business_id: shopB, document_id: docA, position: 1 });
  assert.ok(crossLine.error);
});

await check("lines match the catalog by barcode, and by supplier SKU only when it is unambiguous", async () => {
  const { data: sup } = await alice.supabase.from("suppliers").insert({ business_id: shopA, name: "ספק התאמות" }).select("id").single();
  const one = await alice.supabase.rpc("create_product", { p_business_id: shopA, p_name: "עגיל", p_supplier_id: sup.id, p_variants: [{ label: "", codes: [{ kind: "barcode", code: "0007001" }, { kind: "supplier_sku", code: "ZAG803-1" }] }] });
  assert.ifError(one.error);
  const many = await alice.supabase.rpc("create_product", { p_business_id: shopA, p_name: "טבעת", p_supplier_id: sup.id, p_variants: [
    { label: "6", codes: [{ kind: "barcode", code: "0007006" }, { kind: "supplier_sku", code: "CAG020-1" }] },
    { label: "7", codes: [{ kind: "barcode", code: "0007007" }, { kind: "supplier_sku", code: "CAG020-1" }] },
  ] });
  assert.ifError(many.error);
  await alice.supabase.from("documents").update({ supplier_id: sup.id }).eq("id", docA);
  const saved = await alice.supabase.rpc("replace_document_lines", { p_document_id: docA, p_lines: [
    { barcode: "0007007", supplier_sku: "CAG020-1" },
    { supplier_sku: "zag803-1" },
    { supplier_sku: "CAG020-1" },
    { barcode: "9999999", supplier_sku: "NOPE" },
  ] });
  assert.ifError(saved.error);
  const { data } = await alice.supabase.from("document_lines").select("position, match_method, product_variants (label)").eq("document_id", docA).order("position");
  assert.deepEqual(data.map((l) => [l.match_method, l.product_variants?.label ?? null]), [["barcode", "7"], ["supplier_sku", ""], [null, null], [null, null]]);
  // The other business has its own catalog; nothing of A's leaks into its matches.
  const docB = randomUUID();
  await bob.supabase.from("documents").insert({ id: docB, business_id: shopB, warehouse_id: warehouseB.id });
  await bob.supabase.rpc("replace_document_lines", { p_document_id: docB, p_lines: [{ barcode: "0007007" }] });
  const { data: other } = await bob.supabase.from("document_lines").select("variant_id").eq("document_id", docB);
  assert.deepEqual(other, [{ variant_id: null }]);
});

await check("staff cannot delete a document; a manager can, and its lines go with it", async () => {
  const denied = await carol.supabase.from("documents").delete().eq("id", docA).select();
  assert.equal(denied.data.length, 0);
  const done = await alice.supabase.from("documents").delete().eq("id", docA).select();
  assert.equal(done.data.length, 1);
  const { data } = await alice.supabase.from("document_lines").select("id").eq("document_id", docA);
  assert.equal(data.length, 0);
});

// --- Stock ---------------------------------------------------------------------

const stockDoc = randomUUID();
const { data: stockSupplier } = await alice.supabase.from("suppliers").insert({ business_id: shopA, name: "ספק מלאי" }).select("id").single();
const levels = async (supabase = alice.supabase) => {
  const { data } = await supabase.from("stock_levels").select("quantity, product_variants (label, products (name))").eq("business_id", shopA);
  return Object.fromEntries(data.map((row) => [`${row.product_variants.products.name}/${row.product_variants.label}`, row.quantity]));
};

await check("new products are created from unmatched lines, sharing a model code as variants", async () => {
  await alice.supabase.from("documents").insert({ id: stockDoc, business_id: shopA, warehouse_id: warehouseA.id });
  await alice.supabase.from("documents").update({ status: "review", doc_number: "S-1" }).eq("id", stockDoc);
  const lines = [
    { supplier_sku: "RNG1", barcode: "0008006", description: "טבעת מלאי", variant_text: "6", quantity: 2, unit_cost: 10 },
    { supplier_sku: "RNG1", barcode: "0008007", description: "טבעת מלאי", variant_text: "7", quantity: 1, unit_cost: 10 },
    { supplier_sku: "SW-1", description: "שעון מלאי", quantity: 1, unit_cost: 50 },
    { supplier_sku: "sw-1", description: "שעון מלאי", quantity: 3, unit_cost: 50 },
    { description: "בלי קוד", quantity: 1 },
  ];
  assert.ifError((await alice.supabase.rpc("replace_document_lines", { p_document_id: stockDoc, p_lines: lines })).error);
  const noSupplier = await alice.supabase.rpc("create_products_from_lines", { p_document_id: stockDoc });
  assert.match(noSupplier.error.message, /supplier_required/);
  await alice.supabase.from("documents").update({ supplier_id: stockSupplier.id }).eq("id", stockDoc);
  const intruder = await bob.supabase.rpc("create_products_from_lines", { p_document_id: stockDoc });
  assert.ok(intruder.error);
  const created = await carol.supabase.rpc("create_products_from_lines", { p_document_id: stockDoc });
  assert.ifError(created.error);
  assert.equal(created.data, 3);
  const again = await alice.supabase.rpc("create_products_from_lines", { p_document_id: stockDoc });
  assert.equal(again.data, 0);
  const { data } = await alice.supabase.from("document_lines").select("position, product_variants (label, products (name))").eq("document_id", stockDoc).order("position");
  assert.deepEqual(data.map((l) => l.product_variants && `${l.product_variants.products.name}/${l.product_variants.label}`), ["טבעת מלאי/6", "טבעת מלאי/7", "שעון מלאי/", "שעון מלאי/", null]);
});

await check("a document with an unmatched line or a missing quantity is not approved", async () => {
  const unmatched = await alice.supabase.rpc("approve_document", { p_document_id: stockDoc });
  assert.match(unmatched.error.message, /unmatched_lines/);
  const { data: kept } = await alice.supabase.from("document_lines").select("supplier_sku, barcode, description, variant_text, quantity, unit_cost").eq("document_id", stockDoc).order("position").limit(4);
  await alice.supabase.rpc("replace_document_lines", { p_document_id: stockDoc, p_lines: [...kept.slice(0, 3), { ...kept[3], quantity: null }] });
  const missing = await alice.supabase.rpc("approve_document", { p_document_id: stockDoc });
  assert.match(missing.error.message, /bad_quantity/);
  await alice.supabase.rpc("replace_document_lines", { p_document_id: stockDoc, p_lines: kept });
  assert.deepEqual(await levels(), {});
});

await check("the stock tables and the approved status cannot be written directly", async () => {
  const { data: variant } = await alice.supabase.from("document_lines").select("variant_id").eq("document_id", stockDoc).limit(1).single();
  const movement = await alice.supabase.from("stock_movements").insert({ business_id: shopA, warehouse_id: warehouseA.id, variant_id: variant.variant_id, kind: "adjustment", quantity: 5, reason: "x" });
  assert.ok(movement.error);
  const level = await alice.supabase.from("stock_levels").insert({ business_id: shopA, warehouse_id: warehouseA.id, variant_id: variant.variant_id, quantity: 5 });
  assert.ok(level.error);
  const status = await alice.supabase.from("documents").update({ status: "approved" }).eq("id", stockDoc).select();
  assert.ok(status.error);
  const stamped = await alice.supabase.from("documents").update({ status: "approved", approved_at: new Date().toISOString() }).eq("id", stockDoc).select();
  assert.ok(stamped.error);
});

await check("approval raises stock by exactly the approved quantities, once", async () => {
  const outsider = await bob.supabase.rpc("approve_document", { p_document_id: stockDoc });
  assert.match(outsider.error.message, /document_not_found/);
  const [first, second] = await Promise.all([
    carol.supabase.rpc("approve_document", { p_document_id: stockDoc }),
    alice.supabase.rpc("approve_document", { p_document_id: stockDoc }),
  ]);
  assert.ifError(first.error);
  assert.ifError(second.error);
  assert.deepEqual([first.data, second.data].sort(), [0, 4]);
  const third = await alice.supabase.rpc("approve_document", { p_document_id: stockDoc });
  assert.equal(third.data, 0);
  assert.deepEqual(await levels(), { "טבעת מלאי/6": 2, "טבעת מלאי/7": 1, "שעון מלאי/": 4 });
  const { data: movements } = await alice.supabase.from("stock_movements").select("quantity, kind").eq("document_id", stockDoc);
  assert.equal(movements.length, 4);
  assert.deepEqual(await levels(bob.supabase), {});
  const { data: hidden } = await bob.supabase.from("stock_movements").select("id").eq("business_id", shopA);
  assert.equal(hidden.length, 0);
});

await check("an approved document is frozen and cannot be deleted or approved twice under another upload", async () => {
  const lines = await alice.supabase.rpc("replace_document_lines", { p_document_id: stockDoc, p_lines: [] });
  assert.match(lines.error.message, /document_approved/);
  const header = await alice.supabase.from("documents").update({ doc_number: "S-2" }).eq("id", stockDoc).select();
  assert.match(header.error.message, /document_approved/);
  const reopened = await alice.supabase.from("documents").update({ status: "review" }).eq("id", stockDoc).select();
  assert.ok(reopened.error);
  const removed = await alice.supabase.from("documents").delete().eq("id", stockDoc).select();
  assert.ok(removed.error);
  const product = await alice.supabase.from("products").delete().eq("name", "שעון מלאי").eq("business_id", shopA).select();
  assert.ok(product.error);

  const copy = randomUUID();
  await alice.supabase.from("documents").insert({ id: copy, business_id: shopA, warehouse_id: warehouseA.id });
  await alice.supabase.from("documents").update({ status: "review", doc_number: "S-1", supplier_id: stockSupplier.id }).eq("id", copy);
  await alice.supabase.rpc("replace_document_lines", { p_document_id: copy, p_lines: [{ supplier_sku: "SW-1", quantity: 9 }] });
  const duplicate = await alice.supabase.rpc("approve_document", { p_document_id: copy });
  assert.match(duplicate.error.message, /duplicate_document/);
  assert.equal((await levels())["שעון מלאי/"], 4);
});

await check("only a manager adjusts stock, with a reason, and the adjustment is recorded", async () => {
  const { data: line } = await alice.supabase.from("document_lines").select("variant_id").eq("document_id", stockDoc).eq("supplier_sku", "SW-1").single();
  const args = { p_variant_id: line.variant_id, p_warehouse_id: warehouseA.id, p_delta: -1, p_reason: "ספירה" };
  assert.ok((await carol.supabase.rpc("adjust_stock", args)).error);
  assert.ok((await bob.supabase.rpc("adjust_stock", args)).error);
  assert.match((await alice.supabase.rpc("adjust_stock", { ...args, p_reason: " " })).error.message, /reason_required/);
  assert.ok((await alice.supabase.rpc("adjust_stock", { ...args, p_warehouse_id: warehouseB.id })).error);
  const done = await alice.supabase.rpc("adjust_stock", args);
  assert.ifError(done.error);
  assert.equal(done.data, 3);
  const { data: movements } = await alice.supabase.from("stock_movements").select("kind, quantity, reason").eq("variant_id", line.variant_id).eq("kind", "adjustment");
  assert.deepEqual(movements, [{ kind: "adjustment", quantity: -1, reason: "ספירה" }]);
});

// --- Export to the till ---------------------------------------------------------

await check("only a manager defines till departments, and other businesses never see them", async () => {
  const row = { business_id: shopA, code: "11", department: "תכשיטי כסף", sub_department: "טבעות" };
  assert.ok((await carol.supabase.from("pos_departments").insert(row)).error);
  assert.ok((await bob.supabase.from("pos_departments").insert(row)).error);
  assert.ifError((await alice.supabase.from("pos_departments").insert(row)).error);
  assert.ok((await alice.supabase.from("pos_departments").insert(row)).error, "duplicate code");
  const { data } = await bob.supabase.from("pos_departments").select("id").eq("business_id", shopA);
  assert.equal(data.length, 0);
});

await check("a till file gives each new item the next internal barcode and keeps it on the next export", async () => {
  const { data: department } = await alice.supabase.from("pos_departments").select("id").eq("business_id", shopA).single();
  const { data: lines } = await alice.supabase.from("document_lines").select("variant_id").eq("document_id", stockDoc).order("position");
  const variants = [...new Set(lines.map((l) => l.variant_id))];
  const rows = variants.map((variant_id) => ({ variant_id, item_name: "טבעת כסף", department_id: department.id, club_price: 29, sale_price: 32 }));
  const build = (supabase = alice.supabase, p_rows = rows) => supabase.rpc("create_pos_export", { p_document_id: stockDoc, p_rows });

  assert.match((await build()).error.message, /supplier_pos_missing/);
  await alice.supabase.from("suppliers").update({ pos_code: "12", pos_name: "נובה" }).eq("id", stockSupplier.id);
  assert.match((await build()).error.message, /barcode_rule_missing/);
  await alice.supabase.from("suppliers").update({ pos_next_barcode: "N0099" }).eq("id", stockSupplier.id);
  assert.match((await build(alice.supabase, rows.slice(1))).error.message, /rows_incomplete/);
  assert.match((await build(bob.supabase)).error.message, /document_not_found/);
  // A department of another business does not count.
  const { data: foreign } = await bob.supabase.from("pos_departments").insert({ business_id: shopB, code: "1", department: "x", sub_department: "y" }).select("id").single();
  assert.match((await build(alice.supabase, rows.map((r) => ({ ...r, department_id: foreign.id })))).error.message, /rows_incomplete/);

  const first = await build(carol.supabase);
  assert.ifError(first.error);
  const { data: exported } = await alice.supabase.from("pos_exports").select("rows, row_count, sheet_name, confirmed_at").eq("id", first.data).single();
  assert.equal(exported.sheet_name, "פריטי נובה");
  assert.deepEqual(exported.rows.map((r) => [r.barcode, r.quantity, r.cost, r.supplier_code, r.department_code]), [
    ["N0099", 2, 10, "12", "11"], ["N0100", 1, 10, "12", "11"], ["N0101", 4, 50, "12", "11"],
  ]);
  const { data: supplier } = await alice.supabase.from("suppliers").select("pos_next_barcode").eq("id", stockSupplier.id).single();
  assert.equal(supplier.pos_next_barcode, "N0102");

  const second = await build();
  const { data: again } = await alice.supabase.from("pos_exports").select("rows").eq("id", second.data).single();
  assert.deepEqual(again.rows.map((r) => r.barcode), ["N0099", "N0100", "N0101"]);
  assert.equal((await levels())["שעון מלאי/"], 3, "exporting does not touch stock");

  const { data: hidden } = await bob.supabase.from("pos_exports").select("id").eq("business_id", shopA);
  assert.equal(hidden.length, 0);
  assert.ok((await alice.supabase.from("pos_exports").update({ confirmed_at: new Date().toISOString() }).eq("id", first.data).select()).error);
  assert.ok((await alice.supabase.from("pos_exports").insert({ business_id: shopA, document_id: stockDoc, template: "x", sheet_name: "x", rows: [], row_count: 0 })).error);
  assert.ok((await bob.supabase.rpc("confirm_pos_export", { p_export_id: first.data })).error);
  assert.ifError((await alice.supabase.rpc("confirm_pos_export", { p_export_id: first.data })).error);
  const { data: confirmed } = await alice.supabase.from("pos_exports").select("confirmed_at").eq("id", first.data).single();
  assert.ok(confirmed.confirmed_at);

  // The till rejected a file: any member reports it with a note; nobody else can.
  const report = (supabase, id, p_note) => supabase.rpc("report_pos_export_problem", { p_export_id: id, p_note });
  assert.match((await report(bob.supabase, second.data, "x")).error.message, /export_not_found/);
  assert.match((await report(alice.supabase, second.data, "  ")).error.message, /note_required/);
  assert.match((await report(alice.supabase, first.data, "x")).error.message, /already_confirmed/);
  assert.ifError((await report(carol.supabase, second.data, " שגיאה בשורה 2 ")).error);
  const { data: failed } = await alice.supabase.from("pos_exports").select("problem_note, problem_at, problem_by, confirmed_at").eq("id", second.data).single();
  assert.equal(failed.problem_note, "שגיאה בשורה 2");
  assert.equal(failed.problem_by, carol.id);
  assert.ok(failed.problem_at && !failed.confirmed_at);
  assert.ok((await alice.supabase.from("pos_exports").update({ problem_note: null }).eq("id", second.data).select()).error);
  // A retry that worked: the file is confirmed and the earlier problem stays on record.
  assert.ifError((await alice.supabase.rpc("confirm_pos_export", { p_export_id: second.data })).error);
  const { data: retried } = await alice.supabase.from("pos_exports").select("problem_note, confirmed_at").eq("id", second.data).single();
  assert.ok(retried.confirmed_at && retried.problem_note);
  assert.equal((await levels())["שעון מלאי/"], 3, "till status does not touch stock");
});

await check("a sales report lowers stock once, keeps unknown codes aside, and is never counted twice", async () => {
  const { data: warehouse } = await alice.supabase.from("warehouses").select("id").eq("business_id", shopA).eq("is_default", true).single();
  const { data: created } = await alice.supabase.rpc("create_product", {
    p_business_id: shopA, p_name: "צמיד מכירות",
    p_variants: [{ label: "", codes: [{ kind: "pos", code: "S0001" }, { kind: "barcode", code: "0077001" }] }],
  });
  const { data: variant } = await alice.supabase.from("product_variants").select("id").eq("product_id", created).single();
  assert.ifError((await alice.supabase.rpc("adjust_stock", { p_variant_id: variant.id, p_warehouse_id: warehouse.id, p_delta: 10, p_reason: "פתיחה" })).error);
  const level = async () => (await alice.supabase.from("stock_levels").select("quantity").eq("variant_id", variant.id).single()).data.quantity;
  const sha = (n) => String(n).repeat(64).slice(0, 64);
  const bring = (supabase, n, p_rows, p_report_date) => supabase.rpc("import_sales", { p_warehouse_id: warehouse.id, p_file_name: `sales-${n}.xls`, p_fingerprint: sha(n), p_rows, ...(p_report_date ? { p_report_date } : {}) });
  const row = (code, quantity, transaction_ref = null) => ({ code, quantity, transaction_ref, sold_at: "2026-11-20T10:00:00Z", unit_price: 99 });

  assert.match((await bring(bob.supabase, 1, [row("S0001", 1, "T1")])).error.message, /warehouse_not_found/);
  assert.match((await bring(alice.supabase, 1, [])).error.message, /no_rows/);
  assert.match((await bring(alice.supabase, 1, [row("S0001", 0, "T1")])).error.message, /bad_row/);
  assert.equal(await level(), 10, "a rejected report changes nothing");

  // The till code in lower case, the same item twice in one transaction, a return, the
  // supplier barcode, and a code the catalog does not know.
  const first = await bring(carol.supabase, 1, [
    row("s0001", 2, "T1"), row("S0001", 1, "T1"), row("S0001", -1, "T2"), row("0077001", 1, "T3"), row("UNKNOWN-9", 4, "T3"),
  ]);
  assert.ifError(first.error);
  assert.equal(await level(), 7);
  const { data: movements } = await alice.supabase.from("stock_movements").select("kind, quantity").eq("variant_id", variant.id).not("sales_line_id", "is", null).order("quantity");
  assert.deepEqual(movements.map((m) => [m.kind, m.quantity]), [["sale", -2], ["sale", -1], ["sale", -1], ["return", 1]]);

  // The same file again, and an overlapping report with one new sale.
  assert.match((await bring(alice.supabase, 1, [row("S0001", 2, "T1")])).error.message, /already_imported/);
  const second = await bring(alice.supabase, 2, [row("S0001", 2, "T1"), row("S0001", 1, "T1"), row("S0001", 3, "T4")]);
  assert.ifError(second.error);
  assert.equal(await level(), 4);
  const { data: overlap } = await alice.supabase.from("sales_imports").select("row_count, skipped_count").eq("id", second.data).single();
  assert.deepEqual(overlap, { row_count: 3, skipped_count: 2 });

  // The unknown code waits; once it is in the catalog a rematch applies it, once.
  const { data: waiting } = await alice.supabase.from("sales_lines").select("code, applied_at, variant_id").eq("business_id", shopA).is("applied_at", null);
  assert.deepEqual(waiting.map((l) => [l.code, l.variant_id]), [["UNKNOWN-9", null]]);
  assert.equal((await alice.supabase.rpc("rematch_sales_lines", { p_business_id: shopA })).data, 0);
  assert.ifError((await alice.supabase.from("variant_codes").insert({ business_id: shopA, variant_id: variant.id, kind: "barcode", code: "unknown-9" })).error);
  assert.ok((await bob.supabase.rpc("rematch_sales_lines", { p_business_id: shopA })).error);
  assert.equal((await alice.supabase.rpc("rematch_sales_lines", { p_business_id: shopA })).data, 1);
  assert.equal((await alice.supabase.rpc("rematch_sales_lines", { p_business_id: shopA })).data, 0);
  assert.equal(await level(), 0);

  // A daily summary as the till writes it: no dates, no transaction numbers, and a line
  // that is not stock. One report per day; a wrong one is cancelled and stock comes back.
  const summary = (code, quantity, item_name) => ({ code, quantity, item_name, transaction_ref: null, sold_at: null, unit_price: null });
  const day = await bring(alice.supabase, 3, [summary("S0001", 2, "צמיד"), summary("1", 106, "פריט כללי")], "2026-11-24");
  assert.ifError(day.error);
  assert.equal(await level(), -2);
  const { data: dated } = await alice.supabase.from("sales_lines").select("sold_at, item_name").eq("import_id", day.data).eq("code", "S0001").single();
  assert.equal(dated.sold_at.slice(0, 10), "2026-11-24");
  assert.equal(dated.item_name, "צמיד");
  assert.match((await bring(alice.supabase, 4, [summary("S0001", 5, "צמיד")], "2026-11-24")).error.message, /date_already_imported/);
  assert.match((await bring(alice.supabase, 4, [summary("S0001", 5, "צמיד")], "2999-01-01")).error.message, /future_date/);

  assert.ok((await bob.supabase.rpc("ignore_sales_code", { p_business_id: shopA, p_code: "1" })).error);
  assert.ifError((await carol.supabase.rpc("ignore_sales_code", { p_business_id: shopA, p_code: "1" })).error);
  const { data: ignored } = await alice.supabase.from("sales_ignored_codes").select("code_norm, item_name").eq("business_id", shopA);
  assert.deepEqual(ignored, [{ code_norm: "1", item_name: "פריט כללי" }]);
  assert.equal((await alice.supabase.from("sales_lines").select("id").eq("business_id", shopA).is("applied_at", null)).data.length, 0);

  assert.match((await carol.supabase.rpc("revert_sales_import", { p_import_id: day.data })).error.message, /forbidden/);
  assert.ok((await bob.supabase.rpc("revert_sales_import", { p_import_id: day.data })).error);
  assert.equal((await alice.supabase.rpc("revert_sales_import", { p_import_id: day.data })).data, 1);
  assert.equal((await alice.supabase.rpc("revert_sales_import", { p_import_id: day.data })).data, 0);
  assert.equal(await level(), 0, "cancelling puts the stock back, once");
  // The corrected report for the same day goes in, and the ignored code is skipped.
  const fixed = await bring(alice.supabase, 4, [summary("S0001", 5, "צמיד"), summary("1", 106, "פריט כללי")], "2026-11-24");
  assert.ifError(fixed.error);
  assert.equal(await level(), -5);
  const { data: counts } = await alice.supabase.from("sales_imports").select("row_count, ignored_count").eq("id", fixed.data).single();
  assert.deepEqual(counts, { row_count: 2, ignored_count: 1 });
  assert.ok((await alice.supabase.from("sales_ignored_codes").delete().eq("business_id", shopA).select()).error);
  assert.equal((await bob.supabase.from("sales_ignored_codes").select("code").eq("business_id", shopA)).data.length, 0);

  // Read-only for members, invisible to other businesses.
  assert.equal((await bob.supabase.from("sales_lines").select("id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await bob.supabase.from("sales_imports").select("id").eq("business_id", shopA)).data.length, 0);
  assert.ok((await alice.supabase.from("sales_lines").update({ quantity: 1 }).eq("business_id", shopA).select()).error);
  assert.ok((await alice.supabase.from("sales_imports").delete().eq("id", first.data).select()).error);
  assert.ok((await alice.supabase.from("stock_movements").insert({ business_id: shopA, warehouse_id: warehouse.id, variant_id: variant.id, kind: "sale", quantity: -1 })).error);
});

await check("shortages and the sales report: thresholds, states, dates, and nothing from another business", async () => {
  const { data: warehouse } = await alice.supabase.from("warehouses").select("id").eq("business_id", shopA).eq("is_default", true).single();
  const { data: supplier } = await alice.supabase.from("suppliers").insert({ business_id: shopA, name: `ספק דוחות ${run}` }).select("id").single();
  const item = async (name, code, opening) => {
    const { data: productId } = await alice.supabase.rpc("create_product", { p_business_id: shopA, p_name: name, p_supplier_id: supplier.id, p_variants: [{ label: "", codes: [{ kind: "pos", code }] }] });
    const { data: variant } = await alice.supabase.from("product_variants").select("id").eq("product_id", productId).single();
    if (opening) assert.ifError((await alice.supabase.rpc("adjust_stock", { p_variant_id: variant.id, p_warehouse_id: warehouse.id, p_delta: opening, p_reason: "פתיחה" })).error);
    return variant.id;
  };
  const plenty = await item("דוח: הרבה", "RP-1", 10);
  const few = await item("דוח: מעט", "RP-2", 3);
  const gone = await item("דוח: אזל", "RP-3", 2);
  const minus = await item("דוח: מינוס", "RP-4", 1);
  await item("דוח: בלי תנועות", "RP-5", 0);
  const overview = async (supabase = alice.supabase) => {
    const { data, error } = await supabase.rpc("stock_overview", { p_business_id: shopA }).like("product_name", "דוח:%");
    assert.ifError(error);
    return Object.fromEntries(data.map((r) => [r.product_name.slice(5), [r.state, r.quantity, r.threshold, r.own_threshold]]));
  };

  // Sales on two days; the second day also has a return.
  const sale = (code, quantity) => ({ code, quantity, item_name: null, transaction_ref: null, sold_at: null, unit_price: 100 });
  const bring = (n, rows, date) => alice.supabase.rpc("import_sales", { p_warehouse_id: warehouse.id, p_file_name: `report-${n}.xls`, p_fingerprint: String(n).repeat(64).slice(0, 64), p_rows: rows, p_report_date: date });
  const { data: branch } = await alice.supabase.from("warehouses").insert({ business_id: shopA, name: `מחסן דוחות ${run}` }).select("id").single();
  assert.ok(branch);
  const dayOne = await bring(7, [sale("RP-3", 2), sale("RP-4", 3), sale("RP-1", 1)], "2026-11-10");
  assert.ifError(dayOne.error);
  assert.ifError((await bring(8, [sale("RP-1", 2), sale("RP-1", -1)], "2026-11-12")).error);

  assert.deepEqual(await overview(), {
    "הרבה": ["ok", 8, null, false], "מעט": ["ok", 3, null, false], "אזל": ["out", 0, null, false], "מינוס": ["negative", -2, null, false],
  }, "no threshold: only empty and negative items stand out; an item without history is not listed");

  // The business default is the owner's; an item's own threshold is any member's.
  assert.equal((await carol.supabase.from("businesses").update({ low_stock_default: 3 }).eq("id", shopA).select()).data.length, 0);
  assert.ok((await alice.supabase.from("businesses").update({ low_stock_default: -1 }).eq("id", shopA).select()).error);
  assert.equal((await alice.supabase.from("businesses").update({ low_stock_default: 3 }).eq("id", shopA).select()).data.length, 1);
  assert.deepEqual((await overview())["מעט"], ["low", 3, 3, false]);
  assert.equal((await carol.supabase.from("product_variants").update({ low_stock_threshold: 9 }).eq("id", plenty).select()).data.length, 1);
  assert.equal((await bob.supabase.from("product_variants").update({ low_stock_threshold: 0 }).eq("id", plenty).select()).data.length, 0);
  assert.equal((await alice.supabase.from("product_variants").update({ low_stock_threshold: 1 }).eq("id", few).select()).data.length, 1);
  assert.deepEqual(await overview(), {
    "הרבה": ["low", 8, 9, true], "מעט": ["ok", 3, 1, true], "אזל": ["out", 0, 3, false], "מינוס": ["negative", -2, 3, false],
  });
  assert.equal((await bob.supabase.rpc("stock_overview", { p_business_id: shopA })).data.length, 0);
  await alice.supabase.from("businesses").update({ low_stock_default: null }).eq("id", shopA);

  const report = async (from, to, supabase = alice.supabase) => {
    const { data, error } = await supabase.rpc("sales_report", { p_business_id: shopA, p_from: from, p_to: to }).like("product_name", "דוח:%");
    assert.ifError(error);
    return Object.fromEntries(data.map((r) => [r.product_name.slice(5), [r.units_sold, r.units_returned, r.amount, r.supplier_id === supplier.id]]));
  };
  assert.deepEqual(await report("2026-11-10", "2026-11-12"), { "הרבה": [3, 1, 200, true], "אזל": [2, 0, 200, true], "מינוס": [3, 0, 300, true] });
  assert.deepEqual(await report("2026-11-11", "2026-11-12"), { "הרבה": [2, 1, 100, true] });
  assert.deepEqual(await report("2026-11-13", "2026-11-30"), {});
  assert.deepEqual(await report("2026-11-10", "2026-11-12", bob.supabase), {});
  // A cancelled import leaves the report, and its stock comes back.
  assert.equal((await alice.supabase.rpc("revert_sales_import", { p_import_id: dayOne.data })).data, 3);
  assert.deepEqual(await report("2026-11-10", "2026-11-12"), { "הרבה": [2, 1, 100, true] });
  assert.deepEqual([(await overview())["אזל"][0], (await overview())["מינוס"][0]], ["ok", "ok"]);
  assert.ok(gone && minus);
});

await check("accounting: money is for owner and manager only, and never crosses businesses", async () => {
  const expense = { business_id: shopA, expense_date: "2026-11-10", vendor: "חברת החשמל", category: "utilities", amount_net: 100, vat_amount: 18 };
  // Carol is staff in shop A; Bob is a stranger.
  assert.ok((await carol.supabase.from("expenses").insert(expense)).error);
  assert.ok((await bob.supabase.from("expenses").insert(expense)).error);
  const { data: created, error } = await alice.supabase.from("expenses").insert(expense).select("id").single();
  assert.ifError(error);
  assert.equal((await carol.supabase.from("expenses").select("id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await bob.supabase.from("expenses").select("id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await carol.supabase.from("expenses").update({ paid_at: "2026-11-11" }).eq("id", created.id).select()).data.length, 0);
  assert.equal((await bob.supabase.from("expenses").delete().eq("id", created.id).select()).data.length, 0);
  assert.ok((await alice.supabase.from("expenses").insert({ ...expense, amount_net: -5 })).error, "negative amount");
  assert.ok((await alice.supabase.from("expenses").insert({ ...expense, category: "bribes" })).error, "unknown category");
  assert.ok((await alice.supabase.from("expenses").update({ business_id: shopB }).eq("id", created.id)).error, "cannot move to another business");

  // The approved receipt shows up as a purchase, with the cost of its lines.
  const { data: purchases } = await alice.supabase.from("accounting_purchases").select("document_id, lines_net").eq("business_id", shopA);
  const purchase = purchases.find((row) => row.document_id === stockDoc);
  assert.ok(purchase, "approved document is listed");
  const { data: lines } = await alice.supabase.from("document_lines").select("quantity, unit_cost").eq("document_id", stockDoc);
  const expected = Math.round(lines.reduce((sum, line) => sum + line.quantity * (line.unit_cost ?? 0), 0) * 100) / 100;
  assert.equal(purchase.lines_net, expected);
  assert.equal((await bob.supabase.from("accounting_purchases").select("document_id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await anon.from("accounting_purchases").select("document_id")).data?.length ?? 0, 0);

  // Payment marks: managers of the document's own business only.
  const payment = { document_id: stockDoc, business_id: shopA, paid_at: "2026-11-20" };
  assert.ok((await carol.supabase.from("document_payments").insert(payment)).error);
  assert.ok((await bob.supabase.from("document_payments").insert({ ...payment, business_id: shopB })).error, "document of another business");
  assert.ifError((await alice.supabase.from("document_payments").insert(payment)).error);
  assert.equal((await carol.supabase.from("document_payments").select("document_id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await alice.supabase.from("document_payments").update({ paid_at: null }).eq("document_id", stockDoc).select()).data.length, 1);
  assert.ifError((await alice.supabase.from("expenses").delete().eq("id", created.id)).error);
});

await check("campaigns: members plan and post, only managers delete, other businesses see nothing", async () => {
  const campaign = { business_id: shopA, name: "חנוכה", starts_on: "2026-12-01", ends_on: "2026-12-10" };
  assert.ok((await bob.supabase.from("campaigns").insert(campaign)).error);
  assert.ok((await alice.supabase.from("campaigns").insert({ ...campaign, ends_on: "2026-11-01" })).error, "ends before it starts");
  const { data: created, error } = await carol.supabase.from("campaigns").insert(campaign).select("id").single();
  assert.ifError(error);

  const post = { business_id: shopA, campaign_id: created.id, channel: "instagram", body: "קולקציה חדשה" };
  assert.ok((await bob.supabase.from("campaign_posts").insert(post)).error);
  assert.ok((await bob.supabase.from("campaign_posts").insert({ ...post, business_id: shopB })).error, "campaign of another business");
  assert.ok((await carol.supabase.from("campaign_posts").insert({ ...post, channel: "fax" })).error, "unknown channel");
  assert.ok((await carol.supabase.from("campaign_posts").insert({ ...post, published_url: "https://example.test/p" })).error, "a link without publishing");
  const { data: saved, error: postError } = await carol.supabase.from("campaign_posts").insert(post).select("id").single();
  assert.ifError(postError);
  assert.equal((await carol.supabase.from("campaign_posts").update({ published_at: new Date().toISOString() }).eq("id", saved.id).select()).data.length, 1);

  assert.equal((await bob.supabase.from("campaigns").select("id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await bob.supabase.from("campaign_posts").select("id").eq("business_id", shopA)).data.length, 0);
  assert.equal((await bob.supabase.from("campaign_posts").update({ body: "pwned" }).eq("id", saved.id).select()).data.length, 0);
  assert.equal((await carol.supabase.from("campaigns").delete().eq("id", created.id).select()).data.length, 0, "staff cannot delete a campaign");
  assert.equal((await alice.supabase.from("campaigns").delete().eq("id", created.id).select()).data.length, 1);
  assert.equal((await alice.supabase.from("campaign_posts").select("id").eq("id", saved.id)).data.length, 0, "posts go with the campaign");
});

await check("a removed member loses access immediately", async () => {
  const { data: removed } = await alice.supabase.from("business_members").delete().eq("business_id", shopA).eq("user_id", carol.id).select();
  assert.equal(removed.length, 1);
  const { data } = await carol.supabase.from("businesses").select("id");
  assert.equal(data.length, 0);
});

console.log(`\n${passed} checks passed`);
