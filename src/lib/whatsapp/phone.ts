// Canonical phone normalisation so conversation lookup is an exact match, not a
// fragile substring search. Produces E.164 digits without the "+" (what the
// WhatsApp Cloud API also expects in the `to` field), defaulting to India (+91).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.length === 10) d = "91" + d; // bare 10-digit Indian mobile
  else if (d.length === 11 && d.startsWith("0")) d = "91" + d.slice(1); // 0-prefixed
  return d;
}
