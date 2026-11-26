"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { startExtraction } from "@/app/(app)/receiving/actions";

/**
 * Shown while a document is being read. Starts the reading if nobody has yet
 * (the server lets only one caller claim it), then refreshes the page until it is done.
 */
export function ExtractionRunner({ documentId, alreadyRunning }: { documentId: string; alreadyRunning: boolean }) {
  const router = useRouter();
  const started = useRef(false);

  useEffect(() => {
    if (!alreadyRunning && !started.current) {
      started.current = true;
      startExtraction(documentId).finally(() => router.refresh());
    }
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [documentId, alreadyRunning, router]);

  return (
    <section className="card border-accent/30 bg-accent-soft/40" aria-live="polite">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-white dark:text-[#041815]">
          <Loader2 className="size-5 animate-spin motion-reduce:animate-none" aria-hidden />
        </span>
        <div>
          <h2 className="flex items-center gap-2 font-bold text-ink">
            <span>קוראים את המסמך עם AI…</span>
            <Sparkles className="size-4 text-accent" aria-hidden />
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            זה לוקח בדרך כלל עד דקה או שתיים. אפשר להשאיר את העמוד פתוח או לחזור אליו אחר כך; השורות יופיעו כאן לבדיקה.
          </p>
        </div>
      </div>
    </section>
  );
}
