"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { startExtraction } from "../actions";

export function RetryExtraction({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      className="btn"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await startExtraction(documentId);
          router.refresh();
        })
      }
    >
      {pending ? "קוראים שוב…" : "ניסיון נוסף"}
    </button>
  );
}
