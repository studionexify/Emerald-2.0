/** Store · Stock Audit: count every spool / item on the shelf and reconcile Emerald against it. */
import { useState } from "preact/hooks";
import { WORKSHOP_TABS } from "../nav";
import { Button, Card, Field, inputCls, Page, Pick, Progress, Section, Stat, Status, Table } from "../ui";
import {
  applyMove, bodyTare, defaultBody, filMasterSig, inr, itemsSig, log, masterMat, me, movesSig, nextSpoolNo, packSig, persisted, spoolGroup, spoolsSig, spoolValue, toBin, today, uid,
  type PackItem, type Spool,
} from "../data";

type Cat = "filament" | "packing" | "accessory" | "part";
const CATS: Cat[] = ["filament", "packing", "accessory", "part"];
const CAT_LABEL: Record<Cat, string> = { filament: "Filament", packing: "Packaging", accessory: "Accessories", part: "Spares" };
type Line = { ref: string; label: string; before: number; after: number; unit: string; by: string; at: string; isNew?: boolean; /** confirmed as-is with Next, no weighing */ ok?: boolean };
type WriteOff = { label: string; grams: number; value: number; next: string };
export type Audit = { id: string; no: string; cat: Cat; status: "open" | "done"; started: string; by: string; finished?: string; finishedBy?: string; lines: Line[]; writeOffs?: WriteOff[] };

export const auditsSig = persisted<Audit[]>("audits", []);
const who = () => me.value?.name ?? "You";
const stamp = () => new Date().toISOString().slice(0, 16).replace("T", " ");
const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
const val = (e: Event) => (e.target as HTMLInputElement).value;
const g = (n: number) => `${Math.round(n).toLocaleString("en-IN")} g`;
const uniq = (xs: (string | undefined)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b));
const sel = "h-9 px-3 rounded-xl border border-line bg-c0 text-[13px] min-w-0";

/** Spools that count as "on the shelf": active and not already empty. */
const shelf = () => spoolsSig.value.filter((s) => s.active !== false && s.grams > 0 && s.status !== "empty");
const itemsOf = (c: Cat): PackItem[] => (c === "packing" ? packSig.value : itemsSig.value.filter((p) => (c === "part" ? p.cat === "Part" : p.cat !== "Part"))).filter((p) => p.active !== false);
/** Ledger key (matches the spool internally). */
const spoolKey = (s: Spool) => `${s.material} ${s.colour} · ${s.spoolNo}`;
/** What people read: the number on the spool label. */
const spoolName = (s: Spool) => `${s.material} ${s.colour}${s.brand ? ` ${s.brand}` : ""}${s.slot != null ? ` #${s.slot}` : ""}`;

function put(a: Audit) { auditsSig.value = auditsSig.value.map((x) => (x.id === a.id ? a : x)); }
function addLine(a: Audit, l: Line) { put({ ...a, lines: [...a.lines.filter((x) => x.ref !== l.ref), l] }); }

function start(cat: Cat) {
  const n = auditsSig.value.length + 1;
  const a: Audit = { id: uid(), no: `AUD-${String(n).padStart(3, "0")}`, cat, status: "open", started: stamp(), by: who(), lines: [] };
  auditsSig.value = [a, ...auditsSig.value];
  log(`Started stock audit ${a.no} (${CAT_LABEL[cat]})`, a.no, "stock");
}

/* ---------------------------------------------------------------- filament */
function setSpoolGrams(s: Spool, net: number, gross: number, a: Audit, note: string) {
  spoolsSig.value = spoolsSig.value.map((x) => (x.id === s.id ? { ...x, grams: net, gross, weighed: today(), status: net <= 0 ? "empty" : x.status === "loaded" ? "open" : x.status, printer: x.status === "loaded" ? "" : x.printer } : x));
  const d = net - s.grams;
  if (d) movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: spoolKey(s), dir: d > 0 ? "in" : "out", qty: Math.abs(d), unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: "", colour: s.colour, brand: s.brand, notes: `${note} · ${a.no}`, by: who() }, ...movesSig.value];
}

function SpoolRow({ s, a }: { s: Spool; a: Audit }) {
  const line = a.lines.find((l) => l.ref === s.id);
  const [gross, setGross] = useState(0);
  const tare = s.tare ?? bodyTare(s.spoolMat) ?? filMasterSig.value.tare;
  const net = Math.max(0, gross - tare);
  const cols = "grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_96px_270px] items-center gap-x-3 gap-y-2 py-2.5 border-t border-line first:border-0";
  if (line) return (
    <div class={cols}>
      <SpoolHead s={s} />
      <span class="text-sm text-right num"><span class="t-meta block">In Emerald</span>{line.before !== line.after && <><s class="text-c3">{g(line.before)}</s> </>}<b>{g(line.after)}</b></span>
      <span class="flex items-center gap-2 justify-end max-sm:col-span-2"><Status tone="done">{line.isNew ? "Added" : line.ok ? "Confirmed" : "Updated"}</Status>
        {!line.isNew && <Button variant="outline" onClick={() => { setSpoolGrams({ ...s, grams: line.after }, line.before, line.before + tare, a, "Audit undo"); put({ ...a, lines: a.lines.filter((l) => l.ref !== s.id) }); log(`Audit ${a.no}: undo ${spoolName(s)}`, spoolName(s), "stock"); }}>Undo</Button>}</span>
    </div>
  );
  return (
    <div class={cols}>
      <SpoolHead s={s} />
      <span class="text-sm text-right num"><span class="t-meta block">In Emerald</span>{g(s.grams)}</span>
      <span class="flex items-center gap-2 justify-end max-sm:col-span-2">
        <input class={`${inputCls} !w-[96px] !h-9 text-right num`} type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="off" placeholder="Gross g" aria-label={`Gross weight of ${spoolName(s)}`}
          value={gross || ""} onInput={(e) => { const v = val(e).replace(/\D/g, ""); (e.target as HTMLInputElement).value = v; setGross(Number(v) || 0); }} />
        <Button disabled={!gross} onClick={() => {
          setSpoolGrams(s, net, gross, a, "Audit count");
          addLine(a, { ref: s.id, label: spoolName(s), before: s.grams, after: net, unit: "g", by: who(), at: stamp() });
          log(`Audit ${a.no}: ${spoolName(s)} ${g(s.grams)} → ${g(net)} (gross ${g(gross)})`, spoolName(s), "stock");
        }}>Update</Button>
        <Button variant="outline" title="Weight in Emerald is correct — confirm and move on" onClick={() => {
          addLine(a, { ref: s.id, label: spoolName(s), before: s.grams, after: s.grams, unit: "g", by: who(), at: stamp(), ok: true });
          log(`Audit ${a.no}: ${spoolName(s)} confirmed at ${g(s.grams)}`, spoolName(s), "stock");
        }}>Next</Button>
      </span>
    </div>
  );
}
const SpoolHead = ({ s }: { s: Spool }) => (
  <span class="flex items-center gap-x-2.5 gap-y-0.5 min-w-0 flex-wrap">
    <span class="w-4 h-4 rounded border border-c2 shrink-0" style={{ background: s.hex || "transparent" }} />
    <span class="text-sm">{s.material}</span><span class="text-c3">›</span>
    <b class="text-sm">{s.colour}</b><span class="text-c3">›</span>
    <b class="text-[22px] leading-none num" title="Spool number">#{s.slot ?? "?"}</b><span class="text-c3">›</span>
    <span class="text-sm">{s.brand || "—"}</span><span class="text-c3">›</span>
    <span class="text-sm text-c3">{s.spoolMat || "Plastic"}</span>
  </span>
);

function NewSpool({ a, f, done }: { a: Audit; f: { mat: string; col: string; brand: string; body: string }; done: () => void }) {
  const M = filMasterSig.value;
  const [d, setD] = useState({ material: f.mat || M.materials[0]?.name || "PLA", colour: f.col, brand: f.brand, spoolMat: f.body || defaultBody(f.brand), size: M.size, gross: 0 });
  const tare = bodyTare(d.spoolMat) ?? M.tare, net = Math.max(0, d.gross - tare);
  const ok = d.material && d.colour && d.gross > 0;
  return (
    <Card class="!bg-c1">
      <b class="text-sm">New spool found on the shelf</b>
      <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mt-2">
        <Field label="Type"><input class={inputCls} list="au-mat" value={d.material} onInput={(e) => setD({ ...d, material: val(e) })} /></Field>
        <Field label="Colour"><input class={inputCls} list="au-col" value={d.colour} onInput={(e) => setD({ ...d, colour: val(e) })} /></Field>
        <Field label="Brand"><input class={inputCls} list="au-brand" value={d.brand} onInput={(e) => { const b = val(e); setD({ ...d, brand: b, spoolMat: defaultBody(b) }); }} /></Field>
        <Field label="Spool body"><select class={inputCls} value={d.spoolMat} onChange={(e) => setD({ ...d, spoolMat: (e.target as HTMLSelectElement).value })}>{M.bodies.map((b) => <option key={b.name} value={b.name}>{b.name} ({b.tare} g)</option>)}</select></Field>
        <Field label="Size (g)"><input class={inputCls} type="number" value={d.size} onInput={(e) => setD({ ...d, size: num(e) })} /></Field>
        <Field label={`Gross → net ${g(net)}`}><input class={inputCls} type="number" value={d.gross || ""} onInput={(e) => setD({ ...d, gross: num(e) })} /></Field>
      </div>
      <div class="flex gap-2 justify-end mt-3">
        <Button variant="outline" onClick={done}>Cancel</Button>
        <Button disabled={!ok} onClick={() => {
          const mm = masterMat(d.material), hex = M.colours.find((c) => c.name.toLowerCase() === d.colour.toLowerCase())?.hex;
          const s: Spool = { id: uid(), material: d.material, colour: d.colour, brand: d.brand, hex, grams: net, size: d.size || M.size, spoolNo: nextSpoolNo(), spoolMat: d.spoolMat, tare, gross: d.gross, diameter: M.diameter,
            costKg: mm?.costKg || M.costKg, nozzle: mm?.nozzle, bed: mm?.bed, status: "open", active: true, weighed: today(), bought: today(), notes: `Found in audit ${a.no}` };
          spoolsSig.value = [...spoolsSig.value, s];
          movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: spoolKey(s), dir: "in", qty: net, unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: "", colour: s.colour, brand: s.brand, notes: `Found in audit · ${a.no}`, by: who() }, ...movesSig.value];
          addLine(a, { ref: s.id, label: spoolName(s), before: 0, after: net, unit: "g", by: who(), at: stamp(), isNew: true });
          log(`Audit ${a.no}: added ${spoolName(s)} (${g(net)})`, spoolName(s), "stock");
          done();
        }}>Add spool</Button>
      </div>
    </Card>
  );
}

function FilamentAudit({ a }: { a: Audit }) {
  const [f, setF] = useState({ mat: "", col: "", brand: "", body: "" });
  const [adding, setAdding] = useState(false);
  const all = spoolsSig.value.filter((s) => s.active !== false && (s.grams > 0 && s.status !== "empty" || a.lines.some((l) => l.ref === s.id)));
  const by = (s: Spool, k: keyof typeof f) => (k === "mat" ? s.material : k === "col" ? s.colour : k === "brand" ? s.brand : s.spoolMat);
  const fit = (s: Spool, skip?: keyof typeof f) => (Object.keys(f) as (keyof typeof f)[]).every((k) => k === skip || !f[k] || by(s, k) === f[k]);
  const opts = (k: keyof typeof f) => uniq(all.filter((s) => fit(s, k)).map((s) => by(s, k)));
  const rows = all.filter((s) => fit(s)).sort((x, y) => Number(a.lines.some((l) => l.ref === x.id)) - Number(a.lines.some((l) => l.ref === y.id)) || spoolGroup(x).localeCompare(spoolGroup(y)) || (x.slot ?? 0) - (y.slot ?? 0));
  const picked = Object.values(f).some(Boolean);
  const M = filMasterSig.value;
  const hexOf = (c: string) => M.colours.find((x) => x.name.toLowerCase() === c.toLowerCase())?.hex ?? all.find((x) => x.colour === c)?.hex;
  const [cOpen, setCOpen] = useState(false);
  const Colour = (
    <div class="flex flex-col gap-0.5 min-w-0 relative"><span class="t-meta">Colour</span>
      <button type="button" class={`${sel} flex items-center gap-2 text-left`} onClick={() => setCOpen(!cOpen)} aria-expanded={cOpen}>
        {f.col && <span class="w-4 h-4 rounded border border-c2 shrink-0" style={{ background: hexOf(f.col) }} />}<span class="flex-1 truncate">{f.col || "Any"}</span><span class="text-c3">▾</span>
      </button>
      {cOpen && <div class="absolute z-20 top-full mt-1 left-0 w-64 max-h-80 overflow-y-auto rounded-xl border border-line bg-c0 shadow-lg p-1.5 grid grid-cols-1 gap-0.5">
        {["", ...opts("col")].map((c) => <button type="button" key={c || "any"} onClick={() => { setF({ ...f, col: c }); setCOpen(false); }}
          class={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-[13px] text-left hover:bg-c1 ${f.col === c ? "bg-c1 font-semibold" : ""}`}>
          <span class="w-5 h-5 rounded border border-c2 shrink-0" style={{ background: c ? hexOf(c) : "transparent" }} />{c || "Any colour"}</button>)}
      </div>}
    </div>
  );
  const S = (k: keyof typeof f, label: string) => (
    <label class="flex flex-col gap-0.5 min-w-0"><span class="t-meta">{label}</span>
      <select class={sel} value={f[k]} onChange={(e) => setF({ ...f, [k]: (e.target as HTMLSelectElement).value })}><option value="">Any</option>{opts(k).map((o) => <option key={o} value={o}>{o}</option>)}</select>
    </label>
  );
  return (
    <Section title="Find a spool" note="pick type, colour and brand — matching spools show below" action={<Button variant="outline" icon="plus" onClick={() => setAdding(true)}>Not in list — add new spool</Button>}>
      <datalist id="au-mat">{M.materials.map((m) => <option key={m.name} value={m.name} />)}</datalist>
      <datalist id="au-col">{M.colours.map((m) => <option key={m.name} value={m.name} />)}</datalist>
      <datalist id="au-brand">{M.brands.map((m) => <option key={m} value={m} />)}</datalist>
      <Card>
        <div class="grid grid-cols-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2 items-end">
          {S("mat", "Type / material")}{Colour}{S("brand", "Brand")}{S("body", "Spool body")}
          {picked && <Button variant="ghost" onClick={() => setF({ mat: "", col: "", brand: "", body: "" })}>Clear</Button>}
        </div>
      </Card>
      {adding && <NewSpool a={a} f={f} done={() => setAdding(false)} />}
      <Card>
        {!picked ? <p class="text-sm text-c3 py-2">Pick a type, colour or brand to list the spools to weigh.</p>
          : rows.length ? rows.map((s) => <SpoolRow key={s.id} s={s} a={a} />)
          : <p class="text-sm text-c3 py-2">No spool in Emerald matches. If it's on your shelf, use “Not in list — add new spool”.</p>}
      </Card>
    </Section>
  );
}

/** Spools not checked in this audit: on Finish they are emptied, binned, and the next spool of the group takes their slot. */
const pending = (a: Audit) => shelf().filter((s) => !a.lines.some((l) => l.ref === s.id));
function nextFor(s: Spool, gone: Set<string>) {
  const sib = spoolsSig.value.filter((x) => x.id !== s.id && !gone.has(x.id) && x.active !== false && x.grams > 0 && x.status !== "empty" && spoolGroup(x) === spoolGroup(s));
  return sib.sort((x, y) => (x.slot ?? 999) - (y.slot ?? 999)).find((x) => (x.slot ?? 999) > (s.slot ?? 0));
}
/** Any other live spool of the same type, colour and brand (no reorder needed). */
const hasStock = (s: Spool, gone: Set<string>) => spoolsSig.value.some((x) => x.id !== s.id && !gone.has(x.id) && x.active !== false && x.grams > 0 && x.status !== "empty" && spoolGroup(x) === spoolGroup(s));

function finishFilament(a: Audit, ok: Set<string>) {
  const lines: Line[] = [];
  for (const s of pending(a).filter((x) => ok.has(x.id))) {
    lines.push({ ref: s.id, label: spoolName(s), before: s.grams, after: s.grams, unit: "g", by: who(), at: stamp() });
    log(`Audit ${a.no}: ${spoolName(s)} confirmed OK as is (${g(s.grams)})`, spoolName(s), "stock");
  }
  const miss = pending(a).filter((x) => !ok.has(x.id)), gone = new Set(miss.map((s) => s.id)), offs: WriteOff[] = [];
  for (const s0 of miss) {
    const s = spoolsSig.value.find((x) => x.id === s0.id); if (!s) continue;
    const nx = nextFor(s, gone);
    offs.push({ label: spoolName(s), grams: s.grams, value: spoolValue(s), next: nx ? `#${nx.slot ?? "?"} becomes #${s.slot}` : hasStock(s, gone) ? "Others of this kind still in stock" : "None in stock · reorder" });
    movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: spoolKey(s), dir: "out", qty: s.grams, unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: "", colour: s.colour, brand: s.brand, notes: `Audit write-off (not found) · ${a.no}`, by: who() }, ...movesSig.value];
    const emptied: Spool = { ...s, grams: 0, gross: s.tare ?? 0, status: "empty", printer: "", notes: `${s.notes ? s.notes + " · " : ""}Not found in audit ${a.no}` };
    spoolsSig.value = spoolsSig.value.map((x) => (x.id === s.id ? emptied : nx && x.id === nx.id && s.slot != null ? { ...x, slot: s.slot } : x));
    toBin("Spool", emptied, `${spoolName(s)} · not found in audit ${a.no}`, who());
    log(`Audit ${a.no}: ${spoolName(s)} not found — emptied (${g(s.grams)}) and moved to Bin${nx ? `; #${nx.slot ?? "?"} becomes #${s.slot}` : hasStock(s, gone) ? "" : "; reorder"}`, spoolName(s), "stock");
  }
  return { offs, lines };
}

/* ---------------------------------------------------------------- packaging / accessories / spares */
function ItemAudit({ a }: { a: Audit }) {
  const [q, setQ] = useState(""); const [cnt, setCnt] = useState<Record<string, number | undefined>>({});
  const rows = itemsOf(a.cat).filter((p) => !q || `${p.name} ${p.size ?? ""} ${p.machine ?? ""}`.toLowerCase().includes(q.toLowerCase())).sort((x, y) => x.name.localeCompare(y.name));
  return (
    <Section title={`Count ${CAT_LABEL[a.cat].toLowerCase()}`} note="enter what's on the shelf and update — Emerald takes the counted quantity">
      <input class={`${inputCls} !h-9 md:!w-72`} type="search" placeholder="Filter by name" value={q} onInput={(e) => setQ(val(e))} />
      <Card class="!py-1">
        <Table rows={rows} rowKey={(p) => p.id} cols={[
          { key: "n", label: "Item", render: (p) => <span>{p.name}{p.size && <span class="t-meta block">{p.size}{p.machine ? ` · ${p.machine}` : ""}</span>}</span> },
          { key: "s", label: "In Emerald", align: "right", render: (p) => { const l = a.lines.find((x) => x.ref === p.id); return `${l ? l.before : p.qty} ${p.unit}`; } },
          { key: "c", label: "Counted", align: "right", render: (p) => { const l = a.lines.find((x) => x.ref === p.id);
            return l ? <b>{l.after} {p.unit}</b> : <input class={`${inputCls} !w-24 !h-9 text-right`} type="number" inputMode="numeric" aria-label={`Counted ${p.name}`} value={cnt[p.id] ?? ""} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setCnt({ ...cnt, [p.id]: v === "" ? undefined : Number(v) }); }} />; } },
          { key: "a", label: "Audit", card: "status", render: (p) => { const l = a.lines.find((x) => x.ref === p.id), c = cnt[p.id];
            if (l) return <span class="inline-flex items-center gap-2"><Status tone="done">{l.after - l.before ? `${l.after - l.before > 0 ? "+" : ""}${l.after - l.before}` : "Matches"}</Status><span class="t-meta">{l.by}</span></span>;
            return <Button disabled={c == null || c < 0} onClick={() => {
              const n = c ?? 0, d = n - p.qty, cat = a.cat;
              if (d) applyMove({ id: uid(), date: today(), cat, item: p.name, dir: d > 0 ? "in" : "out", qty: Math.abs(d), unit: p.unit, unitCost: p.cost, vendor: "", notes: `Audit count · ${a.no}`, by: who() });
              addLine(a, { ref: p.id, label: p.name, before: p.qty, after: n, unit: p.unit, by: who(), at: stamp() });
              log(`Audit ${a.no}: ${p.name} ${p.qty} → ${n} ${p.unit}`, p.name, "stock");
            }}>Update</Button>; } },
        ]} />
      </Card>
    </Section>
  );
}

/* ---------------------------------------------------------------- page */
function Report({ a }: { a: Audit }) {
  const ch = a.lines.filter((l) => l.after !== l.before || l.isNew);
  return (
    <Card>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <b>{a.no} · {CAT_LABEL[a.cat]}</b>
        <span class="t-meta">Started {a.started} by {a.by} · finished {a.finished} by {a.finishedBy} · counted by {uniq(a.lines.map((l) => l.by)).join(", ") || "—"}</span>
      </div>
      <p class="text-sm mt-1">{a.lines.length} checked · {ch.length} changed{a.writeOffs?.length ? ` · ${a.writeOffs.length} not found, written off ${g(a.writeOffs.reduce((s, w) => s + w.grams, 0))} · ${inr(a.writeOffs.reduce((s, w) => s + w.value, 0))}` : ""}</p>
      {(ch.length > 0 || !!a.writeOffs?.length) && <div class="mt-2 text-sm">
        {ch.map((l) => <div key={l.ref} class="flex justify-between gap-2 py-1 border-t border-line"><span class="min-w-0 truncate">{l.label}<span class="t-meta block">{l.by} · {l.at}</span></span><b class="num whitespace-nowrap">{l.isNew ? `new · ${l.after} ${l.unit}` : `${l.before} → ${l.after} ${l.unit}`}</b></div>)}
        {a.writeOffs?.map((w) => <div key={w.label} class="flex justify-between gap-2 py-1 border-t border-line"><span class="min-w-0 truncate">{w.label}<span class="t-meta block">Not found · emptied → Bin · next: {w.next}</span></span><b class="num whitespace-nowrap">−{g(w.grams)}</b></div>)}
      </div>}
    </Card>
  );
}

export function StockAudit() {
  const [cat, setCat] = useState<Cat>("filament");
  const [hist, setHist] = useState(false);
  const [confirm, setConfirm] = useState(false);
  /** Unlogged spools the user confirmed are fine as they are; the rest are "not found". */
  const [ok, setOk] = useState<Set<string>>(new Set());
  const flip = (id: string, v: boolean) => { const n = new Set(ok); v ? n.add(id) : n.delete(id); setOk(n); };
  const a = auditsSig.value.find((x) => x.cat === cat && x.status === "open");
  const done = auditsSig.value.filter((x) => x.status === "done");
  const total = a ? (cat === "filament" ? shelf().length + a.lines.filter((l) => !shelf().some((s) => s.id === l.ref)).length : itemsOf(cat).length) : 0;
  const miss = a && cat === "filament" ? pending(a) : [];
  const finish = () => {
    if (!a) return;
    const { offs, lines } = cat === "filament" ? finishFilament(a, ok) : { offs: [], lines: [] };
    put({ ...a, lines: [...a.lines, ...lines], status: "done", finished: stamp(), finishedBy: who(), writeOffs: offs });
    log(`Finished stock audit ${a.no} (${CAT_LABEL[cat]}): ${a.lines.length} checked${offs.length ? `, ${offs.length} written off` : ""}`, a.no, "stock");
    setConfirm(false); setOk(new Set()); setHist(true);
  };
  return (
    <Page title="Store" sub="Stock audit — count everything on the shelf and cross-check against Emerald. Every change is logged with who counted it." tabs={WORKSHOP_TABS}
      actions={<>
        <Button variant="outline" icon="list" onClick={() => setHist(!hist)}>{hist ? "Back to audit" : `Past audits (${done.length})`}</Button>
        {a && !hist && <Button icon="check" onClick={() => { setOk(new Set()); setConfirm(true); }}>Finish &amp; reconcile</Button>}
      </>}
      toolbar={!hist && <Pick value={cat} on={(c) => { setCat(c); setConfirm(false); }} items={CATS} label={(c) => CAT_LABEL[c]} title="Audit" />}>
      <div class="w-full max-w-[860px] mx-auto flex flex-col gap-4">
      {hist ? <>{done.length ? done.map((x) => <Report key={x.id} a={x} />) : <Card><p class="text-sm text-c3">No finished audits yet.</p></Card>}</>
      : !a ? (
        <Card>
          <b class="text-[15px]">No {CAT_LABEL[cat].toLowerCase()} audit running</b>
          <p class="text-sm text-c3 mt-1 mb-3">{cat === "filament"
            ? "Take every spool off the printers first. Then find each spool here by type, colour and brand, enter its gross weight with the spool, and update. Spools nobody checks are emptied and moved to the Bin when you finish — the next spool of the same type, colour and brand takes their place."
            : "Count each item on the shelf and update it here. Emerald takes the counted quantity and logs the difference. Items you don't count are left as they are."}</p>
          <Button icon="plus" onClick={() => start(cat)}>Start {CAT_LABEL[cat].toLowerCase()} audit</Button>
        </Card>
      ) : <>
        <Card>
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span><b class="text-[15px]">Audit {a.no} · {CAT_LABEL[cat]}</b> <Status tone="waiting">In progress</Status></span>
            <span class="t-meta">Started {a.started} by {a.by}{a.lines.length ? ` · counted by ${uniq(a.lines.map((l) => l.by)).join(", ")}` : ""}</span>
          </div>
          <div class="mt-2"><Progress value={total ? Math.round((a.lines.length / total) * 100) : 0} /></div>
          <p class="t-meta mt-1">{a.lines.length} of {total} checked · progress is saved, you can continue later</p>
        </Card>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label={cat === "filament" ? "spools in Emerald" : "items"} value={total} />
          <Stat label="checked" value={a.lines.length} />
          <Stat label="changed" value={cat === "filament" ? `${a.lines.filter((l) => l.after !== l.before && !l.isNew).length} · ${g(a.lines.filter((l) => !l.isNew).reduce((s, l) => s + l.after - l.before, 0))}` : a.lines.filter((l) => l.after !== l.before).length} />
          <Stat label={cat === "filament" ? "not yet found" : "not counted"} value={cat === "filament" ? miss.length : total - a.lines.length} />
        </div>
        {confirm && (
          <Card dark>
            <b>Finish {a.no}?</b>
            {cat === "filament" ? <>
              <p class="text-sm mt-1">{miss.length ? `${miss.length} spool${miss.length > 1 ? "s were" : " was"} not logged in this audit. Confirm each one: “Not found” spools are set to 0 g, marked empty and moved to the Bin, and the next spool of the same type, colour and brand takes their place. “OK” spools stay exactly as they are.` : "Every spool was checked — nothing will be written off."}</p>
              {miss.length > 0 && <>
                <div class="flex flex-wrap gap-2 mt-2"><Button variant="outline" onClick={() => setOk(new Set())}>All rest not found</Button><Button variant="outline" onClick={() => setOk(new Set(miss.map((m) => m.id)))}>All rest are OK</Button></div>
                <div class="mt-2 text-sm max-h-80 overflow-y-auto">{miss.map((s) => { const isOk = ok.has(s.id), nx = nextFor(s, new Set(miss.filter((m) => !ok.has(m.id)).map((m) => m.id)));
                  return <div key={s.id} class="flex flex-wrap items-center justify-between gap-2 py-1.5 border-t border-line">
                    <span class="min-w-0">{spoolName(s)} · {s.brand || "—"} · {g(s.grams)} · {inr(spoolValue(s))}
                      <span class="t-meta block">{isOk ? "Stays as it is" : nx ? `Emptied → Bin · #${nx.slot ?? "?"} becomes #${s.slot}` : hasStock(s, new Set(miss.filter((m) => !ok.has(m.id)).map((m) => m.id))) ? "Emptied → Bin · others of this kind still in stock" : "Emptied → Bin · none in stock, reorder"}</span></span>
                    <Pick value={isOk ? "ok" : "missing"} on={(v) => flip(s.id, v === "ok")} items={["missing", "ok"]} label={(v) => (v === "ok" ? "OK" : "Not found")} />
                  </div>; })}</div>
                <p class="t-meta mt-2">{miss.filter((x) => !ok.has(x.id)).length} not found · written off {g(miss.filter((x) => !ok.has(x.id)).reduce((s, x) => s + x.grams, 0))} · {inr(miss.filter((x) => !ok.has(x.id)).reduce((s, x) => s + spoolValue(x), 0))} · {ok.size} OK</p>
              </>}
            </> : <p class="text-sm mt-1">{a.lines.length} item{a.lines.length === 1 ? "" : "s"} counted. Items not counted stay as they are.</p>}
            <div class="flex gap-2 justify-end mt-3"><Button variant="outline" onClick={() => setConfirm(false)}>Keep counting</Button><Button onClick={finish}>Finish audit</Button></div>
          </Card>
        )}
        {cat === "filament" ? <FilamentAudit a={a} /> : <ItemAudit a={a} />}
      </>}
      </div>
    </Page>
  );
}
