/** Bulk category edits for Nexder (loaded only by the categories windows, so the main bundle stays small). */
import { log } from "./index";
import { binSig } from "./inventory";
import { today, uid } from "./store";
import { addCategory, catOf, catsOf, draftOf, nexderCatsSig, nexderDesignsSig, priceUndoSig, saveDraft, setPriceUndo, type NxDesign, type PriceUndo } from "./nexder";

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
/** A category can be deleted only when nothing was ever numbered from it: no design in the list or the Bin, and no retired number (its block could be handed out again). */
export const canDeleteCategory = (id: string) => !nexderDesignsSig.value.some((d) => d.catId === id) && !binSig.value.some((x) => x.kind === "Design" && (x.data as { catId?: string } | undefined)?.catId === id) && !(nexderCatsSig.value.find((c) => c.id === id)?.retired?.length);
export function deleteCategory(id: string): string | null {
  if (!canDeleteCategory(id)) return "Numbers were issued from this category (designs, the Bin or retired numbers), so it can't be deleted. Archive it to hide it.";
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => (d.cats?.includes(id) ? { ...d, cats: d.cats.filter((c) => c !== id) } : d));
  nexderCatsSig.value = nexderCatsSig.value.filter((c) => c.id !== id); return null;
}


/* ---------------------------------------------------------------- archive and merge */
/** Archived categories vanish from every list and picker; their designs keep them and they come back with Restore. */
export const setArchived = (id: string, on: boolean) => { nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === id ? { ...c, archived: on || undefined } : c)); };
/** Moves every design of `src` into `tgt`. The source is deleted when nothing was ever numbered from it, otherwise archived (its number block has to stay). */
export function mergeCategories(src: string, tgt: string): { moved: number; gone: "deleted" | "archived" } {
  let moved = 0;
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => {
    const cur = d.cats ?? [d.catId]; if (!cur.includes(src)) return d;
    moved++; return memberOf(d, [...new Set(cur.map((c) => (c === src ? tgt : c)))]);
  });
  if (canDeleteCategory(src)) { deleteCategory(src); log("Merged categories", `${moved} design${moved === 1 ? "" : "s"} moved`, "order"); return { moved, gone: "deleted" }; }
  setArchived(src, true); log("Merged categories", `${moved} design${moved === 1 ? "" : "s"} moved`, "order"); return { moved, gone: "archived" };
}

/* ---------------------------------------------------------------- bulk price */
export type PriceMode = "set" | "pct" | "add" | "round";
export const newPrice = (p: number | undefined, mode: PriceMode, v: number): number | undefined => {
  const o = p ?? 0;
  const n = mode === "set" ? v : mode === "pct" ? o * (1 + v / 100) : mode === "add" ? o + v : v > 0 ? Math.round(o / v) * v : o;
  return Math.max(0, Math.round(n)) || undefined;
};
export function bulkPrice(ids: string[], mode: PriceMode, v: number, label = ""): number {
  const want = new Set(ids), items: PriceUndo["items"] = [];
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => { if (!want.has(d.id)) return d; const p = newPrice(d.price, mode, v); if (p === d.price) return d; items.push({ id: d.id, from: d.price, to: p }); return { ...d, price: p }; });
  if (items.length) { log("Bulk price change", `${items.length} design${items.length > 1 ? "s" : ""}`, "order"); setPriceUndo([{ at: new Date().toISOString(), label, items }, ...priceUndoSig.value].slice(0, 10)); }
  return items.length;
}
/** Puts the prices of the newest bulk change back. A design whose price was changed again since is left alone. Returns how many were restored and how many skipped. */
export function undoPrice(): { restored: number; skipped: number } {
  const [top, ...rest] = priceUndoSig.value; if (!top) return { restored: 0, skipped: 0 };
  const by = new Map(top.items.map((i) => [i.id, i])); let restored = 0, skipped = 0;
  nexderDesignsSig.value = nexderDesignsSig.value.map((d) => { const i = by.get(d.id); if (!i) return d; if (d.price !== i.to) { skipped++; return d; } restored++; return { ...d, price: i.from }; });
  skipped += top.items.filter((i) => !nexderDesignsSig.value.some((d) => d.id === i.id)).length;
  if (restored) log("Undid bulk price change", `${restored} design${restored > 1 ? "s" : ""}`, "order");
  setPriceUndo(rest); return { restored, skipped };
}

/* ---------------------------------------------------------------- duplicate: the record, sizes and price; no photos or files */
export async function duplicateDesigns(ds: NxDesign[]): Promise<string[]> {
  const errs: string[] = [];
  for (const d of ds) {
    const dr = { ...draftOf(d), key: uid(), editId: undefined, name: `${d.name} copy`, photos: [], files: [] };
    /* a copy is numbered from the same block; when the stored category is gone, from the first one it is listed in */
    const home = catOf(d) ?? nexderCatsSig.value.find((c) => c.id === catsOf(d, true)[0]);
    if (!home) { errs.push(`${d.name}: it has no category to number the copy from. Put it in a category first.`); continue; }
    const r = await saveDraft(dr, home.id, d.cats ? d.cats.filter((c) => nexderCatsSig.value.some((x) => x.id === c)) : undefined, () => {});
    if (typeof r === "string") errs.push(`${d.name}: ${r}`);
  }
  return errs;
}

/* ---------------------------------------------------------------- CSV */
const cell = (v: string | number | undefined) => { let t = String(v ?? ""); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
/** One row per design, ready for Excel (UTF-8 with a BOM so ₹ and names read correctly). */
export function exportCsv(ds: NxDesign[]) {
  const head = ["Number", "Name", "Categories", "Designer", "Source link", "Price", "Sizes", "Description", "Photos", "Files", "File bytes", "Added", "Added by"];
  const rows = ds.map((d) => [d.no, d.name, catsOf(d).map((id) => nexderCatsSig.value.find((c) => c.id === id)?.name ?? "").join("; "), d.designer, d.source, d.price, (d.sizes ?? []).map((s) => `${s.label}${s.mm ? ` ${s.mm}mm` : ""} ${s.g}g${s.min ? ` ${s.min}min` : ""}${s.sliced ? " sliced" : ""}`).join("; "), d.desc, d.photos.length, d.files.length, d.files.reduce((a, f) => a + f.size, 0), d.created, d.by]);
  const blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nexder-designs-${today()}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
