import type { Metadata } from "next";
import Link from "next/link";
import { CreateBusinessCard } from "@/components/create-business-card";

export const metadata: Metadata = { title: "עסק נוסף" };

export default function NewBusinessPage() {
  return (
    <CreateBusinessCard
      footer={
        <Link href="/" className="inline-flex min-h-11 items-center px-3 underline-offset-4 hover:underline">
          חזרה
        </Link>
      }
    />
  );
}
