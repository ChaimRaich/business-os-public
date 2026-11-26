import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { signup } from "../actions";

export const metadata: Metadata = { title: "הרשמה" };

export default function SignupPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-bold">פתיחת חשבון</h1>
      <ActionForm action={signup} submitLabel="הרשמה" className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="full_name">שם מלא</label>
          <input className="field" id="full_name" name="full_name" autoComplete="name" />
        </div>
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input className="field" id="email" name="email" type="email" dir="ltr" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">סיסמה</label>
          <input className="field" id="password" name="password" type="password" dir="ltr" autoComplete="new-password" minLength={8} required aria-describedby="password-hint" />
          <p id="password-hint" className="mt-1.5 text-xs text-muted">לפחות 8 תווים.</p>
        </div>
      </ActionForm>
      <p className="mt-5 text-sm text-muted">
        כבר יש לכם חשבון?{" "}
        <Link className="font-medium text-accent underline-offset-4 hover:underline" href="/login">
          התחברות
        </Link>
      </p>
    </>
  );
}
