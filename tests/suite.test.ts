import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createTestDb } from "./helpers/db.ts";

const ALL_CATEGORIES = [
  { category: "pos_commerce", provider: "pos_excel", display_name: "קופה מבוססת Excel", mode: "sandbox", status: "sandbox" },
  { category: "accounting", provider: "morning", display_name: "Morning (חשבונית ירוקה)", mode: "live", status: "connected" },
  { category: "payments", provider: "cardcom", display_name: "CardCom", mode: "live", status: "connected" },
  { category: "marketing_crm", provider: "meta_ads", display_name: "Meta Ads", mode: "sandbox", status: "sandbox" },
] as const;

describe("end-to-end onboarding and suite RLS", () => {
  let env: Awaited<ReturnType<typeof createTestDb>>;

  before(async () => {
    env = await createTestDb();
  });

  after(async () => {
    await env?.db.close();
  });

  it("blocks onboarding completion until all 4 integration categories are configured", async () => {
    const owner = await env.createUser("owner-onboard");
    const businessId = await owner.value<string>("select public.create_business('עסק חדש')");

    // Newly created business has onboarding_completed_at = null
    const initial = await owner.value<string | null>(
      "select onboarding_completed_at from public.businesses where id = $1",
      [businessId],
    );
    assert.equal(initial, null);

    // Direct update to onboarding_completed_at is rejected (column-level grant + trigger)
    await assert.rejects(
      owner.query("update public.businesses set onboarding_completed_at = now() where id = $1", [businessId]),
      /permission denied|use_complete_business_onboarding/,
    );

    // Completing with 0 integrations fails
    await assert.rejects(
      owner.query("select public.complete_business_onboarding($1)", [businessId]),
      /integrations_incomplete/,
    );

    // Configure 3 of 4 categories -> still blocked
    for (const item of ALL_CATEGORIES.slice(0, 3)) {
      await owner.query(
        `insert into public.business_integrations (business_id, category, provider, display_name, mode, status)
         values ($1, $2, $3, $4, $5, $6)`,
        [businessId, item.category, item.provider, item.display_name, item.mode, item.status],
      );
    }
    await assert.rejects(
      owner.query("select public.complete_business_onboarding($1)", [businessId]),
      /integrations_incomplete/,
    );

    // Configure 4th category -> onboarding completes cleanly
    const fourth = ALL_CATEGORIES[3];
    await owner.query(
      `insert into public.business_integrations (business_id, category, provider, display_name, mode, status)
       values ($1, $2, $3, $4, $5, $6)`,
      [businessId, fourth.category, fourth.provider, fourth.display_name, fourth.mode, fourth.status],
    );

    const completedAt = await owner.value<string | null>(
      "select public.complete_business_onboarding($1)",
      [businessId],
    );
    assert.ok(completedAt);
  });

  it("enforces role permissions and strict business separation across all suite tables", async () => {
    const ownerA = await env.createUser("owner-a");
    const staffA = await env.createUser("staff-a");
    const ownerB = await env.createUser("owner-b");

    const businessA = await ownerA.value<string>("select public.create_business('עסק א')");
    const businessB = await ownerB.value<string>("select public.create_business('עסק ב')");
    await ownerA.query("select public.add_member_by_email($1, $2, 'staff')", [businessA, staffA.email]);

    // Owner A populates all 5 new tables
    for (const item of ALL_CATEGORIES) {
      await ownerA.query(
        `insert into public.business_integrations (business_id, category, provider, display_name, mode, status)
         values ($1, $2, $3, $4, $5, $6)`,
        [businessA, item.category, item.provider, item.display_name, item.mode, item.status],
      );
    }
    const accountA = await ownerA.value<string>(
      `insert into public.finance_accounts (business_id, name, account_type, institution, balance)
       values ($1, 'עו״ש ראשי', 'bank', 'בנק לאומי', 25000) returning id`,
      [businessA],
    );
    await ownerA.query(
      `insert into public.ledger_entries (business_id, account_id, kind, status, title, amount, vat_amount)
       values ($1, $2, 'invoice', 'paid', 'מכירות שבועיות', 5900, 900)`,
      [businessA, accountA],
    );
    await ownerA.query(
      `insert into public.campaigns (business_id, name, channel, status, budget, spent, leads_count, revenue)
       values ($1, 'קמפיין אינסטגרם', 'meta_ads', 'active', 3000, 1200, 45, 9600)`,
      [businessA],
    );

    // Staff A can add a customer in CRM, but cannot delete customers or create finance/campaigns/integrations
    const customerId = await staffA.value<string>(
      `insert into public.customers (business_id, name, stage, source, lifetime_value)
       values ($1, 'דנה כהן', 'lead', 'Meta Ads', 0) returning id`,
      [businessA],
    );
    assert.ok(customerId);

    const deletedByStaff = await staffA.query("delete from public.customers where id = $1 returning id", [customerId]);
    assert.equal(deletedByStaff.length, 0);

    await assert.rejects(
      staffA.query(
        `insert into public.finance_accounts (business_id, name, account_type) values ($1, 'חשבון', 'bank')`,
        [businessA],
      ),
    );
    await assert.rejects(
      staffA.query(
        `insert into public.campaigns (business_id, name, channel) values ($1, 'קמפיין', 'meta_ads')`,
        [businessA],
      ),
    );
    await assert.rejects(
      staffA.query("select public.complete_business_onboarding($1)", [businessA]),
      /forbidden/,
    );

    // Business B cannot see any of Business A's rows
    for (const table of ["business_integrations", "finance_accounts", "ledger_entries", "campaigns", "customers"]) {
      const rows = await ownerB.query(`select id from public.${table}`);
      assert.equal(rows.length, 0, `Business B should not see rows in ${table}`);
    }

    // Business B cannot link a ledger entry to Business A's finance account (composite FK)
    await assert.rejects(
      ownerB.query(
        `insert into public.ledger_entries (business_id, account_id, kind, title, amount)
         values ($1, $2, 'expense', 'ניסיון קישור חוצה עסק', 100)`,
        [businessB, accountA],
      ),
    );

    // Business B cannot complete Business A's onboarding
    await assert.rejects(
      ownerB.query("select public.complete_business_onboarding($1)", [businessA]),
      /forbidden/,
    );
  });
});
