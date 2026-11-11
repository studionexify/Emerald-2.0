/** Floor sheet (bulk work sheet): colour stock, grams needed, and logging plates per line item. */
import { batchesSig, consume, log, me, ordersSig, patchOrder, spoolLabel, lineProgress, type Order, type LineItem } from "./index";
import { filMasterSig, spoolsSig } from "./inventory";

const eq = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();

/** Grams in store for a colour: every active spool of that colour, summed. */
export const colourStore = (colour: string) => spoolsSig.value.filter((s) => s.active !== false && s.status !== "empty" && eq(s.colour, colour)).reduce((a, s) => a + Math.max(0, s.grams), 0);
/** Library hex for a colour, if the library has one. */
/** Last resort when the library and spools carry no hex: a swatch from the colour's name. */
const NAME_HEX: [RegExp, string][] = [[/black/i, "#111111"], [/white|ivory|natural|clear/i, "#f2f2f2"], [/skin|apricot|beige/i, "#f5b5a6"], [/red|ruby/i, "#d41f2b"], [/orange|terracotta/i, "#ff7a1a"], [/yellow|gold|lemon/i, "#f2c500"], [/green|olive|khaki|khakhi|mint/i, "#3f9a4a"], [/blue|navy/i, "#2557c4"], [/purple|violet|lavend|lilac|mauve/i, "#8a4fb8"], [/pink|sakura/i, "#ee8fb2"], [/brown|chocolate|bronze/i, "#7a4b2a"], [/gr[ae]y|ash|moon|silver/i, "#8d8d8d"]];
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
export function startPlates(o: Order, k: number, d: { machine?: string; plates: number; perPlate: number; spools: Record<string, string> }): Order {
  const i = o.items[k], cs = Object.keys(d.spools);
  const ids = cs.map((c) => d.spools[c]);
  const labels = ids.map((id) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? spoolLabel(s) : id; });
  batchesSig.value = [...batchesSig.value, { id: crypto.randomUUID(), orderNo: o.no, customer: o.customer, name: i.name, units: d.plates * d.perPlate, done: 0, printer: d.machine, spool: labels.join(" + ") || undefined, spoolIds: ids, colours: cs, plates: d.plates, perPlate: d.perPlate, running: true, at: new Date().toISOString(), by: me.value?.name, stage: "production" }];
  log("Started print", `${o.no} · ${d.plates * d.perPlate}× ${i.name}${d.machine ? ` on ${d.machine}` : ""}`);
  return setLine(o, k, { machine: d.machine ?? i.machine, perPlate: d.perPlate });
}

/** Complete plates: good + wasted pieces, grams per plate per spool all consumed from those exact spools. */
export function finishPlates(o: Order, k: number, runId: string, d: { plates: number; perPlate: number; wasted: number; spools: Record<string, string>; gpp: Record<string, number> }): Order {
  const i = o.items[k], p = lineProgress(o, i), b = batchesSig.value.find((x) => x.id === runId);
  const pcs = d.plates * d.perPlate, bad = Math.min(d.wasted, pcs), grams: Record<string, number> = {}, cons: string[] = [];
  for (const [colour, id] of Object.entries(d.spools)) {
    const qty = Math.round((d.gpp[colour] ?? 0) * d.plates); if (qty <= 0) continue;
    const sp = spoolsSig.value.find((s) => s.id === id);
    cons.push(consume({ kind: "filament", item: sp ? spoolLabel(sp) : colour, qty, orderNo: o.no, batch: i.name, printer: b?.printer ?? i.machine, spoolId: sp?.id }).id);
    grams[id] = (grams[id] ?? 0) + qty;
  }
  batchesSig.value = batchesSig.value.map((x) => (x.id === runId ? { ...x, running: false, units: pcs, done: pcs - bad, failed: bad, plates: d.plates, perPlate: d.perPlate, spoolIds: Object.values(d.spools), colours: Object.keys(d.spools), grams, cons, by: me.value?.name ?? x.by } : x));
  log("Print done", `${o.no} · ${i.name}: ${pcs - bad} good, ${bad} wasted · ${Object.values(grams).reduce((a, x) => a + x, 0)} g`);
  return setLine(o, k, { printed: p.printed + pcs - bad, failed: p.failed + bad, perPlate: d.perPlate, gpp: { ...i.gpp, ...d.gpp } });
}
/** Cancel a run that never finished. */
export const cancelRun = (id: string) => { batchesSig.value = batchesSig.value.filter((b) => b.id !== id); };
