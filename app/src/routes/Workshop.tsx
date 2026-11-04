import { useState } from "preact/hooks";
import type { Signal } from "@preact/signals";
import { WORKSHOP_TABS } from "../nav";
import { navigate } from "../router";
import { Pick, Button, Card, Disclosure, Meter, Field, inputCls, Page, Progress, Section, Stat, Status, Table, type Col } from "../ui";
import { Actions, Facts, Inspect, PaneSection, useRecord, type FDef } from "../ui/record";
import {
  applyMove, committed, consSig, inr, itemsSig, jobsSig, log, me, movesSig, packSig, printersSig, REORDER_G, shortDate, spoolPct, spoolsSig, spoolValue, stockNames, today, uid, X,
  type ConKind, type Consumption, type Movement, type PackItem, type Printer, type Spool,
} from "../data";
import { ConsumeForm } from "./work/shared";

const who = () => me.value?.name ?? "You";
const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
const val = (e: Event) => (e.target as HTMLInputElement).value;

function Shell({ sub, actions, toolbar, detail, children }: { sub: string; actions?: preact.ComponentChildren; toolbar?: preact.ComponentChildren; detail?: preact.ComponentChildren | null; children: preact.ComponentChildren }) {
  return <Page title="Store" sub={sub} actions={actions} toolbar={toolbar} detail={detail ?? null} tabs={WORKSHOP_TABS}>{children}</Page>;
}
const ActiveChips = ({ v, on }: { v: string; on: (x: string) => void }) => (
  <div class="flex flex-wrap items-center gap-2"><Pick value={v} on={on} items={["active", "retired", "all"]} label={(x) => x[0].toUpperCase() + x.slice(1)} /></div>
);
const byActive = <T extends { active?: boolean }>(rows: T[], f: string) => rows.filter((r) => (f === "all" ? true : f === "retired" ? r.active === false : r.active !== false));
const stockTone = (q: number, at: number) => (q <= 0 ? <Status tone="blocked">Out</Status> : q <= at ? <Status tone="waiting">Reorder</Status> : <Status tone="done">OK</Status>);

/* ================================================================ Printers */
const STATUS = ["idle", "printing", "down"];
const pFields: FDef<Printer>[] = [
  { k: "name", label: "Name (what the floor calls it)" }, { k: "model", label: "Model" },
  { k: "status", label: "Status", type: "select", options: STATUS }, { k: "nozzle", label: "Nozzle" },
  { k: "volume", label: "Build volume", suffix: "mm" }, { k: "serial", label: "Serial no." },
  { k: "location", label: "Location" }, { k: "hours", label: "Lifetime hours", type: "number", suffix: "h" },
  { k: "bought", label: "Bought on", type: "date" }, { k: "cost", label: "Purchase cost", type: "number", suffix: "₹" },
  { k: "lastService", label: "Last service", type: "date" }, { k: "serviceEvery", label: "Service every", type: "number", suffix: "h" },
  { k: "notes", label: "Notes", type: "textarea" },
];
const mlog = (p: Printer) => X.machineLog.find((m) => m.printer === p.name) ?? { util: 0, uptime: 100, fail: 0, lost: 0, blocks: 0 };
const pTone = (s: string) => (s === "printing" ? "active" : s === "down" ? "blocked" : "idle") as "active";

export function Printers() {
  const [f, setF] = useState("active");
  const r = useRecord<Printer>({
    sig: printersSig, kind: "Printer", title: (p) => p.name, fields: pFields,
    blank: () => ({ id: uid(), name: "", model: "", status: "idle", hours: 0, nozzle: "0.4 mm", volume: "256×256×256", serviceEvery: 300, active: true }),
    facts: (p) => { const m = mlog(p); return [["Status", <Status tone={pTone(p.status)}>{p.status}</Status>], ["Current job", p.job ?? "—"], ["Utilisation", `${m.util}%`], ["Uptime", `${m.uptime}%`], ["Fail rate", `${m.fail}%`], ["Hours lost to blocks", `${m.lost} h`]]; },
    actions: (p, put) => <>
      <select class="h-9 md:h-10 pl-4 pr-3 rounded-full border border-c4 bg-c0 text-[13px] md:text-sm font-semibold cursor-pointer" value={p.status} aria-label="Set status" onChange={(e) => put({ status: (e.target as HTMLSelectElement).value as Printer["status"] }, `Status → ${(e.target as HTMLSelectElement).value}`)}>{STATUS.map((s) => <option key={s}>{s}</option>)}</select>
      <Button variant="outline" onClick={() => put({ lastService: today() }, "Serviced")}>Log service</Button>
    </>,
    extra: (p) => {
      const loaded = spoolsSig.value.filter((s) => s.printer === p.name && s.status === "loaded");
      const parts = itemsSig.value.filter((i) => i.machine === p.name);
      const jobs = jobsSig.value.filter((j) => j.printer === p.name);
      const used = consSig.value.filter((c) => c.printer === p.name);
      return <>
        <PaneSection title="Loaded spools">{loaded.length ? loaded.map((s) => <div key={s.id} class="flex items-center justify-between text-sm"><span class="flex items-center gap-2"><Swatch hex={s.hex} />{s.material} {s.colour} · {s.spoolNo}</span><span class="num font-semibold">{s.grams} g</span></div>) : <p class="text-sm text-c3">Nothing loaded.</p>}</PaneSection>
        <PaneSection title="Service">{p.serviceEvery ? <><div class="flex justify-between text-sm"><span>Next service in</span><b class="num">{Math.max(0, p.serviceEvery - (p.hours % p.serviceEvery))} h</b></div><Progress value={((p.hours % p.serviceEvery) / p.serviceEvery) * 100} /></> : <p class="text-sm text-c3">No interval set.</p>}</PaneSection>
        <PaneSection title={`Jobs · ${jobs.length}`}>{jobs.length ? jobs.map((j) => <div key={j.id} class="flex justify-between gap-2 text-sm"><span class="min-w-0"><b>{j.orderNo}</b> · {j.item}</span><Status tone={j.status === "done" ? "done" : j.status === "failed" ? "blocked" : j.status === "printing" ? "active" : "waiting"}>{j.status}</Status></div>) : <p class="text-sm text-c3">No jobs.</p>}</PaneSection>
        <PaneSection title="Spares for this machine">{parts.length ? parts.map((i) => <div key={i.id} class="flex justify-between text-sm"><span>{i.name}</span><span class="num">{i.qty} {i.unit}</span></div>) : <p class="text-sm text-c3">None tagged.</p>}</PaneSection>
        <PaneSection title="Consumption logged"><p class="text-sm"><b class="num">{used.filter((c) => c.kind === "machine").reduce((s, c) => s + c.qty, 0)} h</b> machine · <b class="num">{inr(used.reduce((s, c) => s + c.cost, 0))}</b> total</p></PaneSection>
      </>;
    },
  });
  const rows = byActive(printersSig.value, f);
  return (
    <Shell sub="Machines · status, utilisation, service, spools loaded" actions={<Button icon="plus" onClick={() => r.add()}>Add printer</Button>} toolbar={<ActiveChips v={f} on={setF} />} detail={r.detail}>
      <Card>
        <Table rows={rows} rowKey={(p) => p.id} onRow={r.open} cols={[
          { key: "n", label: "Printer", render: (p) => <span>{p.name}{p.active === false && <span class="ml-2 text-xs text-c3 font-normal">retired</span>}</span> },
          { key: "m", label: "Model", render: (p) => p.model },
          { key: "s", label: "Status", render: (p) => <Status tone={pTone(p.status)}>{p.status}</Status> },
          { key: "j", label: "Job", render: (p) => p.job ?? "—", hideTablet: true },
          { key: "u", label: "Util.", align: "right", render: (p) => `${mlog(p).util}%` },
          { key: "f", label: "Fail", align: "right", render: (p) => `${mlog(p).fail}%` },
          { key: "h", label: "Hours", align: "right", render: (p) => p.hours.toLocaleString("en-IN") },
        ]} />
      </Card>
      <p class="text-xs text-c3">Tap a printer for details. Retire takes it off every picker; old jobs keep its name. Delete is only for a row typed by mistake — it goes to the Bin.</p>
    </Shell>
  );
}

/* ================================================================ Filament */
const Swatch = ({ hex }: { hex?: string }) => <span class="inline-block w-3.5 h-3.5 rounded-full border border-c3 shrink-0" style={{ background: hex || "transparent" }} aria-hidden="true" />;
const MATS = ["PLA", "PETG", "TPU", "ABS", "ASA", "PA-CF", "Resin"];
const SP_STATUS = ["sealed", "open", "loaded", "empty"];
const sFields: FDef<Spool>[] = [
  { k: "material", label: "Material", type: "select", options: MATS }, { k: "colour", label: "Colour" },
  { k: "hex", label: "Colour swatch", type: "color" }, { k: "brand", label: "Brand" },
  { k: "finish", label: "Finish / line", }, { k: "diameter", label: "Diameter", type: "number", suffix: "mm" },
  { k: "spoolNo", label: "Spool no." }, { k: "lot", label: "Batch / lot" },
  { k: "size", label: "Nominal net", type: "number", suffix: "g" }, { k: "tare", label: "Empty spool (tare)", type: "number", suffix: "g" },
  { k: "gross", label: "Gross (last weigh-in)", type: "number", suffix: "g" }, { k: "grams", label: "Net remaining", type: "number", suffix: "g" },
  { k: "costKg", label: "Cost per kg", type: "number", suffix: "₹" }, { k: "vendor", label: "Vendor" },
  { k: "bought", label: "Bought on", type: "date" }, { k: "opened", label: "Opened on", type: "date" },
  { k: "dried", label: "Last dried", type: "date" }, { k: "location", label: "Storage / dry box" },
  { k: "nozzle", label: "Nozzle temp" }, { k: "bed", label: "Bed temp" },
  { k: "status", label: "Status", type: "select", options: SP_STATUS }, { k: "printer", label: "Loaded on", type: "select", options: () => ["", ...printersSig.value.filter((p) => p.active !== false).map((p) => p.name)] },
  { k: "notes", label: "Notes", type: "textarea" },
];
const spTone = (s: Spool) => (s.grams <= 0 ? <Status tone="blocked">Out</Status> : s.grams < 250 ? <Status tone="waiting">Low</Status> : s.status === "loaded" ? <Status tone="active">Loaded</Status> : <Status tone="idle">{s.status ?? "open"}</Status>);

function WeighIn({ s, put }: { s: Spool; put: (p: Partial<Spool>, why?: string) => void }) {
  const [g, setG] = useState(0);
  const tare = s.tare ?? 0, net = Math.max(0, g - tare), diff = net - s.grams;
  return (
    <PaneSection title="Weigh-in">
      <p class="text-xs text-c3">Finished jobs already deducted their planned grams. Weigh to correct the record: net = gross − tare ({tare} g); the difference is logged as variance.</p>
      <div class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <Field label="Gross on scale (g)"><input class={inputCls} type="number" value={g || ""} onInput={(e) => setG(num(e))} /></Field>
        <Button icon="scale" class="!h-10 md:!h-11" disabled={!g} onClick={() => {
          put({ gross: g, grams: net, weighed: today(), status: net <= 0 ? "empty" : s.status }, `Weighed ${s.spoolNo}: ${g} g gross → ${net} g net`);
          if (diff) movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: `${s.material} ${s.colour} · ${s.spoolNo}`, dir: diff > 0 ? "in" : "out", qty: Math.abs(diff), unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: "", colour: s.colour, brand: s.brand, notes: "Weigh-in variance", by: who() }, ...movesSig.value];
          setG(0);
        }}>Save</Button>
      </div>
      {g > 0 && <Facts items={[["Expected (record)", `${s.grams.toLocaleString("en-IN")} g`], ["Scale net", `${net.toLocaleString("en-IN")} g`], ["Variance vs slicer", `${diff > 0 ? "+" : ""}${diff} g`], ["Variance %", s.grams ? `${((diff / s.grams) * 100).toFixed(1)}%` : "—"]]} />}
    </PaneSection>
  );
}

export function Filament() {
  const [mat, setMat] = useState("all");
  const [st, setSt] = useState("in stock");
  const [q, setQ] = useState("");
  const r = useRecord<Spool>({
    sig: spoolsSig, kind: "Spool", title: (s) => `${s.material} ${s.colour} · ${s.spoolNo}`, fields: sFields,
    blank: () => ({ id: uid(), material: "PLA", colour: "", hex: "#000000", brand: "", finish: "", diameter: 1.75, grams: 1000, size: 1000, tare: 250, gross: 1250, costKg: 1250, spoolNo: `SP-${String(spoolsSig.value.length + 1).padStart(3, "0")}`, vendor: "", bought: today(), status: "sealed", active: true }),
    onSave: (s, isNew) => { if (isNew) movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: `${s.material} ${s.colour} · ${s.spoolNo}`, dir: "in", qty: s.grams, unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: s.vendor ?? "", colour: s.colour, brand: s.brand, notes: "New spool", by: who() }, ...movesSig.value]; },
    facts: (s) => [
      ["Net remaining", <span class="text-lg font-extrabold num">{s.grams.toLocaleString("en-IN")} g</span>], ["Remaining", <span class="flex items-center gap-2"><span class="num">{spoolPct(s)}%</span><span class="flex-1"><Progress value={spoolPct(s)} /></span></span>],
      ["Gross · tare", `${(s.gross ?? s.grams + (s.tare ?? 0)).toLocaleString("en-IN")} g · ${s.tare ?? 0} g`], ["Value left", inr(spoolValue(s))],
      ["Committed to queued jobs", `${committed(s).toLocaleString("en-IN")} g`], ["Expected after queue", <span class="num">{(s.grams - committed(s)).toLocaleString("en-IN")} g</span>],
      ["Cost per gram", `₹${((s.costKg ?? 0) / 1000).toFixed(2)}`], ["State", spTone(s)],
    ],
    actions: (s, put) => <>
      <select class="h-9 md:h-10 pl-4 pr-3 rounded-full border border-c4 bg-c0 text-[13px] md:text-sm font-semibold cursor-pointer" value={s.status === "loaded" ? s.printer ?? "" : ""} aria-label="Load on printer"
        onChange={(e) => { const p = (e.target as HTMLSelectElement).value; put(p ? { status: "loaded", printer: p, opened: s.opened || today() } : { status: s.grams > 0 ? "open" : "empty", printer: "" }, p ? `Loaded on ${p}` : "Unloaded"); }}>
        <option value="">Not loaded</option>{printersSig.value.filter((p) => p.active !== false).map((p) => <option key={p.id} value={p.name}>Load on {p.name}</option>)}
      </select>
      <Button variant="outline" onClick={() => put({ dried: today() }, "Dried")}>Mark dried</Button>
    </>,
    extra: (s, put) => {
      const use = consSig.value.filter((c) => c.item.includes(s.spoolNo));
      return <>
        <WeighIn s={s} put={put} />
        <PaneSection title={`Usage · ${use.length}`}>
          {use.length ? use.map((c) => <div key={c.id} class="flex justify-between gap-2 text-sm border-t border-line first:border-0 py-1"><span class="min-w-0">{c.orderNo ?? "Store"} · <span class="capitalize">{c.kind}</span><span class="block text-xs text-c3">{c.at} · {c.who}</span></span><b class="num whitespace-nowrap">{c.qty} g</b></div>) : <p class="text-sm text-c3">No consumption logged against this spool.</p>}
          <ConsumeForm />
        </PaneSection>
      </>;
    },
  });
  const all = spoolsSig.value.filter((s) => s.active !== false || st === "retired");
  const mats = [...new Set(spoolsSig.value.map((s) => s.material))];
  const shown = all.filter((s) => (mat === "all" || s.material === mat) && (st === "all" ? true : st === "in stock" ? s.grams > 0 && s.active !== false : st === "retired" ? s.active === false : s.status === st)
    && (!q || `${s.colour} ${s.brand} ${s.spoolNo} ${s.finish}`.toLowerCase().includes(q.toLowerCase())));
  const tot = spoolsSig.value.filter((s) => s.active !== false);
  return (
    <Shell sub="Every spool — weight, colour, brand, cost, storage · tap a spool for weigh-in and history" actions={<><Button variant="outline" icon="in" onClick={() => navigate("/workshop/movements")}>Log movement</Button><Button icon="plus" onClick={() => r.add()}>Add spool</Button></>}
      toolbar={<div class="flex flex-wrap items-center gap-2">
        <input class="h-7 2xl:h-8 px-3 rounded-full bg-c0 text-xs w-36" placeholder="Search colour, brand…" value={q} onInput={(e) => setQ(val(e))} aria-label="Search spools" />
        <Pick title="Material" value={mat} on={setMat} items={["all", ...mats]} label={(m) => m === "all" ? "All materials" : m} />
        <Pick title="Status" value={st} on={setSt} items={["in stock", "sealed", "open", "loaded", "empty", "retired", "all"]} label={(x) => x[0].toUpperCase() + x.slice(1)} />
      </div>} detail={r.detail}>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat value={`${(tot.reduce((s, x) => s + x.grams, 0) / 1000).toFixed(2)} kg`} label="on shelf" />
        <Stat value={inr(tot.reduce((s, x) => s + spoolValue(x), 0))} label="value" />
        <Stat value={tot.filter((s) => s.grams > 0).length} label="spools in stock" />
        <Stat value={tot.filter((s) => s.grams < 250).length} label="low or out" />
      </div>
      {(mat === "all" ? mats : [mat]).map((m) => {
        const sp = shown.filter((s) => s.material === m);
        if (!sp.length) return null;
        const g = tot.filter((s) => s.material === m).reduce((s, x) => s + x.grams, 0);
        return (
          <Disclosure key={m} open title={<span class="inline-flex items-center gap-2">{m}<span class="t-meta font-normal">{sp.length} spools</span>{g <= REORDER_G && <span class="text-[11px] font-semibold px-1.5 rounded bg-warn/15">{g <= 0 ? "Out" : "Reorder"}</span>}</span>}
            meta={`${(g / 1000).toFixed(2)} kg · ${inr(tot.filter((s) => s.material === m).reduce((s, x) => s + spoolValue(x), 0))}`}>
              <Table rows={sp} rowKey={(s) => s.id} onRow={r.open} cols={[
                { key: "n", label: "Spool", render: (s) => <span class="inline-flex items-center gap-2 font-mono text-[12px] font-bold"><span title={s.status} class={`w-1.5 h-1.5 rounded-full ${s.grams <= 0 ? "bg-c2" : s.grams < 250 ? "bg-warn" : s.status === "loaded" ? "bg-c4" : "border border-c4"}`} />{s.spoolNo}</span> },
                { key: "c", label: "Colour · brand", render: (s) => <span class="inline-flex items-center gap-2"><Swatch hex={s.hex} />{s.colour}<span class="t-meta">{s.brand}{s.finish ? ` · ${s.finish}` : ""}</span></span> },
                { key: "p", label: "Weight left", render: (s) => <span class="block min-w-[120px]"><Meter value={spoolPct(s)} label={`${s.grams.toLocaleString("en-IN")} g`} /></span> },
                { key: "a", label: "After queue", align: "right", render: (s) => { const a = s.grams - committed(s); return committed(s) ? `${a.toLocaleString("en-IN")} g` : "—"; }, hideTablet: true },
                { key: "l", label: "Where", render: (s) => (s.status === "loaded" ? s.printer : s.location) || "—", hideTablet: true },
                { key: "v", label: "Value", align: "right", render: (s) => inr(spoolValue(s)), hideTablet: true },
                { key: "s", label: "State", render: (s) => spTone(s), hideTablet: true },
                { key: "x", label: "", align: "right", render: (s) => <button class="h-6 px-2 rounded-md border border-line text-[11px] font-semibold hover:bg-c1 cursor-pointer" onClick={(e) => { e.stopPropagation(); r.open(s); }}>Weigh</button> },
              ]} />
          </Disclosure>
        );
      })}
      {!shown.length && <Card><p class="text-sm text-c3 text-center py-6">No spools match these filters.</p></Card>}
    </Shell>
  );
}

/* ================================================================ Accessories, parts, packing */
function Adjust({ it, cat }: { it: PackItem; cat: string }) {
  const [d, setD] = useState({ dir: "in" as "in" | "out", qty: 0, cost: it.cost, vendor: it.vendor ?? "", notes: "" });
  return (
    <PaneSection title="Adjust stock">
      <div class="grid grid-cols-2 gap-3">
        <Field label="Direction"><select class={inputCls} value={d.dir} onChange={(e) => setD({ ...d, dir: (e.target as HTMLSelectElement).value as "in" })}><option value="in">In — bought / returned</option><option value="out">Out — used / written off</option></select></Field>
        <Field label={`Qty (${it.unit})`}><input class={inputCls} type="number" value={d.qty || ""} onInput={(e) => setD({ ...d, qty: num(e) })} /></Field>
        {d.dir === "in" && <Field label="Unit cost ₹"><input class={inputCls} type="number" value={d.cost} onInput={(e) => setD({ ...d, cost: num(e) })} /></Field>}
        {d.dir === "in" && <Field label="Vendor"><input class={inputCls} value={d.vendor} onInput={(e) => setD({ ...d, vendor: val(e) })} /></Field>}
        <div class="col-span-2"><Field label="Notes"><input class={inputCls} value={d.notes} onInput={(e) => setD({ ...d, notes: val(e) })} placeholder={d.dir === "out" ? "Fitted to A1-02 / damaged" : "Bill no."} /></Field></div>
      </div>
      <Actions><Button icon={d.dir} disabled={!d.qty} onClick={() => { applyMove({ id: uid(), date: today(), cat, item: it.name, dir: d.dir, qty: d.qty, unit: it.unit, unitCost: d.dir === "in" ? d.cost : it.cost, vendor: d.dir === "in" ? d.vendor : "", notes: d.notes, by: who() }); log(`Stock ${d.dir} ${d.qty} ${it.unit}`, it.name, "stock"); setD({ ...d, qty: 0, notes: "" }); }}>Record {d.dir}</Button></Actions>
    </PaneSection>
  );
}

const iFields = (part: boolean): FDef<PackItem>[] => [
  { k: "name", label: "Name", wide: true }, { k: "unit", label: "Unit", type: "select", options: ["pcs", "m", "roll", "kg", "g", "set"] },
  { k: "size", label: "Size / spec" }, { k: "qty", label: "In stock", type: "number" }, { k: "reorderAt", label: "Reorder at", type: "number" },
  { k: "cost", label: "Unit cost", type: "number", suffix: "₹" }, { k: "vendor", label: "Vendor" }, { k: "location", label: "Storage" },
  ...(part ? [{ k: "machine" as const, label: "Fits machine", type: "select" as const, options: () => ["", ...printersSig.value.map((p) => p.name)] }] : []),
  { k: "notes", label: "Notes", type: "textarea" },
];
const iCols = (): Col<PackItem>[] => [
  { key: "n", label: "Item", render: (p) => <span>{p.name}{p.active === false && <span class="ml-2 text-xs text-c3 font-normal">retired</span>}</span> },
  { key: "q", label: "Stock", align: "right", render: (p) => `${p.qty} ${p.unit}` },
  { key: "r", label: "Reorder at", align: "right", render: (p) => p.reorderAt },
  { key: "c", label: "Unit cost", align: "right", render: (p) => inr(p.cost) },
  { key: "v", label: "Value", align: "right", render: (p) => inr(p.cost * p.qty) },
  { key: "w", label: "Vendor", render: (p) => p.vendor || "—", hideTablet: true },
  { key: "s", label: "State", render: (p) => stockTone(p.qty, p.reorderAt) },
];
function useItems(sig: Signal<PackItem[]>, kind: string, cat: (p: PackItem) => string, part: (p: PackItem) => boolean, blankCat?: string) {
  return useRecord<PackItem>({
    sig, kind, title: (p) => p.name, fields: iFields(false),
    blank: () => ({ id: uid(), name: "", unit: "pcs", qty: 0, reorderAt: 0, cost: 0, vendor: "", active: true, cat: blankCat }),
    facts: (p) => [["In stock", <span class="text-lg font-extrabold num">{p.qty} {p.unit}</span>], ["State", stockTone(p.qty, p.reorderAt)], ["Value", inr(p.qty * p.cost)], ["Reorder at", `${p.reorderAt} ${p.unit}`]],
    extra: (p) => {
      const mv = movesSig.value.filter((m) => m.item === p.name);
      const used = consSig.value.filter((c) => c.item === p.name);
      return <>
        {part(p) && <PaneSection title="Fits machine"><p class="text-sm">{p.machine || "Any machine"}</p></PaneSection>}
        <Adjust it={p} cat={cat(p)} />
        <PaneSection title={`History · ${mv.length + used.length}`}>
          {[...mv.map((m) => ({ id: m.id, d: m.date, t: `${m.dir === "in" ? "+" : "−"}${m.qty} ${m.unit}`, w: m.notes || m.vendor || (m.dir === "in" ? "Received" : "Used"), by: m.by })),
            ...used.map((c) => ({ id: c.id, d: c.at.slice(0, 10), t: `−${c.qty} ${c.unit}`, w: `Used on ${c.orderNo ?? "store"}`, by: c.who }))].sort((a, b) => b.d.localeCompare(a.d)).map((h) => (
            <div key={h.id} class="flex justify-between gap-2 text-sm py-1 border-t border-line first:border-0"><span class="min-w-0">{h.w}<span class="block text-xs text-c3">{shortDate(h.d)} · {h.by}</span></span><b class="num whitespace-nowrap">{h.t}</b></div>
          ))}
          {!mv.length && !used.length && <p class="text-sm text-c3">No movements yet.</p>}
        </PaneSection>
      </>;
    },
  });
}

export function Parts() {
  const [f, setF] = useState("active");
  const r = useItems(itemsSig, "Accessory / part", (p) => (p.cat === "Part" ? "part" : "accessory"), (p) => p.cat === "Part");
  const rows = byActive(itemsSig.value, f);
  return (
    <Shell sub="Magnets, NFC tags, inserts and machine spares · tap a row to adjust stock" toolbar={<ActiveChips v={f} on={setF} />} detail={r.detail}
      actions={<><Button variant="outline" icon="plus" onClick={() => r.add({ cat: "Part" })}>Add part</Button><Button icon="plus" onClick={() => r.add({ cat: "Accessory" })}>Add accessory</Button></>}>
      <Section title="Accessories" note={String(rows.filter((a) => a.cat !== "Part").length)}><Card><Table rows={rows.filter((a) => a.cat !== "Part")} rowKey={(a) => a.id} onRow={r.open} cols={iCols()} /></Card></Section>
      <Section title="Parts & spares" note={String(rows.filter((a) => a.cat === "Part").length)}><Card><Table rows={rows.filter((a) => a.cat === "Part")} rowKey={(a) => a.id} onRow={r.open} cols={[...iCols().slice(0, 1), { key: "m", label: "Machine", render: (p) => p.machine || "Any" }, ...iCols().slice(1)]} /></Card></Section>
    </Shell>
  );
}

export function PackStock() {
  const [f, setF] = useState("active");
  const r = useItems(packSig, "Packing item", () => "packing", () => false);
  const rows = byActive(packSig.value, f);
  return (
    <Shell sub="Boxes, wrap, tape, stickers — consumed at packing" toolbar={<ActiveChips v={f} on={setF} />} detail={r.detail} actions={<Button icon="plus" onClick={() => r.add()}>Add packing item</Button>}>
      <div class="grid grid-cols-3 gap-2">
        <Stat value={rows.length} label="items" />
        <Stat value={inr(rows.reduce((s, p) => s + p.qty * p.cost, 0))} label="value" />
        <Stat value={rows.filter((p) => p.qty <= p.reorderAt).length} label="to reorder" />
      </div>
      <Card><Table rows={rows} rowKey={(p) => p.id} onRow={r.open} cols={iCols()} /></Card>
    </Shell>
  );
}

/* ================================================================ Stock ledger */
const CATS = ["filament", "accessory", "part", "packing"];
export function Movements() {
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Movement | null>(null);
  const [form, setForm] = useState(false);
  const blank = (): Movement => ({ id: uid(), date: today(), cat: "filament", item: stockNames("filament")[0] ?? "", dir: "in", qty: 0, unit: "g", unitCost: 0, vendor: "", colour: "", brand: "", notes: "", by: who() });
  const [d, setD] = useState<Movement>(blank);
  const set = (p: Partial<Movement>) => setD({ ...d, ...p });
  const rows = movesSig.value.filter((m) => cat === "all" || m.cat === cat);
  const names = stockNames(d.cat);
  const detail = form ? (
    <div>
      <div class="flex items-center justify-between gap-2 mb-3"><h2 class="text-base md:text-xl font-extrabold tracking-tight">Log movement</h2><Button variant="ghost" icon="close" onClick={() => setForm(false)}>Close</Button></div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Category"><select class={inputCls} value={d.cat} onChange={(e) => { const c = (e.target as HTMLSelectElement).value; set({ cat: c, item: stockNames(c)[0] ?? "", unit: c === "filament" ? "g" : "pcs" }); }}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Item"><select class={inputCls} value={d.item} onChange={(e) => set({ item: (e.target as HTMLSelectElement).value })}>{names.map((n) => <option key={n}>{n}</option>)}</select></Field>
        <Field label="Direction"><select class={inputCls} value={d.dir} onChange={(e) => set({ dir: (e.target as HTMLSelectElement).value as "in" })}><option value="in">In — purchase / return</option><option value="out">Out — manual use / write-off</option></select></Field>
        <Field label={`Quantity (${d.unit})`}><input class={inputCls} type="number" value={d.qty || ""} onInput={(e) => set({ qty: num(e) })} /></Field>
        <Field label="Unit cost ₹ (at this time)"><input class={inputCls} type="number" step="0.01" value={d.unitCost || ""} onInput={(e) => set({ unitCost: num(e) })} /></Field>
        <Field label="Vendor"><input class={inputCls} value={d.vendor} onInput={(e) => set({ vendor: val(e) })} /></Field>
        <Field label="Date"><input class={inputCls} type="date" value={d.date} onInput={(e) => set({ date: val(e) })} /></Field>
        {d.cat === "filament" && <Field label="Colour · brand"><input class={inputCls} value={`${d.colour ?? ""}${d.brand ? " · " + d.brand : ""}`} onInput={(e) => { const [c, b] = val(e).split("·").map((x) => x.trim()); set({ colour: c, brand: b ?? "" }); }} /></Field>}
        <div class="sm:col-span-2"><Field label="Notes"><input class={inputCls} value={d.notes} onInput={(e) => set({ notes: val(e) })} /></Field></div>
      </div>
      <div class="mt-4"><Actions><Button icon="check" disabled={!d.qty || !d.item} onClick={() => { applyMove(d); log(`Stock ${d.dir} ${d.qty} ${d.unit}`, d.item, "stock"); setOpen(d); setForm(false); setD(blank()); }}>Save movement</Button><Button variant="outline" onClick={() => setForm(false)}>Cancel</Button></Actions></div>
      <p class="text-xs text-c3 mt-3">Prints and packing draw stock automatically — log here only purchases and manual adjustments.</p>
    </div>
  ) : open && <Inspect title={`${open.dir === "in" ? "In" : "Out"} · ${open.item}`} row={{ date: open.date, category: open.cat, direction: open.dir, quantity: `${open.qty} ${open.unit}`, unitCost: `₹${open.unitCost}`, value: inr(open.qty * open.unitCost), vendor: open.vendor, colour: open.colour ?? "", brand: open.brand ?? "", notes: open.notes, loggedBy: open.by }} onClose={() => setOpen(null)} />;
  return (
    <Shell sub="Purchases and manual adjustments — every movement in and out" detail={detail}
      toolbar={<div class="flex flex-wrap gap-2"><Pick title="Category" value={cat} on={setCat} items={["all", ...CATS]} label={(c) => c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)} /></div>}
      actions={<Button icon="plus" onClick={() => { setOpen(null); setForm(true); }}>Log movement</Button>}>
      <div class="grid grid-cols-3 gap-2">
        <Stat value={rows.filter((m) => m.dir === "in").length} label="in" />
        <Stat value={rows.filter((m) => m.dir === "out").length} label="out" />
        <Stat value={inr(rows.filter((m) => m.dir === "in").reduce((s, m) => s + m.qty * m.unitCost, 0))} label="bought" />
      </div>
      <Card>
        <Table rows={rows} rowKey={(m) => m.id} onRow={(m) => { setForm(false); setOpen(m); }} cols={[
          { key: "i", label: "Item", render: (m) => m.item },
          { key: "d", label: "Date", render: (m) => shortDate(m.date) },
          { key: "k", label: "Category", render: (m) => <span class="capitalize">{m.cat}</span>, hideTablet: true },
          { key: "x", label: "Direction", render: (m) => <Status tone={m.dir === "in" ? "done" : "active"}>{m.dir}</Status> },
          { key: "q", label: "Qty", align: "right", render: (m) => `${m.qty.toLocaleString("en-IN")} ${m.unit}` },
          { key: "c", label: "Value", align: "right", render: (m) => (m.unitCost ? inr(m.qty * m.unitCost) : "—") },
          { key: "v", label: "Vendor / note", render: (m) => m.vendor || m.notes || "—" },
          { key: "b", label: "By", render: (m) => m.by, hideTablet: true },
        ]} />
      </Card>
    </Shell>
  );
}

/* ================================================================ Consumption */
export function ConsumptionLog() {
  const [k, setK] = useState<"all" | ConKind>("all");
  const [open, setOpen] = useState<Consumption | null>(null);
  const rows = consSig.value.filter((c) => k === "all" || c.kind === k);
  const kinds = ["all", ...new Set(consSig.value.map((c) => c.kind))] as ("all" | ConKind)[];
  const by = (kk: string) => consSig.value.filter((c) => c.kind === kk).reduce((s, c) => s + c.cost, 0);
  return (
    <Shell sub="Everything used — filament, machine hours, power, labour, packing, parts, freight, scrap"
      toolbar={<Pick title="Kind" value={k} on={setK} items={kinds} label={(x) => (x === "all" ? "All" : x[0].toUpperCase() + x.slice(1))} />}
      detail={open && <Inspect title={`${open.item}`} row={{ kind: open.kind, quantity: `${open.qty} ${open.unit}`, cost: inr(open.cost), order: open.orderNo ?? "Store use", batch: open.batch ?? "", printer: open.printer ?? "", when: open.at, who: open.who }} onClose={() => setOpen(null)} />}>
      <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Stat value={inr(consSig.value.reduce((s, c) => s + c.cost, 0))} label="Total" />
        {["filament", "machine", "packing", "labour", "scrap"].map((x) => <Stat key={x} value={inr(by(x))} label={x} />)}
      </div>
      <Card><div class="text-sm font-bold mb-2">Log consumption <span class="font-normal text-c3">— no order = store use</span></div><ConsumeForm /></Card>
      <Card>
        <Table rows={rows} rowKey={(c) => c.id} onRow={setOpen} cols={[
          { key: "i", label: "Item", render: (c) => c.item },
          { key: "k", label: "Kind", render: (c) => <span class="capitalize">{c.kind}</span> },
          { key: "q", label: "Qty", align: "right", render: (c) => `${c.qty} ${c.unit}` },
          { key: "c", label: "Cost", align: "right", render: (c) => inr(c.cost) },
          { key: "o", label: "Order · batch", render: (c) => (c.orderNo ? `${c.orderNo}${c.batch ? " · " + c.batch : ""}` : "Store") },
          { key: "p", label: "Printer", render: (c) => c.printer ?? "—", hideTablet: true },
          { key: "a", label: "When · who", render: (c) => `${c.at} · ${c.who}`, hideTablet: true },
        ]} />
      </Card>
    </Shell>
  );
}
