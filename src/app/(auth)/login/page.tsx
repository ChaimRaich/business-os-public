import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "התחברות" };

export default function LoginPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">התחברות לחשבון</h1>
        <p className="mt-1.5 text-sm text-muted">הזינו אימייל וסיסמה כדי להיכנס לסביבת העבודה.</p>
      </div>
      <ActionForm action={login} submitLabel="התחברות" submitClassName="btn mt-1 w-full" className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input
            className="field"
            id="email"
            name="email"
            type="email"
            dir="ltr"
            autoComplete="email"
            placeholder="name@business.co.il"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="password">סיסמה</label>
          <input
            className="field"
            id="password"
            name="password"
            type="password"
            dir="ltr"
            autoComplete="current-password"
            placeholder="••••••••"
            required
          />
        </div>
      </ActionForm>
      <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
        אין לכם חשבון?{" "}
        <Link className="font-semibold text-accent underline-offset-4 hover:underline" href="/signup">
          פתיחת חשבון חדש
        </Link>
      </p>
    </>
  );
}
