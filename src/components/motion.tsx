"use client";

import { LogoTile } from "@/components/logo";
import { Children, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

/** Reveals `.reveal` elements as they scroll into view, including ones streamed in later. */
export function RevealObserver() {
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-in", "");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const scan = () => {
      document.querySelectorAll(".reveal:not([data-in])").forEach((element) => io.observe(element));
    };
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}

export function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private mode: the choice simply lasts for this page.
    }
  };
  return (
    <button type="button" onClick={toggle} className="icon-btn" aria-label="החלפה בין מצב בהיר לכהה" title="בהיר / כהה">
      <svg className="theme-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
      </svg>
      <svg className="theme-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}

/**
 * The sticky top bar. Once the page is scrolled it lets go of the frame and floats as a
 * compact pill; back at the top it grows to full size again. The look is in CSS (`data-compact`).
 */
export function SiteHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = ref.current;
    if (!header) return;
    let compact = false;
    // Two thresholds, so the bar doesn't flicker when the page rests near one of them.
    const update = () => {
      if (!compact && scrollY > 48) {
        compact = true;
        // Hold the full height, so the page underneath doesn't jump while the bar shrinks.
        header.style.height = `${header.offsetHeight}px`;
        header.dataset.compact = "";
      } else if (compact && scrollY < 8) {
        compact = false;
        header.style.height = "";
        delete header.dataset.compact;
      }
    };
    update();
    addEventListener("scroll", update, { passive: true });
    return () => removeEventListener("scroll", update);
  }, []);
  return (
    <header ref={ref} className="frame-row site-header sticky top-0 z-40">
      {children}
    </header>
  );
}

const restart = (element: HTMLElement, key: string, value: string) => {
  element.dataset[key] = "";
  element.getBoundingClientRect(); // Flush, so setting the same value again replays the animation.
  element.dataset[key] = value;
};

/**
 * The strip under the page: the logo drifts around it like an old screensaver, and
 * lights up in color whenever it hits a wall. Runs only while it is on screen.
 */
export function FooterArt() {
  const stageRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    const mark = markRef.current;
    const art = artRef.current;
    const ring = ringRef.current;
    if (!stage || !mark || !art || !ring) return;

    let width = stage.clientWidth;
    let height = stage.clientHeight;
    let size = mark.offsetWidth;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let x = (width - size) * (still ? 0.5 : Math.random());
    let y = (height - size) * (still ? 0.5 : Math.random());
    let vx = Math.random() < 0.5 ? -105 : 105;
    let vy = Math.random() < 0.5 ? -78 : 78;
    const place = () => {
      mark.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    };
    place();
    stage.dataset.ready = "";
    if (still) {
      stage.dataset.still = "";
      return;
    }

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const maxX = Math.max(width - size, 0);
      const maxY = Math.max(height - size, 0);
      x += vx * dt;
      y += vy * dt;
      const hitX = x <= 0 || x >= maxX;
      const hitY = y <= 0 || y >= maxY;
      if (hitX) {
        vx = x <= 0 ? Math.abs(vx) : -Math.abs(vx);
        x = Math.min(Math.max(x, 0), maxX);
      }
      if (hitY) {
        vy = y <= 0 ? Math.abs(vy) : -Math.abs(vy);
        y = Math.min(Math.max(y, 0), maxY);
      }
      place();
      if (hitX || hitY) {
        restart(art, "hit", hitX && hitY ? "corner" : hitX ? "x" : "y");
        ring.style.left = `${hitX ? (x === 0 ? 0 : width) : x + size / 2}px`;
        ring.style.top = `${hitY ? (y === 0 ? 0 : height) : y + size / 2}px`;
        restart(ring, "on", "true");
      }
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (!entry.isIntersecting) return;
      last = performance.now();
      frame = requestAnimationFrame(tick);
    });
    io.observe(stage);
    const ro = new ResizeObserver(() => {
      width = stage.clientWidth;
      height = stage.clientHeight;
      size = mark.offsetWidth;
    });
    ro.observe(stage);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={stageRef} className="footer-art" aria-hidden="true">
      <div ref={markRef} className="dvd-mark">
        <div ref={artRef} className="dvd-art">
          <LogoTile className="dvd-gray" />
          <LogoTile className="dvd-color" />
        </div>
      </div>
      <span ref={ringRef} className="dvd-ring" />
    </div>
  );
}

/** Tilts its 3D child toward the pointer. */
export function TiltScene({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (tx: number, ty: number) => {
    ref.current?.style.setProperty("--tx", `${tx}deg`);
    ref.current?.style.setProperty("--ty", `${ty}deg`);
  };
  return (
    <div
      ref={ref}
      className="scene3d"
      aria-hidden="true"
      onPointerMove={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - box.left) / box.width - 0.5;
        const y = (event.clientY - box.top) / box.height - 0.5;
        set(x * 24, y * -14);
      }}
      onPointerLeave={() => set(0, 0)}
    >
      {children}
    </div>
  );
}

export type ShowcaseTab = { id: string; label: string; glyph: string; tone: string };

/** Tabbed product showcase that advances on its own; hovering or focusing it pauses the timer. */
export function Showcase({ tabs, children }: { tabs: ShowcaseTab[]; children: ReactNode }) {
  const [active, setActive] = useState(0);
  const panels = Children.toArray(children);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Right-to-left tab order: the left arrow moves forward.
    const step = event.key === "ArrowLeft" ? 1 : event.key === "ArrowRight" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (active + step + tabs.length) % tabs.length;
    setActive(next);
    buttons.current[next]?.focus();
  };

  return (
    <div className="showcase">
      <div role="tablist" aria-label="הדגמות" className="tabs" onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={`panel-${tab.id}`}
            tabIndex={index === active ? 0 : -1}
            className="tab"
            onClick={() => setActive(index)}
          >
            <span className="glyph" style={{ "--glyph": tab.tone } as CSSProperties} aria-hidden="true">
              {tab.glyph}
            </span>
            {tab.label}
            <span
              key={`${tab.id}-${active}`}
              className="tab-progress"
              onAnimationEnd={() => setActive((index + 1) % tabs.length)}
            />
          </button>
        ))}
      </div>
      <div
        key={tabs[active].id}
        role="tabpanel"
        id={`panel-${tabs[active].id}`}
        aria-labelledby={`tab-${tabs[active].id}`}
        className="panel-in mt-4"
      >
        {panels[active]}
      </div>
    </div>
  );
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Scroll-linked effects. Publishes progress as CSS variables and leaves the look to CSS:
 * `--page-p` on <html>, and `--enter` / `--read` / `--out` on every `[data-fx]` element.
 * Also tracks the pointer over `.spot` cards for their glow.
 */
export function ScrollFx() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const root = document.documentElement;
    let frame = 0;
    const update = () => {
      frame = 0;
      const vh = innerHeight;
      const max = root.scrollHeight - vh;
      root.style.setProperty("--page-p", max > 0 ? (scrollY / max).toFixed(4) : "0");
      document.querySelectorAll<HTMLElement>("[data-fx]").forEach((element) => {
        const box = element.getBoundingClientRect();
        if (box.bottom < -vh || box.top > vh * 2) return;
        element.style.setProperty("--enter", clamp((vh - box.top) / (vh * 0.6)).toFixed(4));
        element.style.setProperty("--read", clamp((vh * 0.85 - box.top) / (box.height + vh * 0.3)).toFixed(4));
        element.style.setProperty("--out", clamp(-box.top / Math.max(box.height, 1)).toFixed(4));
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onPointer = (event: PointerEvent) => {
      const card = (event.target as Element | null)?.closest?.<HTMLElement>(".spot");
      if (!card) return;
      const box = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${event.clientX - box.left}px`);
      card.style.setProperty("--my", `${event.clientY - box.top}px`);
    };
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);
    document.addEventListener("pointermove", onPointer, { passive: true });
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    update();
    return () => {
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      document.removeEventListener("pointermove", onPointer);
      mo.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return <div className="scroll-bar" aria-hidden="true" />;
}

/** A headline line whose phrase swaps in place every few seconds. */
export function RotatingText({ phrases, interval = 2600 }: { phrases: string[]; interval?: number }) {
  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState(-1);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      setActive((current) => {
        setPrevious(current);
        return (current + 1) % phrases.length;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [phrases.length, interval]);
  return (
    <span className="rotator">
      <span className="sr-only">{phrases.join(" ")}</span>
      {phrases.map((phrase, index) => (
        <span key={phrase} aria-hidden="true" data-state={index === active ? "in" : index === previous ? "out" : "idle"}>
          {phrase}
        </span>
      ))}
    </span>
  );
}

/** Counts up to `value` the first time it scrolls into view. */
export function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const element = ref.current;
    if (!element || value === 0 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = clamp((now - start) / 1100);
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(element);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return <span ref={ref}>{shown}</span>;
}

/**
 * Scroll story: the steps scroll past while the visual stays pinned, and the step
 * nearest the middle of the screen becomes `data-active` for CSS to pick up.
 */
export function Story({ steps, children }: { steps: { title: string; body: string }[]; children: ReactNode }) {
  const [active, setActive] = useState(0);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    items.current.forEach((item) => item && io.observe(item));
    return () => io.disconnect();
  }, []);
  return (
    <div className="story grid gap-x-10 lg:grid-cols-2" data-active={active} data-fx suppressHydrationWarning>
      <ol className="order-2 lg:order-1">
        {steps.map((step, index) => (
          <li
            key={step.title}
            ref={(element) => {
              items.current[index] = element;
            }}
            data-index={index}
            data-on={index === active}
            className="story-step flex gap-5 py-6 lg:min-h-[62vh] lg:items-center lg:py-0"
          >
            <span className="display text-5xl tabular-nums" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <span className="display block text-2xl sm:text-3xl">{step.title}</span>
              <span className="mt-2 block max-w-md leading-relaxed text-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
      <div className="order-1 lg:sticky lg:top-28 lg:order-2 lg:h-[62vh] lg:self-start">{children}</div>
    </div>
  );
}

const SECTIONS = [
  { id: "initiative", label: "יוזמות" },
  { id: "how", label: "איך זה עובד" },
  { id: "features", label: "יכולות" },
  { id: "faq", label: "שאלות" },
  { id: "start", label: "מתחילים" },
];

/** Dots along the side that show which landing section is on screen and jump to it. */
export function SectionDots() {
  const [active, setActive] = useState("");
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const section of SECTIONS) {
      const element = document.getElementById(section.id);
      if (element) io.observe(element);
    }
    return () => io.disconnect();
  }, []);
  return (
    <nav className="section-dots" aria-label="מקטעי העמוד">
      {SECTIONS.map((section) => (
        <a key={section.id} href={`#${section.id}`} aria-current={section.id === active ? "true" : undefined}>
          <span>{section.label}</span>
        </a>
      ))}
    </nav>
  );
}
