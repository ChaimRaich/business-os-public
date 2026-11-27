import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { formatAmount } from "@/lib/documents";
import { formatDay, todayInIsrael } from "@/lib/accounting";
import { isAiConfigured } from "@/lib/ai-text";
import { ActionForm } from "@/components/action-form";
import { CampaignFields } from "@/components/campaign-fields";
import { CopyButton, PostForm } from "@/components/post-form";
import {
  CAMPAIGN_STATE_LABELS,
  CAMPAIGN_STATE_STYLES,
  campaignState,
  CHANNEL_LABELS,
  isChannel,
} from "@/lib/campaigns";
import { createPost, deleteCampaign, deletePost, markPostPublished, suggestPost, updateCampaign } from "../actions";

export const metadata: Metadata = { title: "קמפיין" };

export default async function CampaignPage({ params }: PageProps<"/campaigns/[id]">) {
  const { id } = await params;
  const { active } = await requireBusiness();
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    notFound();
  }
  const supabase = await createClient();
  const [{ data: campaign, error }, { data: products, error: productsError }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, goal, starts_on, ends_on, budget, spent, campaign_posts (id, channel, body, scheduled_for, published_at, published_url, created_at, products (id, name))")
      .eq("id", id)
      .eq("business_id", active.businessId)
      .maybeSingle(),
    supabase.from("products").select("id, name").eq("business_id", active.businessId).order("name").limit(500),
  ]);
  if (error || productsError) {
    throw new Error(`Failed to load campaign: ${(error ?? productsError)?.message}`);
  }
  if (!campaign) {
    notFound();
  }

  const today = todayInIsrael();
  const state = campaignState(campaign, today);
  const posts = campaign.campaign_posts.toSorted((a, b) =>
    (a.scheduled_for ?? "9999").localeCompare(b.scheduled_for ?? "9999") || a.created_at.localeCompare(b.created_at),
  );
  const published = posts.filter((post) => post.published_at).length;
  const when = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });
  const defaultDate = today < campaign.starts_on ? campaign.starts_on : today > campaign.ends_on ? campaign.ends_on : today;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/campaigns" className="text-sm text-muted underline-offset-4 hover:underline">
          → כל הקמפיינים
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl sm:text-4xl"><bdi>{campaign.name}</bdi></h1>
          <span className={`rounded-full px-2.5 py-1 text-sm ${CAMPAIGN_STATE_STYLES[state]}`}>{CAMPAIGN_STATE_LABELS[state]}</span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {formatDay(campaign.starts_on)} עד {formatDay(campaign.ends_on)} · {published} מתוך {posts.length} פוסטים פורסמו
          {campaign.budget !== null && (
            <> · תקציב <bdi dir="ltr">{formatAmount(campaign.budget, 0)} ₪</bdi></>
          )}
          {campaign.spent !== null && (
            <> · הוצא בפועל <bdi dir="ltr">{formatAmount(campaign.spent, 0)} ₪</bdi></>
          )}
        </p>
        {campaign.goal && <p className="mt-2 max-w-prose text-sm"><bdi>{campaign.goal}</bdi></p>}
      </div>

      <section className="card">
        <h2 className="font-semibold">פוסטים ({posts.length})</h2>
        {posts.length === 0 ? (
          <p className="mt-2 text-sm text-muted">עוד אין פוסטים בקמפיין. כתבו את הראשון בטופס שלמטה.</p>
        ) : (
          <ul className="mt-1 divide-y divide-line">
            {posts.map((post) => (
              <li key={post.id} className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold">{isChannel(post.channel) ? CHANNEL_LABELS[post.channel] : post.channel}</span>
                  {post.scheduled_for && <span className="text-muted">מתוכנן ל-{formatDay(post.scheduled_for)}</span>}
                  {post.products && (
                    <Link href={`/products/${post.products.id}`} className="text-accent underline underline-offset-4">
                      <bdi>{post.products.name}</bdi>
                    </Link>
                  )}
                  {post.published_at ? (
                    <span className="rounded-full bg-accent-soft px-2.5 py-1 text-accent-strong">פורסם ב-{when.format(new Date(post.published_at))}</span>
                  ) : post.scheduled_for && post.scheduled_for < today ? (
                    <span className="rounded-full bg-danger-soft px-2.5 py-1 text-danger">עוד לא פורסם, התאריך עבר</span>
                  ) : (
                    <span className="rounded-full bg-warn-soft px-2.5 py-1 text-warn">עוד לא פורסם</span>
                  )}
                </div>
                <p className="max-w-prose whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm leading-relaxed" dir="auto">{post.body}</p>
                {post.published_url && (
                  <a href={post.published_url} target="_blank" rel="noreferrer" className="self-start text-sm text-accent underline underline-offset-4" dir="ltr">
                    {post.published_url}
                  </a>
                )}
                <div className="flex flex-wrap items-end gap-3">
                  <CopyButton text={post.body} />
                  {post.published_at ? (
                    <ActionForm action={markPostPublished} submitLabel="ביטול הסימון" submitClassName="btn-quiet" className="flex flex-wrap items-center gap-3">
                      <input type="hidden" name="id" value={post.id} />
                      <input type="hidden" name="intent" value="undo" />
                    </ActionForm>
                  ) : (
                    <ActionForm action={markPostPublished} submitLabel="סימון שפורסם" className="flex flex-wrap items-end gap-3">
                      <input type="hidden" name="id" value={post.id} />
                      <label className="text-sm">
                        <span className="label">קישור לפוסט (לא חובה)</span>
                        <input name="published_url" type="url" dir="ltr" maxLength={500} placeholder="https://" className="field py-2" />
                      </label>
                    </ActionForm>
                  )}
                  <ActionForm action={deletePost} submitLabel="מחיקה" submitClassName="min-h-11 px-1 text-sm text-danger underline underline-offset-4" className="flex items-center gap-3">
                    <input type="hidden" name="id" value={post.id} />
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">פוסט חדש</h2>
        <PostForm
          campaignId={campaign.id}
          products={products}
          defaultDate={defaultDate}
          aiEnabled={isAiConfigured()}
          action={createPost}
          suggest={suggestPost}
        />
      </section>

      <section className="card">
        <h2 className="mb-4 font-semibold">פרטי הקמפיין</h2>
        <ActionForm action={updateCampaign} submitLabel="שמירת הפרטים" className="grid gap-4 sm:grid-cols-2 [&>button]:justify-self-start">
          <input type="hidden" name="id" value={campaign.id} />
          <CampaignFields values={campaign} />
        </ActionForm>
        {can(active.role, "campaigns.delete") && (
          <details className="mt-6 border-t border-line pt-4 text-sm">
            <summary className="cursor-pointer text-danger">מחיקת הקמפיין</summary>
            <p className="mt-2 text-muted">המחיקה מוחקת גם את {posts.length} הפוסטים שבו, ואי אפשר לבטל אותה.</p>
            <ActionForm action={deleteCampaign} submitLabel="מחיקת הקמפיין והפוסטים" submitClassName="btn-quiet mt-3 text-danger">
              <input type="hidden" name="id" value={campaign.id} />
            </ActionForm>
          </details>
        )}
      </section>
    </div>
  );
}
