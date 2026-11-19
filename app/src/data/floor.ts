/** Floor sheet (bulk work sheet): colour stock, grams needed, and logging plates per line item. */
import type { LinePart } from "../mock/types";
import { applyPartDelta, onParts, type Batch, partPieces, batchesSig, consume, logMachineTime, log, me, ordersSig, patchOrder, spoolLabel, lineProgress, type Order, type LineItem } from "./index";
import { filMasterSig, spoolsSig } from "./inventory";

const eq = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Grams in store for a colour: every active spool of that colour, summed. */
export const colourStore = (colour: string) => spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && eq(s.colour, colour)).reduce((a, s) => a + Math.max(0, s.grams), 0);
/** Library hex for a colour, if the library has one. */
/** Last resort when the library and spools carry no hex: a swatch from the colour's name. */
const NAME_HEX: [RegExp, string][] = [[/black/i, "#111111"], [/white|ivory|natural|clear/i, "#f2f2f2"], [/skin|apricot|beige/i, "#f5b5a6"], [/red|ruby/i, "#d41f2b"], [/orange|terracotta/i, "#ff7a1a"], [/yellow|gold|lemon/i, "#f2c500"], [/green|olive|khaki|khakhi|mint/i, "#3f9a4a"], [/blue|navy/i, "#2557c4"], [/purple|violet|lavend|lilac|mauve/i, "#8a4fb8"], [/pink|sakura/i, "#ee8fb2"], [/brown|chocolate|bronze/i, "#7a4b2a"], [/gr[ae]y|ash|moon|silver/i, "#8d8d8d"]];
/** Colour family of a name ("Pure White", "Silk White", "Matte Ivory" → white): the Floor's colours are a reference, any spool of the family fits. */
export const colourFamily = (colour?: string) => { const n = colour ?? ""; const hit = NAME_HEX.findIndex(([r]) => r.test(n)); return hit >= 0 ? String(hit) : n.trim().toLowerCase(); };
export const sameFamily = (a?: string, b?: string) => eq(a, b) || (!!a?.trim() && !!b?.trim() && colourFamily(a) === colourFamily(b));
export const colourHex = (colour: string) => filMasterSig.value.colours.find((c) => eq(c.name, colour) && c.hex)?.hex || spoolsSig.value.find((s) => eq(s.colour, colour) && s.hex)?.hex || NAME_HEX.find(([r]) => r.test(colour))?.[1];
/** The spool a colour is taken from: the fullest active spool of that colour. */
export const colourSpool = (colour: string) => spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && eq(s.colour, colour)).sort((a, b) => b.grams - a.grams)[0];

/** Colours a line uses (falls back to its single colour field). */
export const lineColours = (i: LineItem) => i.colours ?? (i.colour ? [i.colour] : []);
/** Grams per piece of one colour, from the sliced grams per plate. */
export const gramsPerPc = (i: LineItem, colour: string) => { const g = i.gpp?.[colour]; return g && i.perPlate ? g / i.perPlate : 0; };

/** Floor columns: every colour in use or added, in library order, then any unknown names. */
export function floorColumns(o: Order) {
  const used = new Set<string>();
  for (const i of o.items) if (!i.offFloor) for (const c of lineColours(i)) used.add(c);
  for (const c of o.floorCols ?? []) used.add(c);
  const lib = filMasterSig.value.colours.map((c) => c.name);
  const known = lib.filter((n) => [...used].some((u) => eq(u, n)));
  const rest = [...used].filter((u) => !lib.some((n) => eq(n, u)));
  return [...known, ...rest];
}

/** Good counts are capped at qty; anything above is showcase extra. */
export function floorLine(o: Order, i: LineItem) {
  const p = lineProgress(o, i);
  return { printed: Math.min(p.printed, i.qty), wasted: p.failed, remaining: Math.max(0, i.qty - p.printed), extra: Math.max(0, p.printed - i.qty) };
}

const setLine = (o: Order, k: number, patch: Partial<LineItem>): Order => patchOrder(o, { items: o.items.map((x, j) => (j === k ? { ...x, ...patch } : x)) });

/**
 * Log plates for a line. Pieces on the plates are good + wasted (a halted plate is all wasted).
 * Every gram on the plates is consumed, good or bad. `deduct` false = already printed, counts only.
 */
export function logPlates(o: Order, k: number, d: { good: number; wasted: number; plates: number; perPlate: number; gpp: Record<string, number>; deduct: boolean }): Order {
  const i = o.items[k], p = lineProgress(o, i);
  const grams: Record<string, number> = {}, cons: string[] = [];
  if (d.deduct) for (const [colour, g] of Object.entries(d.gpp)) {
    const qty = Math.round(g * d.plates); if (qty <= 0) continue;
    const sp = colourSpool(colour);
    cons.push(consume({ kind: "filament", item: sp ? spoolLabel(sp) : colour, qty, orderNo: o.no, batch: i.name, printer: i.machine, spoolId: sp?.id }).id);
    grams[sp?.id ?? colour] = (grams[sp?.id ?? colour] ?? 0) + qty;
  }
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: i.name, units: d.good + d.wasted, done: d.good, failed: d.wasted, printer: i.machine, grams: d.deduct ? grams : undefined, cons, at: new Date().toISOString(), by: me.value?.name, stage: "production" }];
  log(d.deduct ? "Logged plates" : "Logged plates (already printed)", `${o.no} · ${i.name}: ${d.good} good, ${d.wasted} wasted${d.deduct ? ` · ${Object.values(grams).reduce((a, x) => a + x, 0)} g` : ""}`);
  // Store counts on the line so later corrections stay exact; remember the plate setup for next time.
  return setLine(o, k, { printed: p.printed + d.good, failed: p.failed + d.wasted, perPlate: d.perPlate, gpp: { ...i.gpp, ...d.gpp } });
}

/** Grams that fewer pieces would have used, per colour (for returning to stock on a correction). */
export function gramsFor(i: LineItem, pcs: number) {
  const out: Record<string, number> = {};
  for (const c of lineColours(i)) { const g = Math.round(gramsPerPc(i, c) * pcs); if (g > 0) out[c] = g; }
  return out;
}
/** Put grams back on the store as negative usage on each colour's fullest spool. */
export function returnGrams(o: Order, item: string, grams: Record<string, number>) {
  for (const [colour, g] of Object.entries(grams)) { const sp = colourSpool(colour) ?? spoolsSig.value.find((s) => eq(s.colour, colour)); if (sp && g > 0) consume({ kind: "filament", item: spoolLabel(sp), qty: -g, orderNo: o.no, batch: item, spoolId: sp.id }); }
}
/** Save edited line items (Floor "Edit line items"). Hidden lines leave the sheet only. */
export function saveFloorLines(o: Order, items: LineItem[]): Order {
  const n = patchOrder(o, { items });
  log("Edited floor sheet", o.no);
  return n;
}
export const orderById = (id: string) => ordersSig.value.find((x) => x.id === id);

/** The run on the plate for a line, if any. */
export const lineRun = (o: Order, i: LineItem) => batchesSig.value.find((b) => b.orderNo === o.no && b.name === i.name && b.running);

/** Start plates: remember machine, plates, copies and the spool picked for each colour. */
export function startPlates(o: Order, k: number, d: { machine?: string; plates: number; perPlate: number; spools: Record<string, string>; part?: string; /** several parts printed together on this plate */ partsOn?: string[]; /** the machine(s) to show on the line when several runs start together */ lineMachine?: string }): Order {
  const i = o.items[k], cs = Object.keys(d.spools);
  const ids = cs.map((c) => d.spools[c]);
  const labels = ids.map((id) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? spoolLabel(s) : id; });
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: i.name, units: d.plates * d.perPlate, done: 0, printer: d.machine, spool: labels.join(" + ") || undefined, spoolIds: ids, colours: cs, plates: d.plates, perPlate: d.perPlate, running: true, ...(d.part ? { part: d.part } : {}), ...(d.partsOn && d.partsOn.length > 1 ? { partsOn: d.partsOn } : {}), at: new Date().toISOString(), by: me.value?.name, stage: "production" }];
  log("Started print", `${o.no} · ${d.plates * d.perPlate}× ${i.name}${d.partsOn && d.partsOn.length > 1 ? ` (${d.partsOn.join(" + ")} together)` : d.part ? ` (${d.part})` : ""}${d.machine ? ` on ${d.machine}` : ""}`);
  return setLine(o, k, { machine: d.lineMachine ?? d.machine ?? i.machine, ...(d.part ? {} : { perPlate: d.perPlate }) });
}

/** Complete plates: good + wasted pieces, grams per plate per spool all consumed from those exact spools. */
/** Runs of a line printed with spools still loaded, waiting for the final weigh. */
export const pendingWeigh = (o: Order, i: LineItem) => batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && b.weighLater && !b.running);
/** Of those, the ones that used one of these spools: only they are covered by a weigh of those spools (other machines have their own spools). */
export const pendingOn = (o: Order, i: LineItem, spoolIds: string[], self?: string) => pendingWeigh(o, i).filter((b) => b.id !== self && b.spoolIds?.some((id) => spoolIds.includes(id)));
export function finishPlates(o: Order, k: number, runId: string, d: { plates: number; perPlate: number; wasted: number; spools: Record<string, string>; gpp: Record<string, number>; later?: boolean; hours?: number; /** why pieces failed */ reason?: string; /** optional: grams each part of a together-plate used */ partG?: Record<string, number> }): Order {
  const i = o.items[k], p = lineProgress(o, i), b = batchesSig.value.find((x) => x.id === runId);
  const asPart = !!b?.part && !!i.parts?.length, was = asPart ? partPieces(i, batchesSig.value, o.no) : null;
  const pcs = d.plates * d.perPlate, bad = Math.min(d.wasted, pcs), grams: Record<string, number> = {}, cons: string[] = [];
  // Weighing now also covers every earlier run printed from these loaded spools.
  const prior = d.later ? [] : pendingOn(o, i, Object.values(d.spools), runId), allPlates = d.plates + prior.reduce((a, x) => a + (x.plates ?? 1), 0);
  if (!d.later) for (const [colour, id] of Object.entries(d.spools)) {
    /* only the earlier plates that used this very spool share its weigh */
    const mine = d.plates + prior.filter((x) => x.spoolIds?.includes(id)).reduce((a, x) => a + (x.plates ?? 1), 0);
    const qty = Math.round((d.gpp[colour] ?? 0) * mine); if (qty <= 0) continue;
    const sp = spoolsSig.value.find((s) => s.id === id);
    cons.push(consume({ kind: "filament", item: sp ? spoolLabel(sp) : colour, qty, orderNo: o.no, batch: i.name, printer: b?.printer ?? i.machine, spoolId: sp?.id }).id);
    grams[id] = (grams[id] ?? 0) + qty;
  }
  const lg = logMachineTime(o, { name: i.name, printer: b?.printer ?? i.machine }, d.hours ?? 0, pcs - bad, bad, Object.values(grams).reduce((a, x) => a + x, 0)); cons.push(...lg.cons);
  const priorIds = new Set(prior.map((x) => x.id));
  batchesSig.value = batchesSig.value.map((x) => (x.id === runId ? { ...x, running: false, endAt: new Date().toISOString(), reason: bad && d.reason?.trim() ? d.reason.trim() : undefined, weighLater: d.later || undefined, units: pcs, done: pcs - bad, failed: bad, hours: d.hours || undefined, jobIds: lg.jobIds.length ? lg.jobIds : undefined, plates: d.plates, perPlate: d.perPlate, spoolIds: Object.values(d.spools), colours: Object.keys(d.spools), grams: d.later ? undefined : grams, ...(d.partG && Object.values(d.partG).some((v) => v > 0) ? { partG: Object.fromEntries(Object.entries(d.partG).filter(([, v]) => v > 0)) } : {}), cons, by: me.value?.name ?? x.by } : priorIds.has(x.id) ? { ...x, weighLater: undefined } : x));
  log("Print done", `${o.no} · ${i.name}: ${pcs - bad} good, ${bad} wasted${bad && d.reason?.trim() ? ` (${d.reason.trim()})` : ""} · ${d.later ? "weigh at the end" : `${Object.values(grams).reduce((a, x) => a + x, 0)} g over ${allPlates} plate${allPlates > 1 ? "s" : ""}`}`);
  if (asPart) return applyPartDelta(o, i.name, was, partPieces(i, batchesSig.value, o.no));
  return setLine(o, k, { printed: p.printed + pcs - bad, failed: p.failed + bad, ...(b?.part ? {} : { perPlate: d.perPlate, gpp: d.later ? i.gpp : { ...i.gpp, ...d.gpp } }) });
}
/** Cancel a run that never finished. */
export const cancelRun = (id: string) => { batchesSig.value = batchesSig.value.filter((b) => b.id !== id); };

/* ---------------------------------------------------------------- cut into parts */
export const MAX_PARTS = 200;
/** Spreads parts over printers as equal blocks (12 parts on 3 printers: 4 each, in order). `ids` limits it to some parts. */
export function allotParts(parts: LinePart[], printers: string[], ids?: string[]): LinePart[] {
  if (!printers.length) return parts;
  const hit = parts.filter((p) => !ids || ids.includes(p.id)), at = new Map(hit.map((p, j) => [p.id, printers[Math.min(printers.length - 1, Math.floor((j * printers.length) / hit.length))]]));
  return parts.map((p) => (at.has(p.id) ? { ...p, printer: at.get(p.id)! } : p));
}
/** Cut a line into n parts, each starting from the line's own type and colour. With printers, the parts are shared equally between them. */
export function cutParts(o: Order, k: number, n: number, printers: string[] = []): Order {
  const i = o.items[k], count = Math.max(2, Math.min(MAX_PARTS, Math.round(n) || 2)), each = i.roughG ? Math.round((i.roughG / count) * 10) / 10 : undefined;
  const parts: LinePart[] = allotParts(Array.from({ length: count }, (_, j) => ({ id: crypto.randomUUID(), name: `Part ${j + 1}`, material: i.material, colour: lineColours(i)[0] ?? i.colour, printer: i.machine?.split(" + ")[0] ?? "", ...(printers.length && each ? { g: each } : {}) })), printers);
  log("Cut into parts", `${o.no} · ${i.name} into ${count}${printers.length ? ` on ${printers.length} printer${printers.length > 1 ? "s" : ""}` : ""}`);
  return setLine(o, k, { parts });
}
export const saveParts = (o: Order, k: number, parts: LinePart[] | undefined): Order => setLine(o, k, { parts: parts?.length ? parts : undefined });
/** Everything printed so far for a line, failed prints included: grams that left the spools and hours on the machines. */
export function runTotals(o: Order, i: LineItem, part?: string) {
  const runs = batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && (part === undefined || (part === "" ? !b.part : onParts(b).includes(part))));
  /** Grams of a run that belong to this part: what was typed for it, else the rest of the plate shared between the parts nobody typed a figure for. */
  const gOf = (b: Batch) => {
    const total = Object.values(b.grams ?? {}).reduce((x, y) => x + y, 0); if (!part) return total;
    const on = onParts(b), typed = b.partG ?? {}; if (typed[part] !== undefined) return typed[part];
    const rest = Math.max(0, total - on.reduce((a, n) => a + (typed[n] ?? 0), 0)), free = on.filter((n) => typed[n] === undefined).length;
    return rest / Math.max(1, free);
  };
  const share = (b: Batch) => (part ? 1 / Math.max(1, onParts(b).length) : 1);
  const done = runs.filter((b) => !b.running);
  return {
    runs: runs.length, running: runs.length - done.length,
    good: done.reduce((a, b) => a + (b.done || 0), 0), failed: done.reduce((a, b) => a + (b.failed ?? 0), 0),
    g: Math.round(done.reduce((a, b) => a + gOf(b), 0)),
    h: Math.round(done.reduce((a, b) => a + (b.hours ?? 0) * share(b), 0) * 10) / 10,
    /** runs printed with the spools still loaded: their grams arrive at the final weigh */
    toWeigh: done.filter((b) => b.weighLater).length,
  };
}
export const hoursText = (h: number) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
