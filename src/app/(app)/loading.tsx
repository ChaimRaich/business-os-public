/** Shown at once on every navigation inside the app, while the screen's data loads. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-live="polite">
      <span className="sr-only">טוען…</span>
      <div className="h-10 w-56 max-w-full animate-pulse rounded-lg bg-line motion-reduce:animate-none" aria-hidden />
      <div className="card h-32 animate-pulse motion-reduce:animate-none" aria-hidden />
      <div className="card h-64 animate-pulse motion-reduce:animate-none" aria-hidden />
    </div>
  );
}
