"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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
    <section className="card" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent motion-reduce:animate-none" aria-hidden />
        <h2 className="font-semibold">קוראים את המסמך…</h2>
      </div>
      <p className="mt-2 text-sm text-muted">
        עד דקה או שתיים. העמוד יתעדכן לבד.
      </p>
    </section>
  );
}
