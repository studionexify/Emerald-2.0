/**
 * Filament planning: free stock per colour, grams-per-piece resolution and "what can be printed now".
 * Everything below the signal readers is pure (spools, orders, batches, jobs in → plan out) so it can be tested alone.
 * Planning only: nothing here writes stock. Estimated grams live in roughG / design size, never in `gpp`.
 */
import type { Batch, Job, LineItem, Order, Spool } from "../mock/types";

const eq = (a?: string, b?: string) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
const key = (c: string) => c.trim().toLowerCase();
export const lineCols = (i: LineItem) => i.colours ?? (i.colour ? [i.colour] : []);

/* ------------------------------------------------------------------ grams per piece */
export type GSrc = "sliced" | "logged" | "rough" | "past" | "similar" | "unknown";
export type PieceG = { colour: string; g: number; src: GSrc };
const slicedPc = (i: LineItem, c: string) => { const k = Object.keys(i.gpp ?? {}).find((x) => eq(x, c)); const g = k ? i.gpp![k] : 0; return g && i.perPlate ? g / i.perPlate : 0; };
const slicedTotal = (i: LineItem) => Object.keys(i.gpp ?? {}).reduce((a, k) => a + slicedPc(i, k), 0);
const sizeMatch = (a: LineItem, b: LineItem) => a.heightMm && b.heightMm ? b.heightMm / a.heightMm >= 0.8 && b.heightMm / a.heightMm <= 1.25 : !!a.designSize && a.designSize === b.designSize;

/**
 * Grams per piece actually used, from the logged runs of one line: grams consumed per colour ÷ pieces printed (good and failed).
 * Runs still waiting for their final weigh have no grams yet, so they add neither grams nor pieces; a later weigh covers its earlier plates.
 */
export function loggedPc(o: Order, i: LineItem, batches: Batch[]): Record<string, number> {
  const mine = batches.filter((b) => b.orderNo === o.no && b.name === i.name && !b.running && !b.weighLater), units = mine.reduce((a, b) => a + (b.units || 0), 0), g: Record<string, number> = {};
  if (!units) return g;
  for (const b of mine) for (const [id, v] of Object.entries(b.grams ?? {})) { const j = b.spoolIds?.indexOf(id) ?? -1, c = j >= 0 ? b.colours?.[j] : undefined; if (c && v > 0) g[c] = (g[c] ?? 0) + v; }
  for (const c of Object.keys(g)) g[c] = g[c] / units;
  return g;
}

/**
 * Grams per piece for each colour of a line, best source first:
 * sliced (real) → logged use on this line → rough total typed on the line → same design's past prints → similar-sized designs → unknown.
 */
export function pieceGrams(i: LineItem, pool: LineItem[], logged: Record<string, number> = {}): PieceG[] {
  const out: PieceG[] = lineCols(i).map((c) => ({ colour: c, g: slicedPc(i, c), src: "sliced" as GSrc }));
  const miss = () => out.filter((x) => !x.g);
  for (const x of miss()) { const k = Object.keys(logged).find((y) => eq(y, x.colour)); if (k && logged[k] > 0) { x.g = logged[k]; x.src = "logged"; } }
  if (!miss().length) return out;
  const have = out.reduce((a, x) => a + x.g, 0);
  if (i.roughG && i.roughG > 0) { const m = miss(), rest = i.roughG - have; for (const x of m) { x.g = (rest > 0 ? rest : i.roughG) / m.length; x.src = "rough"; } return out; }
  const past = pool.filter((p) => p !== i && eq(p.name, i.name) && slicedTotal(p) > 0);
  if (past.length) {
    const p = past[past.length - 1];
    for (const x of miss()) { const g = slicedPc(p, x.colour); if (g) { x.g = g; x.src = "past"; } }
    const m = miss(); for (const x of m) { x.g = slicedTotal(p) / Math.max(1, out.length); x.src = "past"; }
    return out;
  }
  const sim = pool.filter((p) => p !== i && slicedTotal(p) > 0 && lineCols(p).length && sizeMatch(i, p));
  if (sim.length) { const per = sim.reduce((a, p) => a + slicedTotal(p) / lineCols(p).length, 0) / sim.length; for (const x of miss()) { x.g = per; x.src = "similar"; } return out; }
  for (const x of out) if (!x.g) x.src = "unknown";
  return out;
}

/* ------------------------------------------------------------------ demand */
export type Demand = { id: string; orderId: string; orderNo: string; customer: string; due: string; name: string; k: number; pending: number; pcs: PieceG[]; unknown: boolean; estimated: boolean; machine?: string; type: Order["type"]; reserved: boolean };
export type Progress = (o: Order, i: LineItem, batches: Batch[]) => { printed: number; printing: number };
/** Stages whose unprinted pieces still need filament. Floor-tracked lines (stored counts or batches) also count at QC; later stages never do. */
const LIVE = new Set(["po", "production"]);
const tracked = (o: Order, i: LineItem, batches: Batch[]) => i.printed !== undefined || batches.some((b) => b.orderNo === o.no && b.name === i.name);

/**
 * One entry per unfinished design across live orders (all segments). Pieces already on a plate are not counted again.
 * Rule: PO and Production orders always; QC only for lines Floor already tracks; Packing and later never.
 * `force` = the order the user has open: always included, so the panel agrees with the sheet next to it.
 */
export function buildDemand(orders: Order[], batches: Batch[], jobs: Job[], progress: Progress, jobSpool: (j: Job) => Spool | undefined, force?: string): Demand[] {
  const pool = orders.flatMap((o) => o.items), out: Demand[] = [];
  for (const o of orders) {
    const all = o.no === force || LIVE.has(o.stage), qc = o.stage === "qc";
    if (!all && !qc) continue;
    o.items.forEach((i, k) => {
      if (i.offFloor || (!all && !tracked(o, i, batches))) return;
      const p = progress(o, i, batches), pending = Math.max(0, i.qty - p.printed - p.printing);
      if (!pending) return;
      const pcs = pieceGrams(i, pool, loggedPc(o, i, batches));
      // A queued job with a spool holds the grams itself: from a free spool (reserved in stockFor) or from the spool already on its machine. The line stays listed, but is not planned twice.
      const reserved = jobs.some((j) => j.status === "queued" && j.orderNo === o.no && eq(j.item, i.name) && !!jobSpool(j));
      out.push({ id: `${o.id}:${k}`, orderId: o.id, orderNo: o.no, customer: o.customer, due: o.due, name: i.name, k, pending, pcs, unknown: !pcs.length || pcs.some((x) => !x.g), estimated: pcs.some((x) => x.src !== "sliced" && x.src !== "logged" && x.src !== "unknown"), machine: i.machine, type: o.type, reserved });
    });
  }
  return out.sort((a, b) => a.due.localeCompare(b.due) || a.orderNo.localeCompare(b.orderNo) || a.k - b.k);
}

/* ------------------------------------------------------------------ stock */
export type SpoolState = "free" | "loaded" | "plate" | "weigh";
/** loaded = on a printer; plate = on a running print; weigh = printed with it, final weigh still pending (its balance is too high). */
export const spoolState = (s: Spool, batches: Batch[]): SpoolState => {
  const b = batches.find((x) => (x.running || x.weighLater) && x.spoolIds?.includes(s.id));
  return b ? (b.running ? "plate" : "weigh") : s.status === "loaded" ? "loaded" : "free";
};
export type SpoolRow = { s: Spool; state: SpoolState };
export type ColourStock = { colour: string; free: number; busy: number; reserved: number; spools: SpoolRow[]; mats: string[] };

/** Stock per colour. Free = in store and not loaded / on a plate / awaiting weigh; net of grams held by queued jobs. Net grams, not gross. */
export function stockFor(spools: Spool[], batches: Batch[], jobs: Job[], jobSpool: (j: Job) => Spool | undefined, material = ""): ColourStock[] {
  const m = new Map<string, ColourStock>();
  for (const s of spools) {
    if (s.active === false || s.status === "empty" || !(s.grams > 0) || !s.colour?.trim() || (material && s.material !== material)) continue;
    const c = m.get(key(s.colour)) ?? { colour: s.colour.trim(), free: 0, busy: 0, reserved: 0, spools: [], mats: [] };
    const state = spoolState(s, batches);
    c.spools.push({ s, state }); if (!c.mats.includes(s.material)) c.mats.push(s.material);
    if (state === "free") c.free += s.grams; else c.busy += s.grams;
    m.set(key(s.colour), c);
  }
  for (const j of jobs) if (j.status === "queued") { const s = jobSpool(j), c = s && m.get(key(s.colour)); if (c && c.spools.some((r) => r.s.id === s!.id && r.state === "free")) c.reserved += j.grams; } // a job on a loaded spool draws from the machine, which is already outside free stock
  for (const c of m.values()) { c.reserved = Math.min(c.reserved, c.free); c.spools.sort((a, b) => b.s.grams - a.s.grams); }
  return [...m.values()].sort((a, b) => a.colour.localeCompare(b.colour, undefined, { sensitivity: "base" }));
}
export const freeMap = (st: ColourStock[]) => new Map(st.map((c) => [key(c.colour), Math.max(0, c.free - c.reserved)]));

/* ------------------------------------------------------------------ allocation */
export type Mode = "deadline" | "max";
export type PlanRow = { d: Demand; can: number; status: "ready" | "partial" | "blocked" | "unknown" | "held"; short: { colour: string; g: number }[]; missing: string[] };
const perPc = (d: Demand) => d.pcs.reduce((a, x) => a + x.g, 0);

/**
 * Walks the designs and hands out free grams. deadline: earliest due claims stock first. max: lightest designs first
 * (a greedy heuristic for the most pieces, not a proven optimum). Designs with missing grams are listed as unknown, never guessed.
 */
export function allocate(demands: Demand[], free: Map<string, number>, mode: Mode): PlanRow[] {
  const avail = new Map(free);
  const known = demands.filter((d) => !d.unknown && !d.reserved), order = mode === "deadline" ? known : [...known].sort((a, b) => perPc(a) - perPc(b) || a.due.localeCompare(b.due));
  const rows: PlanRow[] = [];
  for (const d of order) {
    const before = (c: string) => avail.get(key(c)) ?? 0;
    const can = Math.min(d.pending, ...d.pcs.map((x) => Math.floor(before(x.colour) / x.g)));
    const short = d.pcs.map((x) => ({ colour: x.colour, g: Math.max(0, Math.ceil(d.pending * x.g - before(x.colour))) })).filter((x) => x.g > 0);
    const missing = d.pcs.filter((x) => Math.floor(before(x.colour) / x.g) < 1).map((x) => x.colour);
    for (const x of d.pcs) avail.set(key(x.colour), before(x.colour) - can * x.g);
    rows.push({ d, can, status: can >= d.pending ? "ready" : can > 0 ? "partial" : "blocked", short, missing });
  }
  for (const d of demands) if (d.reserved) rows.push({ d, can: d.pending, status: "held", short: [], missing: [] }); else if (d.unknown) rows.push({ d, can: 0, status: "unknown", short: [], missing: [] });
  return rows;
}

/* ------------------------------------------------------------------ per printer */
export type PrinterPlan = { printer: string; loaded: { colour: string; g: number }[]; picks: { d: Demand; swaps: string[]; enough: boolean }[] };
/** Per printer: designs whose colours are already on it first (no swap), then one swap away. Loaded spools only count for their own printer. */
export function printerPlans(spools: Spool[], printers: string[], demands: Demand[], batches: Batch[] = []): PrinterPlan[] {
  return printers.map((p) => {
    const onBatch = (s: Spool) => batches.some((b) => (b.running || b.weighLater) && b.spoolIds?.includes(s.id) && (b.printer ?? "").split(" + ").some((x) => eq(x, p)));
    const loaded = spools.filter((s) => s.active !== false && s.grams > 0 && s.status !== "empty" && ((s.status === "loaded" && eq(s.printer, p)) || onBatch(s))).map((s) => ({ colour: s.colour, g: s.grams }));
    const at = (c: string) => loaded.filter((x) => eq(x.colour, c)).reduce((a, x) => a + x.g, 0);
    const picks = demands.filter((d) => !d.unknown && !d.reserved && (!d.machine || d.machine.split(" + ").some((m) => eq(m, p))))
      .map((d) => { const swaps = d.pcs.filter((x) => !at(x.colour)).map((x) => x.colour); return { d, swaps, enough: d.pcs.every((x) => !swaps.includes(x.colour) && at(x.colour) >= d.pending * x.g) }; })
      .filter((x) => x.swaps.length <= 1 && x.swaps.length < x.d.pcs.length)
      .sort((a, b) => a.swaps.length - b.swaps.length || a.d.due.localeCompare(b.d.due)).slice(0, 5);
    return { printer: p, loaded, picks };
  }).filter((x) => x.loaded.length);
}

/* ------------------------------------------------------------------ one order: need vs free */
export type NeedRow = { colour: string; need: number; free: number; short: number; unknownPcs: number };
export function orderNeed(o: Order, demands: Demand[], free: Map<string, number>, allDemandsForOrder = demands.filter((d) => d.orderNo === o.no && !d.reserved)): NeedRow[] {
  const m = new Map<string, NeedRow>();
  const row = (c: string) => m.get(key(c)) ?? (m.set(key(c), { colour: c, need: 0, free: free.get(key(c)) ?? 0, short: 0, unknownPcs: 0 }), m.get(key(c))!);
  for (const d of allDemandsForOrder) for (const x of d.pcs) { const r = row(x.colour); if (x.g) r.need += d.pending * x.g; else r.unknownPcs += d.pending; }
  for (const r of m.values()) { r.need = Math.round(r.need); r.short = Math.max(0, r.need - r.free); }
  return [...m.values()].sort((a, b) => b.short - a.short || a.colour.localeCompare(b.colour));
}

/* ------------------------------------------------------------------ which spool to pick */
export type SpoolPick = { s: Spool; take: number };
/** Spool number as printed on the shelf label: slot if set, else spool no. */
export const spoolNo = (s: Spool) => String(s.slot ?? s.spoolNo);
/**
 * Suggest free spools of a colour for `need` grams. One spool when any holds enough (the smallest that does, so big spools stay whole);
 * otherwise the fullest spools until covered. `covered` is false when the free stock cannot reach it.
 */
export function pickSpools(rows: SpoolRow[], need: number): { picks: SpoolPick[]; covered: boolean } {
  const free = rows.filter((r) => r.state === "free" && r.s.grams > 0).map((r) => r.s).sort((a, b) => a.grams - b.grams);
  if (need <= 0) return { picks: [], covered: true };
  const one = free.find((x) => x.grams >= need);
  if (one) return { picks: [{ s: one, take: need }], covered: true };
  const picks: SpoolPick[] = []; let left = need;
  for (const x of [...free].reverse()) { if (left <= 0) break; const take = Math.min(x.grams, left); picks.push({ s: x, take }); left -= take; }
  return { picks, covered: left <= 0 };
}
