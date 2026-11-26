export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center text-sm font-semibold tracking-[0.2em] text-accent">
          BUSINESS OS
        </p>
        <div className="card">{children}</div>
      </div>
    </main>
  );
}
