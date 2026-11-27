"use client";

import { LogoTile } from "@/components/logo";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

type Entry = { role: "user" | "assistant" | "error"; content: string; time: string; fresh?: boolean };

const SUGGESTIONS = [
  "מה יש לי במלאי כרגע?",
  "אילו קליטות מחכות לבדיקה?",
  "אילו פוסטים צריך לפרסם השבוע?",
  "מה פתוח לתשלום לספקים?",
];

const now = () => new Date().toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

// Share links carry the conversation in the URL, so it is cut to what mail clients and WhatsApp accept.
const WHATSAPP_LIMIT = 3000;
const MAIL_LIMIT = 1700;

function transcript(businessName: string, entries: Entry[], limit: number): string {
  const heading = `שיחה עם העוזר של ${businessName} (Business OS)`;
  const lines = entries
    .filter((entry) => entry.role !== "error")
    .map((entry) => `${entry.role === "user" ? "אני" : "העוזר"}: ${entry.content}`);
  // Keep the most recent messages when the whole conversation does not fit.
  const kept: string[] = [];
  let length = heading.length;
  for (const line of lines.reverse()) {
    if (length + line.length + 2 > limit && kept.length > 0) break;
    kept.unshift(line.slice(0, limit));
    length += line.length + 2;
  }
  return [heading, ...kept].join("\n\n");
}

/** Reveals an answer a few characters at a time, the way a reply arrives in a chat. */
function Typed({ text, onDone, onTick }: { text: string; onDone: () => void; onTick: () => void }) {
  const [shown, setShown] = useState(0);
  const done = useRef(onDone);
  const tick = useRef(onTick);
  useEffect(() => {
    done.current = onDone;
    tick.current = onTick;
  });
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      done.current();
      return;
    }
    // Long answers speed up so the reveal never takes more than a couple of seconds.
    const step = Math.max(2, Math.ceil(text.length / 90));
    let count = 0;
    const timer = setInterval(() => {
      count = Math.min(text.length, count + step);
      setShown(count);
      tick.current();
      if (count >= text.length) {
        clearInterval(timer);
        done.current();
      }
    }, 22);
    return () => clearInterval(timer);
  }, [text]);
  return <>{text.slice(0, shown)}</>;
}

const Ticks = () => (
  <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 6l3 3 6-7.5M6.5 8.2L7.5 9l6.5-7.5" />
  </svg>
);

/** The business chat: a text bar in the corner that grows into a full messaging-style panel on click or typing. */
export function AssistantChat({ businessName }: { businessName: string }) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const scrollToEnd = (behavior: ScrollBehavior = "smooth") => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior });
  };

  // Opening moves the caret into the panel, after whatever was typed in the bar;
  // closing hands focus back to the bar.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      const field = input.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    } else if (wasOpen.current) {
      launcher.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [entries, pending]);

  const openChat = () => {
    setOpenedAt((current) => current || now());
    setOpen(true);
  };

  const close = () => setOpen(false);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;
    const history: Entry[] = [...entries.map((entry) => ({ ...entry, fresh: false })), { role: "user", content: question, time: now() }];
    setEntries(history);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch("/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          messages: history.filter((entry) => entry.role !== "error").map(({ role, content }) => ({ role, content })),
        }),
      });
      const body = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      setEntries([
        ...history,
        body?.reply
          ? { role: "assistant", content: body.reply, time: now(), fresh: true }
          : { role: "error", content: body?.error ?? "משהו השתבש. נסו שוב בעוד רגע.", time: now() },
      ]);
    } catch {
      setEntries([...history, { role: "error", content: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.", time: now() }]);
    } finally {
      setPending(false);
      input.current?.focus();
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void send(draft);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  };

  const canShare = entries.some((entry) => entry.role === "assistant");
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(transcript(businessName, entries, WHATSAPP_LIMIT))}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(`שיחה עם העוזר של ${businessName}`)}&body=${encodeURIComponent(
    transcript(businessName, entries, MAIL_LIMIT),
  )}`;

  return (
    <>
      <form
        className="chat-launcher"
        data-open={open}
        inert={open}
        onClick={openChat}
        onSubmit={(event) => {
          event.preventDefault();
          openChat();
          void send(draft);
        }}
      >
        <span className="chat-avatar" aria-hidden="true">
          <LogoTile />
        </span>
        <input
          ref={launcher}
          type="text"
          className="chat-launcher-input"
          aria-label="שאלו את העוזר"
          aria-haspopup="dialog"
          placeholder="שאלו את העוזר"
          autoComplete="off"
          enterKeyHint="send"
          maxLength={2000}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            openChat();
          }}
        />
        <button type="submit" className="chat-send chat-launcher-send" data-empty={!draft.trim()} aria-label="שליחה לעוזר">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M21.4 11.1L4.3 3.2c-.8-.4-1.7.4-1.4 1.3L5 11l8 1-8 1-2.1 6.5c-.3.9.6 1.7 1.4 1.3l17.1-7.9c.8-.4.8-1.4 0-1.8z" transform="matrix(-1 0 0 1 24 0)" />
          </svg>
        </button>
      </form>

      <section
        id="assistant-panel"
        className="chat-panel"
        data-open={open}
        role="dialog"
        aria-label={`העוזר של ${businessName}`}
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <header className="frame-row site-header flex items-center gap-1 py-2.5 ps-3 pe-2">
          <span className="chat-avatar me-2" aria-hidden="true">
            <LogoTile />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">העוזר של {businessName}</p>
            <p className="truncate text-xs text-muted" aria-live="polite">
              {pending ? "מקליד…" : "מחובר · עונה מתוך נתוני העסק"}
            </p>
          </div>
          <a
            className="chat-head-btn is-whatsapp"
            href={canShare ? whatsappHref : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!canShare}
            aria-label="המשך השיחה בוואטסאפ"
            title={canShare ? "המשך בוואטסאפ" : "אפשר להמשיך בוואטסאפ אחרי התשובה הראשונה"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
            </svg>
          </a>
          <a
            className="chat-head-btn"
            href={canShare ? mailHref : undefined}
            aria-disabled={!canShare}
            aria-label="המשך השיחה באימייל"
            title={canShare ? "המשך באימייל" : "אפשר להמשיך באימייל אחרי התשובה הראשונה"}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M3.5 7.5l8.5 6 8.5-6" />
            </svg>
          </a>
          <button
            type="button"
            className="chat-head-btn"
            onClick={() => setEntries([])}
            disabled={pending || entries.length === 0}
            aria-disabled={pending || entries.length === 0}
            aria-label="שיחה חדשה"
            title="שיחה חדשה"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />
            </svg>
          </button>
          <button type="button" className="chat-head-btn" onClick={close} aria-label="סגירת הצ׳אט" title="סגירה">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div ref={log} className="chat-log">
          <span className="chat-day">היום</span>
          <p className="chat-bubble" data-role="assistant" data-first="true">
            היי, אני העוזר של {businessName}.{"\n"}אפשר לשאול אותי על המלאי, הקליטות, הקמפיינים והתשלומים.
            <span className="chat-meta">{openedAt}</span>
          </p>
          {entries.length === 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button key={suggestion} type="button" className="chat-chip" disabled={pending} onClick={() => void send(suggestion)}>
                  {suggestion}
                </button>
              ))}
            </div>
          )}
          {entries.map((entry, index) => {
            const previous = index === 0 ? "assistant" : entries[index - 1].role;
            const sameSide = (previous === "user") === (entry.role === "user");
            return (
              <p key={index} className="chat-bubble" data-role={entry.role} data-first={!sameSide}>
                <bdi>
                  {entry.fresh ? (
                    <Typed
                      text={entry.content}
                      onTick={() => scrollToEnd("instant")}
                      onDone={() =>
                        setEntries((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, fresh: false } : item)))
                      }
                    />
                  ) : (
                    entry.content
                  )}
                </bdi>
                <span className="chat-meta">
                  {entry.time}
                  {entry.role === "user" && <Ticks />}
                </span>
              </p>
            );
          })}
          {pending && (
            <p className="chat-bubble" data-role="assistant" data-first="true" aria-label="העוזר מקליד">
              <span className="chat-typing" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </p>
          )}
        </div>

        <form onSubmit={onSubmit} className="chat-compose">
          <label className="sr-only" htmlFor="assistant-input">
            הודעה לעוזר
          </label>
          <textarea
            ref={input}
            id="assistant-input"
            className="chat-input"
            rows={1}
            maxLength={2000}
            placeholder="הודעה"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="submit" className="chat-send" disabled={pending || !draft.trim()} aria-label="שליחה">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M21.4 11.1L4.3 3.2c-.8-.4-1.7.4-1.4 1.3L5 11l8 1-8 1-2.1 6.5c-.3.9.6 1.7 1.4 1.3l17.1-7.9c.8-.4.8-1.4 0-1.8z" transform="matrix(-1 0 0 1 24 0)" />
            </svg>
          </button>
        </form>
      </section>
    </>
  );
}
