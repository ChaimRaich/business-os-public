import type { NextRequest } from "next/server";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { buildAccountantWorkbook, inPeriod, loadAccounting, parsePeriod, todayInIsrael } from "@/lib/accounting";

/** The period's documents and expenses as an Excel file for the accountant. Read-only. */
export async function GET(request: NextRequest) {
  const { active } = await requireBusiness();
  if (!can(active.role, "accounting.view")) {
    return new Response("Forbidden", { status: 403 });
  }
  const period = parsePeriod(request.nextUrl.searchParams.get("period") ?? undefined, todayInIsrael());
  const { purchases, expenses } = await loadAccounting(await createClient(), active.businessId);
  const file = buildAccountantWorkbook(
    period,
    purchases.filter((item) => inPeriod(item.date, period)).reverse(),
    expenses.filter((item) => inPeriod(item.date, period)).reverse(),
  );
  const name = `${active.businessName} - לרואה החשבון - ${period.label}.xlsx`;
  return new Response(new Uint8Array(file), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="accounting-${period.key}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "cache-control": "private, no-store",
    },
  });
}
