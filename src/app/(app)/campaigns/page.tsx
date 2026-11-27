import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatAmount } from "@/lib/documents";
import { formatDay, todayInIsrael } from "@/lib/accounting";
import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/campaign-fields";
import {
  addDays,
  CAMPAIGN_STATE_LABELS,
  CAMPAIGN_STATE_STYLES,
  campaignState,
  CHANNEL_LABELS,
  isChannel,
} from "@/lib/campaigns";
import { promotionDraft, slowProducts } from "@/lib/initiatives";
import { createCampaign } from "./actions";

export const metadata: Metadata = { title: "קמפיינים" };

export default async function CampaignsPage({ searchParams }: PageProps<"/campaigns">) {
  const { active } = await requireBusiness();
  const supabase = await createClient();
  const today = todayInIsrael();
  const [{ data: campaigns, error }, { data: waiting, error: waitingError }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, starts_on, ends_on, budget, spent, campaign_posts (published_at)")
      .eq("business_id", active.businessId)
      .order("starts_on", { ascending: false })
      .limit(200),
    supabase
      .from("campaign_posts")
      .select("id, channel, body, scheduled_for, campaigns (id, name)")
      .eq("business_id", active.businessId)
      .is("published_at", null)
      .lte("scheduled_for", addDays(today, 7))
      .order("scheduled_for")
      .limit(50),
  ]);
  if (error || waitingError) {
    throw new Error(`Failed to load campaigns: ${(error ?? waitingError)?.message}`);
  }
  // Opened from the home screen's initiative: the form comes filled with the products that stopped selling.
  const slow = (await searchParams).draft === "slow" ? await slowProducts(supabase, active.businessId, today) : [];
  const draft = slow.length ? promotionDraft(slow, today) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl sm:text-4xl">קמפיינים</h1>
      <p className="max-w-prose text-sm text-muted">
        הפרסום ידני: מעתיקים את הטקסט, מפרסמים ברשת ומסמנים כאן שפורסם.
      </p>

      {waiting.length > 0 && (
        <section className="card">
          <h2 className="font-semibold">לפרסם השבוע ({waiting.length})</h2>
          <ul className="mt-1 divide-y divide-line">
            {waiting.map((post) => (
              <li key={post.id}>
                <Link href={`/campaigns/${post.campaigns.id}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas">
                  <span className="min-w-0 flex-1 basis-56">
                    <span className="block truncate font-medium"><bdi>{post.body}</bdi></span>
                    <span className="block text-sm text-muted">
                      {isChannel(post.channel) ? CHANNEL_LABELS[post.channel] : post.channel} · <bdi>{post.campaigns.name}</bdi>
                    </span>
                  </span>
                  {post.scheduled_for && (
                    <span className={`rounded-full px-2.5 py-1 text-sm ${post.scheduled_for < today ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn"}`}>
                      {post.scheduled_for < today ? "היה מתוכנן ל-" : post.scheduled_for === today ? "היום · " : ""}
                      {formatDay(post.scheduled_for)}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="font-semibold">כל הקמפיינים</h2>
        {campaigns.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            עוד אין קמפיינים.
          </p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {campaigns.map((campaign) => {
              const state = campaignState(campaign, today);
              const published = campaign.campaign_posts.filter((post) => post.published_at).length;
              return (
                <li key={campaign.id}>
                  <Link href={`/campaigns/${campaign.id}`} className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-canvas">
                    <span className="min-w-0 flex-1 basis-56">
                      <span className="block truncate font-medium"><bdi>{campaign.name}</bdi></span>
                      <span className="block text-sm text-muted">
                        {formatDay(campaign.starts_on)} עד {formatDay(campaign.ends_on)}
                      </span>
                    </span>
                    <span className="text-sm text-muted">
                      {campaign.campaign_posts.length === 0 ? "בלי פוסטים" : `${published} מתוך ${campaign.campaign_posts.length} פוסטים פורסמו`}
                    </span>
                    {campaign.budget !== null && (
                      <span className="text-sm text-muted">
                        תקציב <bdi dir="ltr">{formatAmount(campaign.budget, 0)} ₪</bdi>
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 text-sm ${CAMPAIGN_STATE_STYLES[state]}`}>{CAMPAIGN_STATE_LABELS[state]}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card scroll-mt-28" id="new-campaign">
        <h2 className="mb-4 font-semibold">קמפיין חדש</h2>
        {draft && (
          <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2.5 text-sm text-accent-strong">
            המערכת הכינה את הקמפיין הזה למוצרים שלא נמכרו לאחרונה. בדקו, שנו מה שצריך, ופתחו אותו. שום דבר לא מתפרסם מעצמו.
          </p>
        )}
        <ActionForm action={createCampaign} submitLabel="פתיחת הקמפיין" className="grid gap-4 sm:grid-cols-2 [&>button]:justify-self-start">
          <CampaignFields defaultStart={today} draft={draft} />
        </ActionForm>
      </section>
    </div>
  );
}
