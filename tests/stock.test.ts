import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, describe, test } from "node:test";
import { effectivePrices } from "../src/lib/pricing.ts";
import { createTestDb } from "./helpers/db.ts";

type Env = Awaited<ReturnType<typeof createTestDb>>;
type User = Awaited<ReturnType<Env["createUser"]>>;

let env: Env;
let alice: User; // owner of shop A
let carol: User; // staff in shop A
let bob: User; // owner of shop B
let shopA: string;
let shopB: string;

const warehouseOf = (user: User, business: string) =>
  user.value<string>("select id from warehouses where business_id = $1 and is_default", [business]);

async function newSupplier(user: User, business: string, posCode: string | null = null) {
  return user.value<string>(
    "insert into suppliers (business_id, name, pos_code, pos_name) values ($1, $2, $3, $4) returning id",
    [business, `ספק ${randomUUID()}`, posCode, posCode ? "נובה" : null],
  );
}

type Line = Record<string, unknown>;

/** A document in review with the given lines. */
async function newDocument(user: User, business: string, supplier: string | null, lines: Line[]) {
  const id = randomUUID();
  await user.query(
    "insert into documents (id, business_id, warehouse_id, supplier_id) values ($1, $2, $3, $4)",
    [id, business, await warehouseOf(user, business), supplier],
  );
  await user.query("update documents set status = 'review' where id = $1", [id]);
  await user.query("select replace_document_lines($1, $2::jsonb)", [id, JSON.stringify(lines)]);
  return id;
}

const linesOf = (user: User, document: string) =>
  user.query<{
    id: string; variant_id: string | null; match_method: string | null; sale_price: string | null;
    club_price: string | null; product_type: string | null; guessed_type: string | null;
  }>("select * from document_lines where document_id = $1 order by position", [document]);

/** Creates a catalog item for every line that still has none. */
async function createMissingItems(user: User, document: string) {
  for (;;) {
    const line = (await linesOf(user, document)).find((l) => !l.variant_id);
    if (!line) return;
    await user.query("select create_item_for_line($1, null, $2, '', null, 'silver')", [line.id, `פריט ${randomUUID()}`]);
  }
}

const approve = (user: User, document: string) =>
  user.value<boolean>("select approve_document($1)", [document]);

const balances = (user: User, business: string, document: string) =>
  user.query<{ variant_id: string; quantity: string }>(
    `select b.variant_id, b.quantity from stock_balances b
     where b.business_id = $1 and b.variant_id in (select variant_id from document_lines where document_id = $2)
     order by b.quantity`,
    [business, document],
  );

const count = async (user: User, sql: string, params: unknown[] = []) =>
  Number(await user.value(`select count(*) from ${sql}`, params));

before(async () => {
  env = await createTestDb();
  [alice, carol, bob] = [await env.createUser("alice"), await env.createUser("carol"), await env.createUser("bob")];
  shopA = await alice.value("select create_business('חנות א')");
  shopB = await bob.value("select create_business('חנות ב')");
  await alice.query("select add_member_by_email($1, $2, 'staff')", [shopA, carol.email]);
});

describe("approval", () => {
  test("needs a supplier, and a product and positive quantity on every line", async () => {
    const supplier = await newSupplier(alice, shopA, "40");
    const noSupplier = await newDocument(alice, shopA, null, [{ barcode: "n1", quantity: 1 }]);
    await assert.rejects(approve(alice, noSupplier), /missing_supplier/);
    const empty = await newDocument(alice, shopA, supplier, []);
    await assert.rejects(approve(alice, empty), /no_lines/);
    const unmatched = await newDocument(alice, shopA, supplier, [{ barcode: "n2", quantity: 1 }]);
    await assert.rejects(approve(alice, unmatched), /incomplete_lines/);
    const noQuantity = await newDocument(alice, shopA, supplier, [{ barcode: "n3" }]);
    await createMissingItems(alice, noQuantity);
    await assert.rejects(approve(alice, noQuantity), /incomplete_lines/);
    assert.equal(await count(alice, "stock_movements where document_id in ($1, $2, $3, $4)", [noSupplier, empty, unmatched, noQuantity]), 0);
  });

  test("approving twice, or twice at once, adds stock once", async () => {
    const supplier = await newSupplier(alice, shopA, "41");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "d1", quantity: 3, unit_cost: 10 }]);
    await createMissingItems(alice, document);
    // PGlite has one connection, so these run one after the other; in Postgres the
    // row lock and the unique receipt index cover true concurrency.
    const results = await Promise.all([approve(alice, document), approve(alice, document)]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await approve(carol, document), false);
    assert.equal(await count(alice, "stock_movements where document_id = $1", [document]), 1);
    assert.deepEqual((await balances(alice, shopA, document)).map((b) => Number(b.quantity)), [3]);
  });

  test("a second receipt movement for the same document and item is impossible", async () => {
    const supplier = await newSupplier(alice, shopA, "42");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "u1", quantity: 1 }]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    // Even with owner privileges, bypassing every function.
    await assert.rejects(
      env.db.query(
        `insert into stock_movements (business_id, warehouse_id, variant_id, kind, quantity, document_id)
         select business_id, warehouse_id, variant_id, kind, quantity, document_id
         from stock_movements where document_id = $1`,
        [document],
      ),
      /stock_movements_receipt_once/,
    );
  });

  test("the same item on several lines is received as the sum", async () => {
    const supplier = await newSupplier(alice, shopA, "43");
    const line = { supplier_sku: "BR-9724516", quantity: 1, unit_cost: 1305.15 };
    const document = await newDocument(alice, shopA, supplier, [line, line]);
    await createMissingItems(alice, document);
    const lines = await linesOf(alice, document);
    assert.equal(lines[0].variant_id, lines[1].variant_id);
    await approve(alice, document);
    assert.equal(await count(alice, "stock_movements where document_id = $1", [document]), 1);
    assert.deepEqual((await balances(alice, shopA, document)).map((b) => Number(b.quantity)), [2]);
  });

  test("an approved document and its lines are locked", async () => {
    const supplier = await newSupplier(alice, shopA, "44");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "l1", quantity: 1, unit_cost: 5 }]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    const [line] = await linesOf(alice, document);
    const attempts = [
      alice.query("update document_lines set quantity = 99 where id = $1", [line.id]),
      alice.query("update document_lines set unit_cost = 99 where id = $1", [line.id]),
      alice.query("delete from document_lines where id = $1", [line.id]),
      alice.query("insert into document_lines (business_id, document_id, position) values ($1, $2, 9)", [shopA, document]),
      alice.query("select replace_document_lines($1, '[]')", [document]),
      alice.query("select link_document_line($1, null)", [line.id]),
      alice.query("update documents set status = 'review' where id = $1", [document]),
      alice.query("update documents set doc_number = 'x' where id = $1", [document]),
      alice.query("delete from documents where id = $1", [document]),
      alice.query("select fill_line_cost($1, 99)", [line.id]),
    ];
    for (const [index, attempt] of attempts.entries()) {
      await assert.rejects(attempt, /document_locked/, `attempt ${index}`);
    }
  });

  test("status 'approved' cannot be written directly", async () => {
    const supplier = await newSupplier(alice, shopA, "45");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "s1", quantity: 1 }]);
    await assert.rejects(alice.query("update documents set status = 'approved' where id = $1", [document]), /approval_only_through_rpc/);
    await assert.rejects(
      alice.query("insert into documents (id, business_id, warehouse_id, status) values ($1, $2, $3, 'approved')",
        [randomUUID(), shopA, await warehouseOf(alice, shopA)]),
      /approval_only_through_rpc/,
    );
  });

  test("members cannot write movements or balances directly", async () => {
    await assert.rejects(alice.query("insert into stock_movements (business_id) values ($1)", [shopA]), /permission denied/);
    await assert.rejects(alice.query("update stock_balances set quantity = 1000"), /permission denied/);
    await assert.rejects(alice.query("delete from stock_movements"), /permission denied/);
  });

  test("a missing cost can be filled once; nothing else changes", async () => {
    const supplier = await newSupplier(alice, shopA, "46");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "c1", quantity: 2 }]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    const [line] = await linesOf(alice, document);
    await carol.query("select fill_line_cost($1, 12.5)", [line.id]);
    assert.equal(Number(await alice.value("select unit_cost from document_lines where id = $1", [line.id])), 12.5);
    await assert.rejects(alice.query("select fill_line_cost($1, 20)", [line.id]), /document_locked/);
    assert.deepEqual((await balances(alice, shopA, document)).map((b) => Number(b.quantity)), [2]);
  });
});

describe("pricing, classification and barcodes", () => {
  test("the database freezes the same prices the screen shows", async () => {
    const supplier = await newSupplier(alice, shopA, "50");
    // 27.24 and 206.55 are the ends of the sample file's cost range.
    const costs = [27.24, 206.55, 34.75, 19.88, 1305.15];
    const document = await newDocument(alice, shopA, supplier,
      costs.map((cost, i) => ({ barcode: `p${i}`, quantity: 1, unit_cost: cost, description: "טבעת" })));
    await createMissingItems(alice, document);
    await approve(alice, document);
    const lines = await linesOf(alice, document);
    const rule = { clubMultiplier: 2.9, saleMarkupPct: 10 };
    for (const [i, cost] of costs.entries()) {
      const expected = effectivePrices({ sale: null, club: null }, null, cost, rule);
      assert.deepEqual({ sale: Number(lines[i].sale_price), club: Number(lines[i].club_price) }, expected, String(cost));
      assert.equal(lines[i].product_type, "ring");
    }
    assert.deepEqual([Number(lines[0].club_price), Number(lines[0].sale_price)], [79, 87]);
    assert.deepEqual([Number(lines[1].club_price), Number(lines[1].sale_price)], [599, 659]);
  });

  test("typed prices win, and the supplier's own rule is used", async () => {
    const supplier = await newSupplier(alice, shopA, "51");
    await alice.query("update suppliers set club_multiplier = 2, sale_markup_pct = 20 where id = $1", [supplier]);
    const document = await newDocument(alice, shopA, supplier, [
      { barcode: "t1", quantity: 1, unit_cost: 50 },
      { barcode: "t2", quantity: 1, unit_cost: 50, sale_price: 200, club_price: 150 },
    ]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    assert.deepEqual((await linesOf(alice, document)).map((l) => [Number(l.club_price), Number(l.sale_price)]),
      [[100, 120], [150, 200]]);
  });

  test("the type is guessed from the supplier's description, including their typos", async () => {
    const cases: [string, string | null][] = [
      ["טבעת CAG020-1", "ring"], ["עגיל ZAG803-1", "earring"], ["שרשרת TAG5078-1", "necklace"],
      ["BR Ring Prisma White/GOS 52", "ring"], ["LINEA:RING GOLD SHINY", "ring"],
      ["BE Necklage Linea S", "necklace"], ["BR Neclage Sola", "necklace"],
      ["BR Bracelrt Sola S", "bracelet"], ["LINEA HEXAGON:MB", null], ["Spring collection", null],
    ];
    const document = await newDocument(alice, shopA, null, cases.map(([description]) => ({ description })));
    assert.deepEqual((await linesOf(alice, document)).map((l) => l.guessed_type), cases.map(([, type]) => type));
  });

  test("internal barcodes run in sequence per supplier and skip taken codes", async () => {
    const supplier = await newSupplier(alice, shopA, "12");
    await alice.query("select create_product($1, 'קיים', null, null, $2::jsonb)",
      [shopA, JSON.stringify([{ label: "", codes: [{ kind: "pos", code: "N12000002" }] }])]);
    const document = await newDocument(alice, shopA, supplier,
      [{ barcode: "q1", quantity: 1 }, { barcode: "q2", quantity: 1 }]);
    await createMissingItems(alice, document);
    const codes = await alice.query(
      `select c.code from document_lines l join variant_codes c on c.variant_id = l.variant_id and c.kind = 'pos'
       where l.document_id = $1 order by l.position`, [document]);
    assert.deepEqual(codes.map((c) => c.code), ["N12000001", "N12000003"]);
  });

  test("without a supplier POS code there is no barcode until the code is filled in", async () => {
    const supplier = await newSupplier(alice, shopA);
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "w1", quantity: 1 }]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    const posCodes = () => count(alice,
      "variant_codes where kind = 'pos' and variant_id in (select variant_id from document_lines where document_id = $1)", [document]);
    assert.equal(await posCodes(), 0);
    await alice.query("update suppliers set pos_code = '77' where id = $1", [supplier]);
    await alice.query("select assign_internal_barcodes($1)", [document]);
    await alice.query("select assign_internal_barcodes($1)", [document]);
    assert.equal(await posCodes(), 1);
  });
});

describe("matching", () => {
  test("a new barcode of a known model is not matched to another size by SKU", async () => {
    const supplier = await newSupplier(alice, shopA, "60");
    const first = await newDocument(alice, shopA, supplier,
      [{ barcode: "700007835787", supplier_sku: "CAG020-1", variant_text: "מידה: 6", quantity: 1 }]);
    await createMissingItems(alice, first);
    const next = await newDocument(alice, shopA, supplier, [
      { barcode: "700007835794", supplier_sku: "CAG020-1", variant_text: "מידה: 7" },
      { barcode: "700007835787", supplier_sku: "CAG020-1" },
    ]);
    assert.deepEqual((await linesOf(alice, next)).map((l) => l.match_method), [null, "barcode"]);
  });

  test("a manual link survives saving, rematching, and can be removed", async () => {
    const supplier = await newSupplier(alice, shopA, "61");
    const first = await newDocument(alice, shopA, supplier, [{ barcode: "m-known", quantity: 1 }]);
    await createMissingItems(alice, first);
    const variant = (await linesOf(alice, first))[0].variant_id;
    const document = await newDocument(alice, shopA, supplier, [{ description: "בלי קוד", quantity: 2 }]);
    await alice.query("select link_document_line($1, $2)", [(await linesOf(alice, document))[0].id, variant]);
    await alice.query("select match_document_lines($1)", [document]);
    assert.equal((await linesOf(alice, document))[0].match_method, "manual");
    await alice.query("select replace_document_lines($1, $2::jsonb)",
      [document, JSON.stringify([{ description: "בלי קוד", quantity: 5, manual_variant_id: variant }])]);
    const [saved] = await linesOf(alice, document);
    assert.deepEqual([saved.variant_id, saved.match_method], [variant, "manual"]);
    await alice.query("select link_document_line($1, null)", [saved.id]);
    assert.equal((await linesOf(alice, document))[0].variant_id, null);
  });

  test("creating an item twice from the same line is rejected", async () => {
    const supplier = await newSupplier(alice, shopA, "62");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "once", quantity: 1 }]);
    const [line] = await linesOf(alice, document);
    const create = () => alice.query("select create_item_for_line($1, null, 'פעם אחת', '')", [line.id]);
    await create();
    await assert.rejects(create(), /line_already_linked/);
  });
});

describe("adjustments", () => {
  async function stocked() {
    const supplier = await newSupplier(alice, shopA, "70");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: `a${randomUUID()}`, quantity: 5 }]);
    await createMissingItems(alice, document);
    await approve(alice, document);
    const variant = (await linesOf(alice, document))[0].variant_id!;
    return { document, variant, warehouse: await warehouseOf(alice, shopA) };
  }
  const adjust = (user: User, args: unknown[]) => user.value<boolean>("select adjust_stock($1, $2, $3, $4, $5, $6)", args);

  test("a correction is a movement with a reason, applied once per request", async () => {
    const { document, variant, warehouse } = await stocked();
    const args = [warehouse, variant, -2, "נספרו 3 בלבד", randomUUID(), document];
    assert.equal(await adjust(alice, args), true);
    assert.equal(await adjust(alice, args), false);
    assert.deepEqual((await balances(alice, shopA, document)).map((b) => Number(b.quantity)), [3]);
    assert.equal(await count(alice, "stock_movements where variant_id = $1", [variant]), 2);
  });

  test("needs a reason, a manager, and enough stock", async () => {
    const { variant, warehouse } = await stocked();
    await assert.rejects(adjust(alice, [warehouse, variant, -1, "  ", randomUUID(), null]), /adjustment_has_reason/);
    await assert.rejects(adjust(carol, [warehouse, variant, -1, "סיבה", randomUUID(), null]), /forbidden/);
    await assert.rejects(adjust(alice, [warehouse, variant, -6, "סיבה", randomUUID(), null]), /negative_stock/);
    assert.equal(Number(await alice.value("select quantity from stock_balances where variant_id = $1", [variant])), 5);
  });

  test("an item with stock history cannot be deleted", async () => {
    const { variant } = await stocked();
    await assert.rejects(
      alice.query("delete from products where id = (select product_id from product_variants where id = $1)", [variant]),
    );
    assert.equal(await count(alice, "product_variants where id = $1", [variant]), 1);
  });
});

describe("POS export records", () => {
  const insert = (user: User, business: string, document: string) =>
    user.value<string>(
      `insert into pos_exports (business_id, document_id, file_name, template_version, row_count, variant_ids, content_base64)
       values ($1, $2, 'a.xls', 'v1', 1, '{}', 'AA==') returning id`, [business, document]);

  test("one file per approved document, pending until marked uploaded", async () => {
    const supplier = await newSupplier(alice, shopA, "80");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "e1", quantity: 1 }]);
    await createMissingItems(alice, document);
    await assert.rejects(insert(alice, shopA, document), /row-level security/);
    await approve(alice, document);
    const id = await insert(alice, shopA, document);
    await assert.rejects(insert(alice, shopA, document), /pos_exports_document_id_key/);
    const status = () => alice.value("select pos_status from pos_exports where id = $1", [id]);
    assert.equal(await status(), "pending");
    await assert.rejects(alice.query("update pos_exports set pos_status = 'uploaded' where id = $1", [id]), /permission denied/);
    await assert.rejects(bob.query("select mark_export_uploaded($1)", [id]), /export_not_found/);
    await alice.query("select mark_export_uploaded($1)", [id]);
    assert.equal(await status(), "uploaded");
    assert.equal(await count(alice, "stock_movements where document_id = $1", [document]), 1);
  });
});

describe("separation between businesses", () => {
  test("another business sees none of the new tables and can act on none of it", async () => {
    const supplier = await newSupplier(alice, shopA, "90");
    const document = await newDocument(alice, shopA, supplier, [{ barcode: "iso1", quantity: 4 }]);
    await createMissingItems(alice, document);
    const [line] = await linesOf(alice, document);
    await alice.query("insert into departments values ($1, 'ring', 11, 'תכשיטי כסף', 'טבעות') on conflict do nothing", [shopA]);

    await assert.rejects(approve(bob, document), /document_not_found/);
    await approve(alice, document);
    await alice.query(
      `insert into pos_exports (business_id, document_id, file_name, template_version, row_count, variant_ids, content_base64)
       values ($1, $2, 'a.xls', 'v1', 1, '{}', 'AA==')`, [shopA, document]);

    for (const table of ["departments", "stock_movements", "stock_balances", "pos_exports"]) {
      assert.ok((await count(alice, `${table} where business_id = $1`, [shopA])) > 0, `${table} has rows`);
      assert.equal(await count(bob, `${table} where business_id = $1`, [shopA]), 0, table);
    }
    await assert.rejects(approve(bob, document), /document_not_found/);
    await assert.rejects(bob.query("insert into departments values ($1, 'earring', 1, 'x', 'y')", [shopA]), /row-level security/);
    await assert.rejects(bob.query("select fill_line_cost($1, 1)", [line.id]), /line_not_found/);
    await assert.rejects(bob.query("select link_document_line($1, null)", [line.id]), /line_not_found/);
    await assert.rejects(bob.query("select create_item_for_line($1, null, 'x', '')", [line.id]), /line_not_found/);

    const warehouseA = await warehouseOf(alice, shopA);
    const warehouseB = await warehouseOf(bob, shopB);
    await assert.rejects(bob.query("select adjust_stock($1, $2, 1, 'x', $3)", [warehouseA, line.variant_id, randomUUID()]), /forbidden/);
    // Own warehouse, someone else's item: stopped by the composite foreign key.
    await assert.rejects(bob.query("select adjust_stock($1, $2, 1, 'x', $3)", [warehouseB, line.variant_id, randomUUID()]), /foreign key/);
    await assert.rejects(
      bob.query(
        `insert into pos_exports (business_id, document_id, file_name, template_version, row_count, variant_ids, content_base64)
         values ($1, $2, 'a.xls', 'v1', 1, '{}', 'AA==')`, [shopB, document]),
    );
  });
});
