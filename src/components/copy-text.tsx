"use client";

import { useState } from "react";

/** Israeli numbers as WhatsApp wants them: digits only, with the country code. */
function whatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972") && digits.length >= 11) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return `972${digits.slice(1)}`;
  return null;
}

/**
 * An editable draft with a copy button. With `send`, it also opens the draft in WhatsApp
 * or in the mail app, where the user still presses send: nothing leaves on its own.
 */
export function CopyText({
  id,
  label,
  text,
  rows = 10,
  send,
}: {
  id: string;
  label: string;
  text: string;
  rows?: number;
  send?: { phone?: string | null; subject: string };
}) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState<"ok" | "failed" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="label" htmlFor={id}>{label}</label>
      <textarea
        className="field font-mono text-sm"
        id={id}
        rows={rows}
        dir="auto"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setCopied(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={copy}>העתקת הטיוטה</button>
        {send && (
          <>
            <a
              className="btn-quiet"
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/${(send.phone && whatsappNumber(send.phone)) ?? ""}?text=${encodeURIComponent(value)}`}
            >
              פתיחה בוואטסאפ
            </a>
            <a className="btn-quiet" href={`mailto:?subject=${encodeURIComponent(send.subject)}&body=${encodeURIComponent(value)}`}>
              פתיחה במייל
            </a>
          </>
        )}
        <p aria-live="polite" className={`text-sm empty:hidden ${copied === "failed" ? "text-danger" : "text-accent"}`}>
          {copied === "ok" ? "הועתק. אפשר להדביק בוואטסאפ או במייל." : copied === "failed" ? "ההעתקה נכשלה. סמנו את הטקסט והעתיקו ידנית." : ""}
        </p>
      </div>
    </div>
  );
}
