/** The mark: a "B" whose stem is a text cursor. Sized by its `.logo-tile` box. */
export function LogoTile({ className = "" }: { className?: string }) {
  return (
    <span className={`logo-tile ${className}`.trim()} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" focusable="false">
        <rect className="logo-cursor" x="4.6" y="4" width="3.2" height="16" rx="1" />
        <path
          className="logo-bowls"
          d="M11.2 5.2h3a3.2 3.2 0 0 1 0 6.4h-3m0 0h4.2a3.6 3.6 0 0 1 0 7.2h-4.2"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
