/** The fields of one till department, as the till defines it. Used in settings and on the till-file screen. */
export function PosDepartmentFields() {
  return (
    <>
      <div>
        <label className="label" htmlFor="department-code">קוד</label>
        <input className="field w-24" id="department-code" name="code" dir="ltr" inputMode="numeric" placeholder="11" maxLength={9} required />
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <label className="label" htmlFor="department-name">מחלקה</label>
        <input className="field" id="department-name" name="department" placeholder="תכשיטי כסף" maxLength={80} required />
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <label className="label" htmlFor="department-sub">תת מחלקה</label>
        <input className="field" id="department-sub" name="sub_department" placeholder="טבעות" maxLength={80} required />
      </div>
      <div className="min-w-0 flex-1 basis-36">
        <label className="label" htmlFor="department-item">שם פריט מוצע</label>
        <input className="field" id="department-item" name="item_name" placeholder="טבעת כסף" maxLength={80} />
      </div>
    </>
  );
}
