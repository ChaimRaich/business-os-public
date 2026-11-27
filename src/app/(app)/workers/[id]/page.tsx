import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBusiness } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { channelById, isChannelId } from "@/lib/assistant-channels";
import { WorkersChats } from "@/components/assistant-chat";

export async function generateMetadata({ params }: PageProps<"/workers/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: isChannelId(id) ? (id === "main" ? "מנהל העבודה" : channelById(id).worker) : "עובדים" };
}

/** A conversation with one worker, full page, with the rest of the team beside it. */
export default async function WorkerPage({ params }: PageProps<"/workers/[id]">) {
  const { id } = await params;
  const { user, active } = await requireBusiness();
  const canManage = can(active.role, "accounting.view");
  if (!isChannelId(id) || (channelById(id).managersOnly && !canManage)) {
    notFound();
  }
  return (
    <div className="flex flex-col gap-4">
      <Link href="/workers" className="self-start text-sm text-muted hover:text-ink">
        → כל העובדים
      </Link>
      <WorkersChats
        key={active.businessId}
        initialChannel={id}
        businessName={active.businessName}
        businessId={active.businessId}
        userId={user.id}
        canManage={canManage}
      />
    </div>
  );
}
