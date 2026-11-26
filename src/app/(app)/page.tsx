import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/permissions";

export default async function HomePage() {
  const { user, active } = await requireBusiness();
  const supabase = await createClient();
  const count = async (table: "products" | "suppliers" | "warehouses") => {
    const { count: total, error } = await supabase
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("business_id", active.businessId);
    if (error) {
      throw new Error(`Failed to count ${table}: ${error.message}`);
    }
    return total ?? 0;
  };
  const [products, suppliers, warehouses] = await Promise.all([
    count("products"),
    count("suppliers"),
    count("warehouses"),
  ]);

  const tiles = [
    { href: "/products", label: "מוצרים", value: products },
    { href: "/suppliers", label: "ספקים", value: suppliers },
    { href: "/settings", label: "מחסנים", value: warehouses },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{active.businessName}</h1>
        <p className="mt-1 text-sm text-muted">
          מחוברים בתור <bdi dir="ltr">{user.email}</bdi> · {ROLE_LABELS[active.role]}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => (
          <Link key={tile.href} href={tile.href} className="card transition-colors hover:border-accent">
            <span className="block text-sm text-muted">{tile.label}</span>
            <span className="mt-1 block text-3xl font-bold tabular-nums">{tile.value}</span>
          </Link>
        ))}
      </div>

      <section className="card">
        <h2 className="font-semibold">
          {products === 0 ? "מתחילים מהקטלוג" : "מה אפשר לעשות עכשיו"}
        </h2>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">
          {products === 0
            ? "צלמו תעודת משלוח או העלו חשבונית כדי לקבל את השורות שלה כטבלה לבדיקה, או הוסיפו ספק ומוצר ידנית."
            : "אפשר להעלות תעודת משלוח, לאשר אותה למלאי ולהפיק קובץ לקופה, ולחפש מוצר לפי שם, ברקוד או מק״ט."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/receiving/new" className="btn">
            קליטת סחורה
          </Link>
          <Link href="/products/new" className="btn-quiet">
            מוצר חדש
          </Link>
          <Link href="/suppliers" className="btn-quiet">
            {suppliers === 0 ? "הוספת ספק" : "ספקים"}
          </Link>
        </div>
      </section>
    </div>
  );
}
