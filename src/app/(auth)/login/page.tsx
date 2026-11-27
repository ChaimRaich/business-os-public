import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { login } from "../actions";

export const metadata: Metadata = { title: "התחברות" };

export default function LoginPage() {
  return (
    <>
      <h1 className="mb-5 text-xl font-bold">התחברות</h1>
      <ActionForm action={login} submitLabel="התחברות" className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="email">אימייל</label>
          <input className="field" id="email" name="email" type="email" dir="ltr" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">סיסמה</label>
          <input className="field" id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required />
        </div>
      </ActionForm>
      <p className="mt-5 text-sm text-muted">
        אין לכם חשבון?{" "}
        <Link className="font-medium text-accent underline-offset-4 hover:underline" href="/signup">
          הרשמה
        </Link>
      </p>
    </>
  );
}
