"use client";

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
    <form action={action}>
      <label className="sr-only" htmlFor="business_id">
        העסק הפעיל
      </label>
      <select
        id="business_id"
        name="business_id"
        defaultValue={activeId}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
        className="field min-h-11 max-w-44 py-2 text-sm font-medium sm:max-w-60"
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
