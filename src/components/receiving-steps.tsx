const STEPS = ["העלאת המסמך", "קריאה", "בדיקה ואישור", "קובץ לקופה"] as const;

/** Where a receipt stands on its way from a paper document to the till. */
export function ReceivingSteps({ current, done = false }: { current: 0 | 1 | 2 | 3; done?: boolean }) {
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="שלבי הקליטה">
      {STEPS.map((label, index) => {
        const state = done || index < current ? "done" : index === current ? "current" : "todo";
        return (
          <li
            key={label}
            aria-current={state === "current" ? "step" : undefined}
            className={`flex items-center gap-2 ${index < STEPS.length - 1 ? "flex-1" : ""}`}
          >
            <span
              className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums ${
                state === "current"
                  ? "bg-ink text-canvas"
                  : state === "done"
                    ? "bg-accent-soft text-accent-strong"
                    : "border border-line text-muted"
              }`}
            >
              {state === "done" ? "✓" : index + 1}
            </span>
            <span
              className={`whitespace-nowrap ${
                state === "current" ? "font-semibold text-ink" : "hidden text-muted sm:inline"
              }`}
            >
              {label}
              {state === "done" && <span className="sr-only"> (הושלם)</span>}
            </span>
            {index < STEPS.length - 1 && <span className="h-px min-w-3 flex-1 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
