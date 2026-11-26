"use client";

import { Building2 } from "lucide-react";

export function BusinessSwitcher({
  action,
  businesses,
  activeId,
}: {
  action: (formData: FormData) => Promise<void>;
  businesses: { id: string; name: string }[];
  activeId: string;
}) {
  return (
    <form action={action} className="relative">
      <label className="sr-only" htmlFor="business_id">
        העסק הפעיל
      </label>
      <Building2
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-accent"
        aria-hidden
      />
      <select
        id="business_id"
        name="business_id"
        defaultValue={activeId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="field min-h-10 w-full cursor-pointer bg-surface-subtle/70 py-2 ps-9 pe-3 text-sm font-semibold"
      >
        {businesses.map((business) => (
          <option key={business.id} value={business.id}>
            {business.name}
          </option>
        ))}
      </select>
    </form>
  );
}
