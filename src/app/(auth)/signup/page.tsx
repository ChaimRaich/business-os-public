import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { signup } from "../actions";

export const metadata: Metadata = { title: "הרשמה" };

export default function SignupPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">פתיחת חשבון</h1>
        <p className="mt-1.5 text-sm text-muted">התחילו לנהל קליטת סחורה ומלאי תוך דקה.</p>
      </div>
      <ActionForm action={signup} submitLabel="יצירת חשבון" submitClassName="btn mt-1 w-full" className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="full_name">שם מלא</label>
          <input className="field" id="full_name" name="full_name" autoComplete="name" placeholder="דניאל כהן" />
        </div>
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
            autoComplete="new-password"
            minLength={8}
            placeholder="לפחות 8 תווים"
            required
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="mt-1.5 text-xs text-muted">לפחות 8 תווים.</p>
        </div>
      </ActionForm>
      <p className="mt-6 border-t border-line pt-5 text-center text-sm text-muted">
        כבר יש לכם חשבון?{" "}
        <Link className="font-semibold text-accent underline-offset-4 hover:underline" href="/login">
          התחברות
        </Link>
      </p>
    </>
  );
}
