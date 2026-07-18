// Czech number formatting used across the Precision screens — matches the
// design-B mockup exactly: narrow-space thousands ("3 639 W"), decimal comma.
const nfW = new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// "3 639" (no unit) — em dash when the value is missing.
export function fmtNum(v) {
  return v == null || !Number.isFinite(v) ? '—' : nfW.format(v);
}

// "3 639 W"
export function fmtW(v) {
  return v == null || !Number.isFinite(v) ? '—' : `${nfW.format(v)} W`;
}

// "26,0" (one decimal, comma)
export function fmt1(v) {
  return v == null || !Number.isFinite(v) ? '—' : nf1.format(v);
}

// "+2 143 W" — explicit sign, used for battery/surplus flows.
export function fmtSignedW(v) {
  if (v == null || !Number.isFinite(v)) return '—';
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${nfW.format(Math.abs(v))} W`;
}

// Backend daily-energy fields arrive as pre-formatted strings with a dot
// decimal ("17.89") — re-punctuate to the Czech comma the mockup uses.
export function czStr(s) {
  return s == null ? '—' : String(s).replace('.', ',');
}
