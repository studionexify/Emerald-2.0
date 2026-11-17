/** Bulk category edits for Nexder (loaded only by the categories windows, so the main bundle stays small). */
import { log } from "./index";
import { addCategory, nexderCatsSig, nexderDesignsSig, type NxDesign } from "./nexder";

const memberOf = (d: NxDesign, ids: string[]) => { const same = ids.length === 1 && ids[0] === d.catId; return same ? { ...d, cats: undefined } : { ...d, cats: ids }; };
/** Bulk: lists every design in `ids` under the categories in `add`, and takes it out of those in `drop`. Returns how many designs changed. */
export function setMembership(ids: string[], add: string[], drop: string[]): number {
  let n = 0; const want = new Set(ids);
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => {
    if (!want.has(d.id)) return d;
    const cur = d.cats ?? [d.catId], next = [...cur.filter((c) => !drop.includes(c)), ...add.filter((c) => !cur.includes(c) || drop.includes(c))];
    if (next.length === cur.length && next.every((c, i) => c === cur[i])) return d;
    n++; return memberOf(d, [...new Set(next)]);
  });
  if (n) log("Categories", `${n} design${n > 1 ? "s" : ""} updated`, "order");
  return n;
}
export const catName = (id: string) => nexderCatsSig.value.find((c) => c.id === id)?.name ?? "—";

/** Adds many categories at once (one per line, or separated by commas). Returns how many are new and any text that could not be added. */
export function addCategories(text: string): { added: number; existing: number; ids: string[]; error?: string } {
  const names = [...new Set(text.split(/[\n,;]+/).map((x) => x.trim().replace(/\s+/g, " ")).filter(Boolean))];
  let added = 0, existing = 0, error: string | undefined; const ids: string[] = [];
  for (const n of names) {
    const had = nexderCatsSig.value.some((c) => c.name.toLowerCase() === n.toLowerCase()), r = addCategory(n);
    if (r.error) { error = r.error; break; } ids.push(r.cat!.id); if (had) existing++; else added++;
  }
  return { added, existing, ids, error };
}
export function renameCategory(id: string, name: string): string | null {
  const n = name.trim().replace(/\s+/g, " "); if (!n) return "Give the category a name";
  if (nexderCatsSig.value.some((c) => c.id !== id && c.name.toLowerCase() === n.toLowerCase())) return "Another category already has that name";
  nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === id ? { ...c, name: n } : c)); return null;
}
/** A category can be deleted unless some design's number was issued from it (its Drive folder and number block live there). */
export const canDeleteCategory = (id: string) => !nexderDesignsSig.value.some((d) => d.catId === id);
export function deleteCategory(id: string): string | null {
  if (!canDeleteCategory(id)) return "Designs were numbered in this category, so it has to stay. Rename it instead.";
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => (d.cats?.includes(id) ? { ...d, cats: d.cats.filter((c) => c !== id) } : d));
  nexderCatsSig.value = nexderCatsSig.value.filter((c) => c.id !== id); return null;
}

