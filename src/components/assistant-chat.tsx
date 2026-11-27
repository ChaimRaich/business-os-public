"use client";

import { Boxes, ChevronRight, Megaphone, ShoppingBag, Star, Truck, Users, Wallet, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type KeyboardEvent } from "react";
import { LogoTile } from "@/components/logo";
import { channelById, channelsFor, isChannelId, type ChannelId } from "@/lib/assistant-channels";

type Entry = { role: "user" | "assistant" | "error"; content: string; at: number };
type Chats = Partial<Record<ChannelId, Entry[]>>;

const CHANNEL_ICONS: Record<Exclude<ChannelId, "main">, LucideIcon> = {
  inventory: Boxes,
  receiving: Truck,
  sales: ShoppingBag,
  marketing: Megaphone,
  customers: Users,
  money: Wallet,
};

// ---------------------------------------------------------------------------
// The conversations live in this browser, per user and business, so every chat
// keeps its history and its preview line across pages and reloads.
// ---------------------------------------------------------------------------

const STORAGE_PREFIX = "bos-chats:";
const MAX_STORED = 60;
const EMPTY: Chats = {};

let loadedKey: string | null = null;
let chats: Chats = EMPTY;
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

function forgetChats(keep?: string) {
  try {
    const user = keep?.slice(0, keep.lastIndexOf(":") + 1);
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(STORAGE_PREFIX) && !(user && key.startsWith(user))) localStorage.removeItem(key);
    }
  } catch {
    // Storage is blocked: the chats simply last until the page is reloaded.
  }
}

function load(key: string): Chats {
  // Whoever signs in on a shared computer must not find the previous user's chats.
  forgetChats(key);
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (typeof stored !== "object" || stored === null) return EMPTY;
    const result: Chats = {};
    for (const [id, list] of Object.entries(stored)) {
      if (!isChannelId(id) || !Array.isArray(list)) continue;
      result[id] = list.filter(
        (item): item is Entry =>
          typeof item === "object" &&
          item !== null &&
          (item.role === "user" || item.role === "assistant") &&
          typeof item.content === "string" &&
          typeof item.at === "number",
      );
    }
    return result;
  } catch {
    return EMPTY;
  }
}

function readChats(key: string): Chats {
  if (loadedKey !== key) {
    loadedKey = key;
    chats = load(key);
  }
  return chats;
}

function updateChats(key: string, change: (current: Chats) => Chats) {
  chats = change(readChats(key));
  try {
    const stored = Object.fromEntries(
      Object.entries(chats).map(([id, list]) => [id, list.filter((entry) => entry.role !== "error").slice(-MAX_STORED)]),
    );
    localStorage.setItem(key, JSON.stringify(stored));
  } catch {
    // Full or blocked storage: the chat still works for this visit.
  }
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------

const timeOf = (at: number) => new Date(at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
const dayOf = (at: number) => new Date(at).toDateString();

/** "היום" / "אתמול" / a date, measured from the moment the panel was opened. */
function dayLabel(at: number, now: number): string {
  if (dayOf(at) === dayOf(now)) return "היום";
  if (dayOf(at) === dayOf(now - 86_400_000)) return "אתמול";
  return new Date(at).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "2-digit" });
}

// Share links carry the conversation in the URL, so it is cut to what mail clients and WhatsApp accept.
const WHATSAPP_LIMIT = 3000;
const MAIL_LIMIT = 1700;

function transcript(heading: string, entries: Entry[], limit: number): string {
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

const CloseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

function ChannelAvatar({ id }: { id: ChannelId }) {
  if (id === "main") {
    return (
      <span className="chat-ava" data-channel="main" aria-hidden="true">
        <LogoTile />
        <span className="chat-ava-star">
          <Star size={10} fill="currentColor" strokeWidth={0} />
        </span>
      </span>
    );
  }
  const Icon = CHANNEL_ICONS[id];
  return (
    <span className="chat-ava" data-channel={id} aria-hidden="true">
      <Icon size={19} strokeWidth={2.1} />
    </span>
  );
}

/**
 * The business chats: a text bar in the corner that grows into a messaging-style panel.
 * One main chat knows the whole business, and every area has a chat of its own.
 */
export function AssistantChat({
  businessName,
  businessId,
  userId,
  canManage,
}: {
  businessName: string;
  businessId: string;
  userId: string;
  canManage: boolean;
}) {
  const storageKey = `${STORAGE_PREFIX}${userId}:${businessId}`;
  const allChats = useSyncExternalStore(
    subscribe,
    () => readChats(storageKey),
    () => EMPTY,
  );
  const channels = channelsFor(canManage);

  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [active, setActive] = useState<ChannelId>("main");
  // Narrow screens show one pane at a time; wide screens show the list beside the conversation.
  const [view, setView] = useState<"list" | "chat">("chat");
  const [pending, setPending] = useState<ChannelId[]>([]);
  const [unread, setUnread] = useState<ChannelId[]>([]);
  /** The answer that is being revealed right now, by its timestamp. */
  const [typing, setTyping] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const launcher = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  const channel = channelById(active);
  const entries = allChats[active] ?? [];
  const waiting = pending.includes(active);

  // What the user is looking at when an answer lands, read from the request that brings it.
  const watching = useRef<ChannelId | null>(null);
  useEffect(() => {
    watching.current = open && view === "chat" ? active : null;
  });

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
  }, [open, active, view]);

  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [entries.length, waiting]);
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "instant" });
  }, [active, open]);

  // Signing out leaves nothing of the conversations behind in the browser.
  useEffect(() => {
    const onSubmit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement && event.target.matches("[data-logout]")) forgetChats();
    };
    document.addEventListener("submit", onSubmit);
    return () => document.removeEventListener("submit", onSubmit);
  }, []);

  const openChat = () => {
    setOpenedAt(Date.now());
    setOpen(true);
    setView("chat");
    setUnread((current) => current.filter((id) => id !== active));
  };

  const close = () => setOpen(false);

  const pick = (id: ChannelId) => {
    setActive(id);
    setView("chat");
    setTyping(null);
    setUnread((current) => current.filter((item) => item !== id));
  };

  const send = async (text: string) => {
    const target = active;
    const question = text.trim();
    if (!question || pending.includes(target)) return;
    const history: Entry[] = [...(readChats(storageKey)[target] ?? []), { role: "user", content: question, at: Date.now() }];
    const append = (entry: Entry) =>
      updateChats(storageKey, (current) => ({ ...current, [target]: [...(current[target] ?? []), entry] }));
    updateChats(storageKey, (current) => ({ ...current, [target]: history }));
    setDraft("");
    setTyping(null);
    setPending((current) => [...current, target]);
    try {
      const response = await fetch("/assistant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          channel: target,
          messages: history.filter((entry) => entry.role !== "error").map(({ role, content }) => ({ role, content })),
        }),
      });
      const body = (await response.json().catch(() => null)) as { reply?: string; error?: string } | null;
      const at = Date.now();
      if (body?.reply) {
        append({ role: "assistant", content: body.reply, at });
        if (watching.current === target) setTyping(at);
        else setUnread((current) => (current.includes(target) ? current : [...current, target]));
      } else {
        append({ role: "error", content: body?.error ?? "משהו השתבש. נסו שוב בעוד רגע.", at });
      }
    } catch {
      append({ role: "error", content: "אין חיבור לשרת. בדקו את החיבור ונסו שוב.", at: Date.now() });
    } finally {
      setPending((current) => current.filter((id) => id !== target));
      if (watching.current === target) input.current?.focus();
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

  const title = active === "main" ? `העוזר של ${businessName}` : `${channel.name} · ${businessName}`;
  const shareHeading = `שיחה עם העוזר של ${businessName}${active === "main" ? "" : `, צ׳אט ${channel.name}`} (Business OS)`;
  const canShare = entries.some((entry) => entry.role === "assistant");
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(transcript(shareHeading, entries, WHATSAPP_LIMIT))}`;
  const mailHref = `mailto:?subject=${encodeURIComponent(shareHeading)}&body=${encodeURIComponent(transcript(shareHeading, entries, MAIL_LIMIT))}`;

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
        {unread.length > 0 && (
          <span className="chat-unread" aria-label={`${unread.length} תשובות חדשות`}>
            {unread.length}
          </span>
        )}
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
        data-view={view}
        role="dialog"
        aria-label={`הצ׳אטים של ${businessName}`}
        aria-hidden={!open}
        inert={!open}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
        }}
      >
        <nav className="chat-list" aria-label="הצ׳אטים של העסק">
          <div className="chat-list-head">
            <p className="font-medium">הצ׳אטים של העסק</p>
            <button type="button" className="chat-head-btn chat-narrow-only" onClick={close} aria-label="סגירת הצ׳אט" title="סגירה">
              <CloseIcon />
            </button>
          </div>
          <ul className="chat-rows">
            {channels.map((item) => {
              const list = allChats[item.id] ?? [];
              const last = list[list.length - 1];
              const busy = pending.includes(item.id);
              const fresh = unread.includes(item.id);
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="chat-row"
                    data-main={item.id === "main"}
                    aria-current={active === item.id ? "true" : undefined}
                    onClick={() => pick(item.id)}
                  >
                    <ChannelAvatar id={item.id} />
                    <span className="chat-row-text">
                      <span className="chat-row-name">{item.name}</span>
                      <span className="chat-row-preview" data-fresh={fresh}>
                        {busy ? "מקליד…" : last ? `${last.role === "user" ? "אתם: " : ""}${last.content.replace(/\s+/g, " ")}` : item.about}
                      </span>
                    </span>
                    {(last || fresh) && (
                      <span className="chat-row-side">
                        {last && <span>{dayOf(last.at) === dayOf(openedAt) ? timeOf(last.at) : dayLabel(last.at, openedAt)}</span>}
                        {fresh && <span className="chat-row-dot" aria-label="תשובה חדשה" />}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="chat-thread">
          <header className="frame-row site-header flex items-center gap-1 py-2.5 ps-2 pe-2">
            <button type="button" className="chat-head-btn chat-narrow-only" onClick={() => setView("list")} aria-label="לכל הצ׳אטים" title="כל הצ׳אטים">
              <ChevronRight size={22} aria-hidden="true" />
              {unread.length > 0 && <span className="chat-row-dot chat-back-dot" />}
            </button>
            <span className="chat-avatar ms-1 me-2">
              <ChannelAvatar id={active} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium leading-tight">{title}</p>
              <p className="truncate text-xs text-muted" aria-live="polite">
                {waiting ? "מקליד…" : `עונה מתוך נתוני העסק · ${channel.about}`}
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
              onClick={() => updateChats(storageKey, (current) => ({ ...current, [active]: [] }))}
              disabled={waiting || entries.length === 0}
              aria-disabled={waiting || entries.length === 0}
              aria-label="שיחה חדשה בצ׳אט הזה"
              title="שיחה חדשה"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5" />
              </svg>
            </button>
            <button type="button" className="chat-head-btn" onClick={close} aria-label="סגירת הצ׳אט" title="סגירה">
              <CloseIcon />
            </button>
          </header>

          <div ref={log} className="chat-log">
            <p key={active} className="chat-bubble" data-role="assistant" data-first="true">
              {active === "main" ? `היי, אני העוזר של ${businessName}.` : `זה הצ׳אט של ${channel.name}.`}
              {"\n"}
              {channel.greeting}
            </p>
            {entries.length === 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {channel.suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" className="chat-chip" disabled={waiting} onClick={() => void send(suggestion)}>
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {entries.map((entry, index) => {
              const previous = entries[index - 1];
              const newDay = !previous || dayOf(previous.at) !== dayOf(entry.at);
              const sameSide = !newDay && ((previous?.role ?? "assistant") === "user") === (entry.role === "user");
              return (
                <div key={`${entry.at}-${index}`} className="contents">
                  {newDay && <span className="chat-day">{dayLabel(entry.at, openedAt)}</span>}
                  <p className="chat-bubble" data-role={entry.role} data-first={!sameSide}>
                    <bdi>
                      {entry.at === typing ? (
                        <Typed text={entry.content} onTick={() => scrollToEnd("instant")} onDone={() => setTyping(null)} />
                      ) : (
                        entry.content
                      )}
                    </bdi>
                    <span className="chat-meta">
                      {timeOf(entry.at)}
                      {entry.role === "user" && <Ticks />}
                    </span>
                  </p>
                </div>
              );
            })}
            {waiting && (
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
              הודעה לצ׳אט {channel.name}
            </label>
            <textarea
              ref={input}
              id="assistant-input"
              className="chat-input"
              rows={1}
              maxLength={2000}
              placeholder={active === "main" ? "הודעה" : `הודעה לצ׳אט ${channel.name}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={onKeyDown}
            />
            <button type="submit" className="chat-send" disabled={waiting || !draft.trim()} aria-label="שליחה">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M21.4 11.1L4.3 3.2c-.8-.4-1.7.4-1.4 1.3L5 11l8 1-8 1-2.1 6.5c-.3.9.6 1.7 1.4 1.3l17.1-7.9c.8-.4.8-1.4 0-1.8z" transform="matrix(-1 0 0 1 24 0)" />
              </svg>
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
