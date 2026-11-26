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

await check("a removed member loses access immediately", async () => {
  const { data: removed } = await alice.supabase.from("business_members").delete().eq("business_id", shopA).eq("user_id", carol.id).select();
  assert.equal(removed.length, 1);
  const { data } = await carol.supabase.from("businesses").select("id");
  assert.equal(data.length, 0);
});

console.log(`\n${passed} checks passed`);
