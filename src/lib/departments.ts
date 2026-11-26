/** The department mapping as it appears in the POS sample file (SPEC 13.4). Bracelets have none yet. */
export const SAMPLE_DEPARTMENTS = [
  { product_type: "ring", code: 11, department: "תכשיטי כסף", sub_department: "טבעות" },
  { product_type: "earring", code: 8, department: "תכשיטי כסף", sub_department: "עגילים" },
  { product_type: "necklace", code: 13, department: "תכשיטי כסף", sub_department: "שרשראות" },
] as const;
