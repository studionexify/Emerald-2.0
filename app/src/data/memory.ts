/**
 * Autofill memory, used across Emerald: once something is typed, the next time the same name (customer, vendor,
 * printer, spool colour…) is entered, the details that went with it fill themselves in. Nothing is stored separately —
 * the memory is the records themselves, so editing a record changes what is filled next time.
 */
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const when = (r: any) => String(r?.date ?? r?.created ?? r?.at ?? "");

/** Distinct non-empty values a field has had, A–Z — offered as suggestions while typing. */
export function pastValues<T>(rows: T[], k: keyof T, limit = 300): string[] {
  const seen = new Map<string, string>();
  for (const r of rows) { const v = (r as any)?.[k]; if (typeof v === "string" && v.trim() && !seen.has(norm(v))) seen.set(norm(v), v.trim()); if (seen.size >= limit) break; }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** The most recent record whose `match` fields all equal the given values (case and spaces ignored). */
export function recall<T>(rows: T[], match: Partial<Record<keyof T, unknown>>, skipId?: string): T | undefined {
  const keys = Object.keys(match) as (keyof T)[];
  if (!keys.length || keys.some((k) => !norm(match[k]))) return undefined;
  let best: T | undefined, bestAt = "";
  for (const r of rows) {
    if (skipId && (r as any)?.id === skipId) continue;
    if (!keys.every((k) => norm((r as any)?.[k]) === norm(match[k]))) continue;
    const at = when(r);
    if (!best || at > bestAt) { best = r; bestAt = at; }
  }
  return best;
}

/** Fields that describe one event, never copied from an older record. */
const VOLATILE = /^(id|slot|spoolNo|no|date|due|at|created|paidOn|qty|units|done|grams|hours|status|active|copies|orderNo|order|job|tracking|amount|subtotal|tax|total|file|photo|lines|stockApplied|note|notes)$/i;

const empty = (v: unknown, blank?: unknown) => v === undefined || v === null || v === "" || (blank !== undefined && JSON.stringify(v) === JSON.stringify(blank));

/** Values from `src` for every field still empty (or at its default) in `draft`. `only` limits which fields may be filled. */
export function fillEmpty<T>(draft: T, src: T | undefined, opts: { keys?: (keyof T)[]; only?: (keyof T)[]; blank?: Partial<T> } = {}): Partial<T> {
  if (!src) return {};
  const out: Partial<T> = {};
  const fields = (opts.only ?? (Object.keys(src as object) as (keyof T)[]));
  for (const k of fields) {
    if (opts.keys?.includes(k) || VOLATILE.test(String(k))) continue;
    const v = (src as any)[k];
    if (empty(v)) continue;
    if (empty((draft as any)[k], opts.blank?.[k])) (out as any)[k] = v;
  }
  return out;
}
