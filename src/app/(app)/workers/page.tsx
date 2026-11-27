import type { Metadata } from "next";
import Link from "next/link";
import { requireBusiness } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { channelsFor, type Channel } from "@/lib/assistant-channels";
import { loadDesks, type Desk } from "@/lib/workers";
import { ChannelAvatar } from "@/components/assistant-chat";

export const metadata: Metadata = { title: "עובדים" };

/**
 * The team: every chat of the business as a worker. Each card shows what that worker
 * found in the business data right now, and opens a conversation with them.
 */
export default async function WorkersPage() {
  const { active } = await requireBusiness();
  const canManage = can(active.role, "accounting.view");
  const desks = await loadDesks(active.businessId, canManage);
  const [manager, ...team] = channelsFor(canManage);
  // The work manager's count: what the team found plus what the system prepared.
  const waiting = Number(desks.main?.figure.value ?? 0);

  return (
    <div className="flex flex-col gap-10">
      <header className="bleed hero frame-row -mt-8 py-8 sm:-mt-10 sm:py-10">
        <div className="hero-in">
          <p className="eyebrow">הצוות של {active.businessName}</p>
          <h1 className="mt-2 text-3xl sm:text-4xl">{team.length + 1} עובדים עובדים בשבילכם.</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            כל עובד קורא את נתוני העסק בתחום שלו, מסמן מה צריך טיפול ועונה על כל שאלה. הם לא משנים כלום בלי האישור שלכם.
            {waiting > 0 ? ` כרגע ${waiting === 1 ? "דבר אחד מחכה" : `${waiting} דברים מחכים`} לכם.` : " כרגע הכול מטופל."}
          </p>
        </div>
      </header>

      <WorkerCard worker={manager} desk={desks[manager.id]} main />

      <section aria-labelledby="team-heading">
        <h2 id="team-heading" className="text-xl">
          הצוות
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {team.map((worker) => (
            <li key={worker.id} className="flex">
              <WorkerCard worker={worker} desk={desks[worker.id]} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkerCard({ worker, desk, main = false }: { worker: Channel; desk: Desk | undefined; main?: boolean }) {
  const findings = desk?.findings ?? [];
  const toHandle = findings.filter((finding) => !finding.info);
  const urgent = toHandle.filter((finding) => finding.urgent).length;
  const status = urgent ? `${urgent} דחוף` : toHandle.length ? `${toHandle.length} לטיפול` : "הכול מטופל";
  const name = main ? "מנהל העבודה" : worker.worker;

  return (
    <article className="card worker-card w-full" data-main={main}>
      <div className={`flex flex-col gap-4 ${main ? "sm:w-80 sm:shrink-0" : ""}`}>
        <div className="flex items-center gap-3">
          <ChannelAvatar id={worker.id} large />
          <div className="min-w-0 flex-1">
            <h3 className={main ? "text-xl" : "text-lg"}>{name}</h3>
            <p className="text-sm text-muted">{main ? "כל העסק" : worker.name}</p>
          </div>
          <span className={`chip shrink-0 ${urgent ? "chip-warn" : ""}`}>{status}</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">{worker.duties}</p>
        {desk && (
          <p>
            <bdi dir="ltr" className="display text-4xl tabular-nums">
              {desk.figure.value}
            </bdi>
            <span className="ms-2 text-sm text-muted">{desk.figure.label}</span>
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex-1">
          <p className="eyebrow">{main ? "מה הצוות מצא" : "מה מצאתי"}</p>
          {findings.length === 0 ? (
            <p className="mt-2 text-sm text-muted">אין כרגע משהו שמחכה לכם בתחום הזה.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line">
              {findings.map((finding) => (
                <li key={finding.text}>
                  <Link href={finding.href} className="worker-finding">
                    <span
                      className={`size-2 shrink-0 rounded-full ${finding.urgent ? "bg-danger" : finding.info ? "bg-line" : "bg-warn"}`}
                      aria-hidden="true"
                    />
                    <span className="worker-finding-text min-w-0 flex-1">{finding.text}</span>
                    {finding.urgent && <span className="text-xs font-medium text-danger">דחוף</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/workers/${worker.id}`} className="btn">
            {main ? "לדבר עם מנהל העבודה" : `לדבר עם ${worker.worker}`}
          </Link>
          {desk && !main && (
            <Link href={desk.href} className="btn-quiet">
              למסך {worker.name}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
