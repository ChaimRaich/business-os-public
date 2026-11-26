export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-white shadow-xs dark:text-[#041815]">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
          <path d="M12 12 4 7.5" />
          <path d="M12 12l8-4.5" />
          <path d="M12 12v9" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className="text-sm font-extrabold tracking-[0.14em] text-ink">BUSINESS OS</span>
        {!compact && <span className="mt-1 text-[11px] font-medium text-muted">ניהול מלאי וקליטה</span>}
      </span>
    </span>
  );
}
