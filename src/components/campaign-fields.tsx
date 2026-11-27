type Values = {
  name: string;
  goal: string | null;
  starts_on: string;
  ends_on: string;
  budget: number | null;
  spent: number | null;
};

/** Shared by the new-campaign form and the campaign's own page. */
type Draft = Pick<Values, "name" | "goal" | "starts_on" | "ends_on">;

/** `draft` pre-fills a campaign the system prepared; unlike `values` it is not an existing campaign. */
export function CampaignFields({ values, defaultStart, draft }: { values?: Values; defaultStart?: string; draft?: Draft }) {
  return (
    <>
      <label className="sm:col-span-2">
        <span className="label">שם הקמפיין</span>
        <input name="name" required maxLength={120} defaultValue={values?.name ?? draft?.name} placeholder="למשל: קולקציית חנוכה" className="field" />
      </label>
      <label>
        <span className="label">מתחיל ב</span>
        <input type="date" name="starts_on" required defaultValue={values?.starts_on ?? draft?.starts_on ?? defaultStart} className="field" />
      </label>
      <label>
        <span className="label">מסתיים ב</span>
        <input type="date" name="ends_on" required defaultValue={values?.ends_on ?? draft?.ends_on ?? defaultStart} className="field" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">מה רוצים להשיג</span>
        <textarea name="goal" rows={2} maxLength={500} defaultValue={values?.goal ?? draft?.goal ?? ""} placeholder="למשל: להביא לקוחות לחנות לפני החג ולהציג את הטבעות החדשות" className="field" />
      </label>
      <label>
        <span className="label">תקציב פרסום (₪)</span>
        <input name="budget" inputMode="decimal" dir="ltr" defaultValue={values?.budget ?? ""} className="field text-end" />
      </label>
      {values && (
        <label>
          <span className="label">הוצאה בפועל (₪)</span>
          <input name="spent" inputMode="decimal" dir="ltr" defaultValue={values.spent ?? ""} className="field text-end" />
        </label>
      )}
    </>
  );
}
