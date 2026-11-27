// Checks the WooCommerce reader against a local stand-in for the store's REST API,
// and the stock bookkeeping against the local Supabase stack.
// Usage: npm run test:woo   (requires `npx supabase start`)
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

process.env.WOOCOMMERCE_ALLOW_LOCAL = "1";
const { checkConnection, normalizeStoreUrl, readOrderLines, WooError } = await import("../src/lib/woocommerce.ts");

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] ??= match[2];
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
assert.ok(url.includes("127.0.0.1") || url.includes("localhost"), "refusing to run against a non-local database");

let passed = 0;
async function check(name: string, fn: () => Promise<void>) {
  await fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

// --- The stand-in store ------------------------------------------------------

const KEY = "ck_" + "a".repeat(40);
const SECRET = "cs_" + "b".repeat(40);
type Item = { id: number; name: string; product_id: number; variation_id: number; quantity: number; sku: string; price: number; meta_data?: { key: string; value: unknown }[] };
type Order = { id: number; status: string; date_created_gmt: string; date_modified_gmt: string; line_items: Item[]; refunds: { id: number }[] };
const store: { orders: Order[]; refunds: Record<number, { id: number; line_items: Item[] }[]>; requests: string[] } = { orders: [], refunds: {}, requests: [] };
const item = (id: number, sku: string, quantity: number, product_id = id): Item => ({ id, name: `פריט ${sku}`, product_id, variation_id: 0, quantity, sku, price: 100 });

const server = createServer((request, response) => {
  const target = new URL(request.url!, "http://x");
  store.requests.push(`${request.method} ${target.pathname}`);
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.headers.authorization !== `Basic ${Buffer.from(`${KEY}:${SECRET}`).toString("base64")}`) {
    return send(401, { code: "woocommerce_rest_cannot_view" });
  }
  const refund = target.pathname.match(/^\/wp-json\/wc\/v3\/orders\/(\d+)\/refunds$/);
  if (refund) {
    return send(200, store.refunds[Number(refund[1])] ?? []);
  }
  if (target.pathname === "/wp-json/wc/v3/orders") {
    const after = new Date(`${target.searchParams.get("modified_after") ?? "1970-01-01T00:00:00"}Z`);
    const perPage = Number(target.searchParams.get("per_page") ?? 10);
    const page = Number(target.searchParams.get("page") ?? 1);
    const all = store.orders.filter((order) => new Date(`${order.date_modified_gmt}Z`) > after).sort((a, b) => a.id - b.id);
    return send(200, all.slice((page - 1) * perPage, page * perPage));
  }
  send(404, { code: "rest_no_route" });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const storeUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const credentials = { storeUrl, key: KEY, secret: SECRET };

// --- A business with two catalog items --------------------------------------

const run = Date.now();
const supabase = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const staffClient = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
const outsider = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { auth: { persistSession: false } });
for (const [client, label] of [[supabase, "owner"], [staffClient, "staff"], [outsider, "outsider"]] as const) {
  assert.ifError((await client.auth.signUp({ email: `woo-${label}-${run}@example.test`, password: "correct-horse-battery" })).error);
}
const { data: business } = await supabase.rpc("create_business", { p_name: "חנות אתר" });
await outsider.rpc("create_business", { p_name: "חנות אחרת" });
assert.ifError((await supabase.rpc("add_member_by_email", { p_business_id: business, p_email: `woo-staff-${run}@example.test`, p_role: "staff" })).error);
const { data: warehouse } = await supabase.from("warehouses").select("id").eq("business_id", business).single();
const product = async (name: string, codes: { kind: string; code: string }[]) => {
  const { data, error } = await supabase.rpc("create_product", { p_business_id: business, p_name: name, p_variants: [{ label: "", codes }] });
  assert.ifError(error);
  const { data: variant } = await supabase.from("product_variants").select("id").eq("product_id", data).single();
  assert.ifError((await supabase.rpc("adjust_stock", { p_variant_id: variant!.id, p_warehouse_id: warehouse!.id, p_delta: 10, p_reason: "פתיחה" })).error);
  return variant!.id as string;
};
const ring = await product("טבעת", [{ kind: "pos", code: "N12000229" }]);
const chain = await product("שרשרת", [{ kind: "web", code: "#77" }]);
const level = async (variant: string) => (await supabase.from("stock_levels").select("quantity").eq("variant_id", variant).single()).data!.quantity;

const FROM = new Date("2026-11-20T00:00:00Z");
const sync = async (modifiedAfter = FROM) => {
  const { lines, orders } = await readOrderLines(credentials, modifiedAfter, FROM);
  const { data, error } = await supabase.rpc("record_web_sync", { p_business_id: business, p_lines: lines, p_synced_until: new Date().toISOString(), p_orders: orders });
  assert.ifError(error);
  return { changed: data as number, lines, orders };
};

// --- Checks -----------------------------------------------------------------

await check("the store address must be a public https site", async () => {
  delete process.env.WOOCOMMERCE_ALLOW_LOCAL;
  assert.equal(normalizeStoreUrl("example-jewelry.co.il/"), "https://example-jewelry.co.il");
  assert.equal(normalizeStoreUrl("https://www.example.co.il/shop?x=1"), "https://www.example.co.il");
  for (const bad of ["http://example.co.il", "https://127.0.0.1", "https://localhost", "https://10.0.0.5", "https://intranet", "https://example.co.il:8443", "https://user:pw@example.co.il", "https://[::1]", "not a url"]) {
    assert.equal(normalizeStoreUrl(bad), null, bad);
  }
  process.env.WOOCOMMERCE_ALLOW_LOCAL = "1";
});

await check("a wrong key, a missing API and a redirect are told apart", async () => {
  await checkConnection(credentials);
  await assert.rejects(checkConnection({ ...credentials, secret: "cs_wrong" }), (error) => error instanceof WooError && error.kind === "auth");
  const other = createServer((_, response) => { response.writeHead(301, { location: "https://elsewhere.example/" }); response.end(); });
  await new Promise<void>((resolve) => other.listen(0, "127.0.0.1", resolve));
  await assert.rejects(checkConnection({ ...credentials, storeUrl: `http://127.0.0.1:${(other.address() as { port: number }).port}` }), (error) => error instanceof WooError && error.kind === "redirect");
  other.close();
  await assert.rejects(checkConnection({ ...credentials, storeUrl: "http://127.0.0.1:9" }), (error) => error instanceof WooError && error.kind === "unreachable");
});

await check("only an owner or manager stores, reads or uses the key, and the row never shows it", async () => {
  const save = (client: typeof supabase) => client.rpc("save_web_connection", { p_business_id: business, p_store_url: storeUrl, p_consumer_key: KEY, p_consumer_secret: SECRET, p_warehouse_id: warehouse!.id, p_sync_from: FROM.toISOString() });
  assert.equal((await save(staffClient)).error?.code, "42501");
  assert.equal((await save(outsider)).error?.code, "42501");
  assert.ifError((await save(supabase)).error);
  assert.equal((await staffClient.rpc("get_web_credentials", { p_business_id: business })).error?.code, "42501");
  assert.equal((await outsider.rpc("get_web_credentials", { p_business_id: business })).error?.code, "42501");
  assert.equal((await staffClient.rpc("record_web_sync", { p_business_id: business, p_lines: [], p_synced_until: new Date().toISOString(), p_orders: 0 })).error?.code, "42501");
  const { data: stored } = await supabase.rpc("get_web_credentials", { p_business_id: business });
  assert.deepEqual([stored![0].consumer_key, stored![0].consumer_secret, stored![0].store_url], [KEY, SECRET, storeUrl]);
  // Members see the connection, not the pointer to the secret, and nobody outside sees anything.
  const { data: row } = await staffClient.from("web_connections").select("store_url, key_hint").eq("business_id", business).single();
  assert.deepEqual(row, { store_url: storeUrl, key_hint: "aaaa" });
  assert.ok((await staffClient.from("web_connections").select("secret_id").eq("business_id", business)).error);
  assert.equal((await outsider.from("web_connections").select("store_url").eq("business_id", business)).data!.length, 0);
  assert.ok((await supabase.from("web_connections").update({ store_url: "https://evil.example" }).eq("business_id", business).select()).error);
});

await check("orders lower stock once; an order from before the start date never does", async () => {
  store.orders = [
    { id: 90, status: "completed", date_created_gmt: "2026-11-01T10:00:00", date_modified_gmt: "2026-11-21T10:00:00", line_items: [item(900, "N12000229", 5)], refunds: [] },
    { id: 101, status: "processing", date_created_gmt: "2026-11-21T09:00:00", date_modified_gmt: "2026-11-21T09:00:00", line_items: [item(1, "n12000229", 2), item(2, "", 1, 77), item(3, "GIFT-WRAP", 1)], refunds: [] },
    { id: 102, status: "pending", date_created_gmt: "2026-11-21T09:30:00", date_modified_gmt: "2026-11-21T09:30:00", line_items: [item(4, "N12000229", 3)], refunds: [] },
  ];
  const first = await sync();
  assert.equal(first.orders, 2);
  assert.equal(first.changed, 3);
  assert.deepEqual([await level(ring), await level(chain)], [8, 9]);
  const again = await sync();
  assert.equal(again.changed, 0);
  assert.deepEqual([await level(ring), await level(chain)], [8, 9]);
  assert.ok(store.requests.every((request) => request.startsWith("GET ")), "the reader only ever reads");
});

await check("payment, a partial refund, a cancellation and a restored order each move stock by the difference", async () => {
  // The unpaid order is paid.
  store.orders[2].status = "processing";
  assert.equal((await sync()).changed, 1);
  assert.equal(await level(ring), 5);
  // One of the two rings of order 101 is refunded; the refund points at the line.
  store.orders[1].refunds = [{ id: 501 }];
  store.refunds[101] = [{ id: 501, line_items: [{ ...item(9001, "N12000229", -1), meta_data: [{ key: "_refunded_item_id", value: "1" }] }] }];
  assert.equal((await sync()).changed, 1);
  assert.equal(await level(ring), 6);
  // Order 102 is cancelled: its three rings come back.
  store.orders[2].status = "cancelled";
  assert.equal((await sync()).changed, 1);
  assert.equal(await level(ring), 9);
  // ...and restored.
  store.orders[2].status = "completed";
  assert.equal((await sync()).changed, 1);
  assert.equal(await level(ring), 6);
  // Order 101 is fully refunded by status alone, with no refund lines.
  store.orders[1].status = "refunded";
  // Three lines change: the ring, the chain, and the gift wrap that is not in the catalog.
  assert.equal((await sync()).changed, 3);
  assert.deepEqual([await level(ring), await level(chain)], [7, 10]);
  assert.equal((await sync()).changed, 0);
  const { data: movements } = await supabase.from("stock_movements").select("quantity").eq("variant_id", ring).not("sales_line_id", "is", null);
  assert.equal(movements!.reduce((sum, m) => sum + m.quantity, 0), -3);
});

await check("an unknown SKU waits for handling and can be marked as not stock", async () => {
  store.orders[1].status = "completed";
  await sync();
  const { data: waiting } = await supabase.from("sales_lines").select("code, quantity, item_name").eq("business_id", business).is("applied_at", null);
  assert.deepEqual([...new Set(waiting!.map((line) => line.code))], ["GIFT-WRAP"]);
  assert.equal(waiting!.reduce((sum, line) => sum + line.quantity, 0), 1, "sold, refunded, sold again: one unit waits");
  assert.ifError((await supabase.rpc("ignore_sales_code", { p_business_id: business, p_code: "gift-wrap" })).error);
  assert.equal((await sync()).changed, 0, "an ignored code is not brought back");
  const { data: imports } = await supabase.from("sales_imports").select("source, file_name").eq("business_id", business);
  assert.ok(imports!.length > 0 && imports!.every((entry) => entry.source === "woocommerce"));
});

await check("many orders are read page by page, and a sync only asks for what changed", async () => {
  store.orders = Array.from({ length: 230 }, (_, index) => ({
    id: 1000 + index, status: "completed", date_created_gmt: "2026-11-22T10:00:00", date_modified_gmt: "2026-11-22T10:00:00", line_items: [item(5000 + index, "#77", 0.5, 77)], refunds: [],
  }));
  store.orders[0].line_items = [item(5000, "", 1, 77)];
  const { lines, orders } = await readOrderLines(credentials, FROM, FROM);
  assert.equal(orders, 230);
  assert.equal(lines.length, 230);
  assert.equal(lines[0].code, "#77");
  const later = await readOrderLines(credentials, new Date("2026-11-23T00:00:00Z"), FROM);
  assert.equal(later.orders, 0);
});

await check("a failed sync is recorded, and disconnecting deletes the key", async () => {
  assert.ifError((await supabase.rpc("record_web_sync_error", { p_business_id: business, p_error: "האתר לא ענה" })).error);
  const { data: failed } = await supabase.from("web_connections").select("last_error, last_ok_at").eq("business_id", business).single();
  assert.equal(failed!.last_error, "האתר לא ענה");
  assert.ok(failed!.last_ok_at);
  assert.equal((await staffClient.rpc("delete_web_connection", { p_business_id: business })).error?.code, "42501");
  assert.ifError((await supabase.rpc("delete_web_connection", { p_business_id: business })).error);
  assert.equal((await supabase.rpc("get_web_credentials", { p_business_id: business })).data!.length, 0);
  assert.equal((await supabase.from("web_connections").select("store_url").eq("business_id", business)).data!.length, 0);
});

server.close();
console.log(`\n${passed} checks passed`);
