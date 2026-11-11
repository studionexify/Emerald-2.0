import { sortAbc } from "../mock/types";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { Signal } from "@preact/signals";
import { WORKSHOP_TABS } from "../nav";
import { navigate } from "../router";
import { Sheet, Pick, Button, Card, Icon, isPhone, Field, inputCls, Page, Progress, Section, Stat, Status, Table, type Col } from "../ui";
import { Menu, MetaRow, Stepper } from "../ui/disclose";
import { Actions, Facts, Inspect, PaneSection, useRecord, type FDef } from "../ui/record";
import { itemLabel, spoolGross, isSpoolItem, nextSpoolNo, bodyTare, filMasterSig, masterMat, masterColour, spHex, renameMaster, masterUse, type FilMaster,
  applyMove, committed, consSig, inr, itemsSig, jobsSig, log, me, movesSig, packSig, printersSig, REORDER_G, shortDate, spoolPct, spoolsSig, spoolValue, stockNames, today, uid, machineStats,
  type ConKind, type Consumption, type Movement, type PackItem, type Printer, type Spool,
} from "../data";
import { ConsumeForm } from "./work/shared";

const who = () => me.value?.name ?? "You";
const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
const val = (e: Event) => (e.target as HTMLInputElement).value;

function Shell({ sub, actions, toolbar, strip, detail, children }: { sub: string; actions?: preact.ComponentChildren; toolbar?: preact.ComponentChildren; strip?: preact.ComponentChildren; detail?: preact.ComponentChildren | null; children: preact.ComponentChildren }) {
  return <Page title="Store" sub={sub} actions={actions} toolbar={toolbar} strip={strip} detail={detail ?? null} tabs={WORKSHOP_TABS}>{children}</Page>;
}
const ActiveChips = ({ v, on }: { v: string; on: (x: string) => void }) => (
  <div class="flex flex-wrap items-center gap-2"><Pick value={v} on={on} items={["active", "retired", "all"]} label={(x) => x[0].toUpperCase() + x.slice(1)} /></div>
);
const byActive = <T extends { active?: boolean }>(rows: T[], f: string) => rows.filter((r) => (f === "all" ? true : f === "retired" ? r.active === false : r.active !== false));
const stockTone = (q: number, at: number) => (q <= 0 ? <Status tone="blocked">Out</Status> : q <= at ? <Status tone="waiting">Reorder</Status> : <Status tone="done">OK</Status>);

/** Quick search: inline in the desktop toolbar; full-width at the top of the list on phone (outside the filter sheet). */
function SearchBar({ q, setQ, ph }: { q: string; setQ: (v: string) => void; ph: string }) {
  return (
    <label class="flex items-center gap-2 h-11 md:h-7 2xl:h-8 px-3 rounded-full bg-c0 md:bg-c0 border border-line md:border-0 text-c2 w-full md:w-44">
      <Icon name="search" size={14} />
      <input type="search" enterKeyHint="search" autoComplete="off" class="flex-1 min-w-0 bg-transparent outline-none text-c4 text-[16px] md:text-xs placeholder:text-c2" placeholder={ph} value={q} onInput={(e) => setQ(val(e))} aria-label={ph} />
    </label>
  );
}
const matchQ = (q: string, ...xs: (string | undefined)[]) => !q || xs.join(" ").toLowerCase().includes(q.toLowerCase());

/* ================================================================ Printers */
const STATUS = ["idle", "printing", "down"];
const pFields: FDef<Printer>[] = [
  { k: "name", group: "Essentials", label: "Name (what the floor calls it)" }, { k: "model", group: "Essentials", label: "Model" },
  { k: "status", group: "Essentials", label: "Status", type: "select", options: STATUS }, { k: "nozzle", group: "Essentials", label: "Nozzle" },
  { k: "volume", group: "Service & specs", label: "Build volume", suffix: "mm" }, { k: "serial", group: "Service & specs", label: "Serial no." },
  { k: "location", group: "Essentials", label: "Location" }, { k: "hours", group: "Service & specs", label: "Lifetime hours", type: "number", suffix: "h" },
  { k: "bought", group: "Purchase", label: "Bought on", type: "date" }, { k: "cost", group: "Purchase", label: "Purchase cost", type: "number", suffix: "₹" },
  { k: "lastService", group: "Service & specs", label: "Last service", type: "date" }, { k: "serviceEvery", group: "Service & specs", label: "Service every", type: "number", suffix: "h" },
  { k: "notes", group: "Notes", label: "Notes", type: "textarea" },
];
const mlog = (p: Printer) => machineStats(p.name);
const pTone = (s: string) => (s === "printing" ? "active" : s === "down" ? "blocked" : "idle") as "active";

const serviceDue = (p: Printer) => !!p.serviceEvery && p.serviceEvery - (p.hours % p.serviceEvery) <= 20;
const loadedOn = (p: Printer) => { const s = spoolsSig.value.find((x) => x.printer === p.name && x.status === "loaded"); return s ? `${s.material} ${s.colour}` : ""; };
function PrinterAct({ p, open }: { p: Printer; open: (p: Printer) => void }) {
  const set = (st: Printer["status"], why: string) => { printersSig.value = printersSig.value.map((x) => (x.id === p.id ? { ...x, status: st } : x)); log(why, p.name); };
  const primary = p.status === "down" ? <Button variant="outline" onClick={() => set("idle", "Back in service")}>Back in service</Button>
    : p.status === "idle" ? <a href="/work/production" class="inline-flex items-center justify-center h-8 px-3.5 rounded-lg border border-line text-[13px] font-semibold hover:bg-c1">Assign job</a>
    : <Button variant="outline" onClick={() => open(p)}>View job</Button>;
  return <>{primary}<Menu label={`Actions for ${p.name}`} items={[
    { label: "Open full inspector", on: () => open(p) },
    { label: "Log service", on: () => { printersSig.value = printersSig.value.map((x) => (x.id === p.id ? { ...x, lastService: today() } : x)); log("Serviced", p.name); } },
    { label: "Mark down", on: () => set("down", "Status → down"), hidden: p.status === "down" },
  ]} /></>;
}

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
        <PaneSection title="Loaded spools">{loaded.length ? loaded.map((s) => <div key={s.id} class="flex items-center justify-between text-sm"><span class="flex items-center gap-2"><Swatch hex={s.hex} />{s.material} {s.colour} · {s.spoolNo}</span><span class="num font-semibold">{spoolGross(s)} g gross</span></div>) : <p class="text-sm text-c3">Nothing loaded.</p>}</PaneSection>
        <PaneSection title="Service">{p.serviceEvery ? <><div class="flex justify-between text-sm"><span>Next service in</span><b class="num">{Math.max(0, p.serviceEvery - (p.hours % p.serviceEvery))} h</b></div><Progress value={((p.hours % p.serviceEvery) / p.serviceEvery) * 100} /></> : <p class="text-sm text-c3">No interval set.</p>}</PaneSection>
        <PaneSection title={`Jobs · ${jobs.length}`}>{jobs.length ? jobs.map((j) => <div key={j.id} class="flex justify-between gap-2 text-sm"><span class="min-w-0"><b>{j.orderNo}</b> · {j.item}</span><Status tone={j.status === "done" ? "done" : j.status === "failed" ? "blocked" : j.status === "printing" ? "active" : "waiting"}>{j.status}</Status></div>) : <p class="text-sm text-c3">No jobs.</p>}</PaneSection>
        <PaneSection title="Spares for this machine">{parts.length ? parts.map((i) => <div key={i.id} class="flex justify-between text-sm"><span>{i.name}</span><span class="num">{i.qty} {i.unit}</span></div>) : <p class="text-sm text-c3">None tagged.</p>}</PaneSection>
        <PaneSection title="Consumption logged"><p class="text-sm"><b class="num">{used.filter((c) => c.kind === "machine").reduce((s, c) => s + c.qty, 0)} h</b> machine · <b class="num">{inr(used.reduce((s, c) => s + c.cost, 0))}</b> total</p></PaneSection>
      </>;
    },
  });
  const [ps, setPs] = useState<"all" | Printer["status"]>("all");
  const live = printersSig.value.filter((p) => p.active !== false);
  const queued = jobsSig.value.filter((j) => j.status === "queued").length;
  const rows = byActive(printersSig.value, f).filter((p) => ps === "all" || p.status === ps).sort((a, b) => abc(a.name, b.name));
  const chip = (k: typeof ps, n: number, label: string, warn?: boolean) => (
    <button key={k} onClick={() => setPs(ps === k ? "all" : k)} aria-pressed={ps === k}
      class={`shrink-0 h-11 md:h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[14px] md:text-[13px] font-semibold cursor-pointer ${ps === k ? "bg-c4 text-c0" : "bg-c0 text-c4"}`}>
      {warn && n > 0 && <span class="w-2 h-2 rounded-full bg-warn" />}<span class="num">{n}</span> {label}
    </button>
  );
  return (
    <Shell sub="Machines · status, utilisation, service, spools loaded" actions={<Button icon="plus" onClick={() => r.add()}>Add printer</Button>} toolbar={<ActiveChips v={f} on={setF} />} detail={r.detail}>
      <div class="flex gap-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="Filter by status">
        {chip("printing", live.filter((p) => p.status === "printing").length, "Printing")}
        {chip("idle", live.filter((p) => p.status === "idle").length, "Idle")}
        {chip("down", live.filter((p) => p.status === "down").length, "Down", true)}
        <a href="/work/production" class="shrink-0 h-11 md:h-8 px-3.5 rounded-full inline-flex items-center gap-1.5 text-[14px] md:text-[13px] font-semibold bg-c0 text-c4"><span class="num">{queued}</span> Queued <Icon name="right" size={12} /></a>
      </div>
      <Card class="!py-1">
        <Table rows={rows} rowKey={(p) => p.id} onRow={r.open} act={(p) => <PrinterAct p={p} open={r.open} />} cols={[
          { key: "n", label: "Printer", render: (p) => <span class="flex flex-col min-w-0"><span class="font-semibold">{p.name}{p.active === false && <span class="ml-2 text-xs text-c3 font-normal">retired</span>}{serviceDue(p) && <span class="ml-2 inline-flex items-center gap-1 text-[11px] font-bold"><span class="w-1.5 h-1.5 rounded-full bg-warn" />Service due</span>}</span><MetaRow items={[p.model, loadedOn(p)]} /></span> },
          { key: "s", label: "Status", card: "status", render: (p) => <Status tone={pTone(p.status)}>{p.status}</Status> },
          { key: "j", label: "Now", card: "foot", render: (p) => { const j = jobsSig.value.find((x) => x.printer === p.name && x.status === "printing"); return j ? `${j.orderNo} · ${j.item}` : p.job ? `Printing ${p.job}` : p.status === "down" ? "Needs attention" : p.status === "printing" ? "Printing" : "Free"; } },
          { key: "u", label: "Utilisation", level: 2, render: (p) => `${mlog(p).util}%` },
          { key: "f", label: "Fail rate", level: 2, render: (p) => `${mlog(p).fail}%` },
          { key: "up", label: "Uptime", level: 2, render: (p) => `${mlog(p).uptime}%` },
          { key: "h", label: "Lifetime", level: 2, render: (p) => `${p.hours.toLocaleString("en-IN")} h` },
          { key: "sv", label: "Next service", level: 2, render: (p) => p.serviceEvery ? `in ${Math.max(0, p.serviceEvery - (p.hours % p.serviceEvery))} h` : "—" },
          { key: "nz", label: "Nozzle", level: 2, render: (p) => p.nozzle ?? "—" },
        ]} />
      </Card>
    </Shell>
  );
}

/* ================================================================ Filament */
/** Similar spools (same material, colour, brand) share one card. */
const abc = (a = "", b = "") => a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
const groupSpools = (sp: Spool[]) => { const m = new Map<string, Spool[]>(); for (const s of sp) { const k = `${s.material}|${s.colour}|${s.brand}`.toLowerCase(); m.set(k, [...(m.get(k) ?? []), s]); } return [...m.values()].map((l) => l.sort((a, b) => (a.slot ?? 1e9) - (b.slot ?? 1e9) || a.spoolNo.localeCompare(b.spoolNo, undefined, { numeric: true }))).sort((a, b) => abc(a[0].colour, b[0].colour) || abc(a[0].brand, b[0].brand)); };
const SPOOL_MATS = (): Record<string, number> => ({ ...Object.fromEntries(filMasterSig.value.bodies.map((b) => [b.name, b.tare])), "Refill (no spool)": 0 });
const putSpool = (id: string, p: Partial<Spool>) => { spoolsSig.value = spoolsSig.value.map((x) => x.id === id ? { ...x, ...p } : x); };
const fIn = "w-full h-7 rounded-lg border border-line bg-c1 px-2 text-[12px] !min-h-0";
function SpoolEdit({ s, done }: { s: Spool; done: () => void }) {
  const [gross, setGross] = useState(String(spoolGross(s)));
  const [mat, setMat] = useState(s.spoolMat ?? (s.tare === 150 ? "Cardboard" : s.tare === 0 ? "Refill (no spool)" : "Plastic"));
  const [hex, setHx] = useState(s.hex ?? spHex(s)); const [price, setPrice] = useState(String(s.costKg ?? ""));
  const tare = SPOOL_MATS()[mat] ?? filMasterSig.value.tare; const net = Math.max(0, (Number(gross) || 0) - tare);
  const save = () => {
    const diff = net - s.grams;
    if (diff) movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: `${s.material} ${s.colour} · ${s.spoolNo}`, dir: diff > 0 ? "in" : "out", qty: Math.abs(diff), unit: "g", unitCost: (Number(price) || 0) / 1000, vendor: "", colour: s.colour, brand: s.brand, notes: "Weigh-in", by: who() }, ...movesSig.value];
    putSpool(s.id, { gross: Number(gross) || 0, tare, spoolMat: mat, grams: net, weighed: today(), hex: /^#?[0-9a-f]{6}$/i.test(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : s.hex, costKg: Number(price) || s.costKg, status: net <= 0 ? "empty" : s.status });
    log(`Updated spool ${s.spoolNo}: ${net} g net`, s.spoolNo, "stock"); done();
  };
  const empty = () => { if (s.grams) applyMove({ id: uid(), date: today(), cat: "filament", item: `${s.material} ${s.colour} · ${s.spoolNo}`, dir: "out", qty: s.grams, unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: "", notes: "Spool emptied", by: who() }); putSpool(s.id, { grams: 0, gross: s.tare ?? 0, status: "empty" }); log(`Emptied spool ${s.spoolNo}`, s.spoolNo, "stock"); done(); };
  const L = (t: string) => <span class="block t-meta uppercase tracking-[0.06em] !text-[10px] mb-0.5">{t}</span>;
  return <div class="grid grid-cols-2 gap-x-2 gap-y-1.5 pt-2 pb-1 border-t border-line">
    <label>{L("Weigh spool (gross)")}<input class={fIn} inputMode="numeric" value={gross} onInput={(e) => setGross((e.target as HTMLInputElement).value)} /></label>
    <label>{L("Spool material")}<select class={fIn} value={mat} onChange={(e) => setMat((e.target as HTMLSelectElement).value)}>{sortAbc(Object.keys(SPOOL_MATS())).map((m) => <option key={m}>{m}</option>)}</select></label>
    <label>{L("Hex colour")}<input class={`${fIn} font-mono uppercase`} value={hex} onInput={(e) => setHx((e.target as HTMLInputElement).value)} /></label>
    <label>{L("Price (₹ / kg)")}<input class={fIn} inputMode="numeric" value={price} onInput={(e) => setPrice((e.target as HTMLInputElement).value)} /></label>
    <p class="col-span-2 t-meta">Net = {Number(gross) || 0} − {tare} g tare = <b class="text-c4">{net} g</b></p>
    <div class="col-span-2 grid grid-cols-2 gap-2 mt-0.5">
      <button class="h-8 !min-h-0 rounded-lg bg-c4 text-c0 text-[12px] font-semibold" onClick={save}>Save</button>
      <button class="h-8 !min-h-0 rounded-lg border border-line text-red text-[12px] font-semibold" onClick={empty}>Empty spool</button>
    </div>
  </div>;
}
const MAT_C: [RegExp, string][] = [
  [/silk/i, "#e879f9"], [/matte/i, "#34d399"], [/marble|stone/i, "#d6d3d1"], [/wood/i, "#c08457"], [/glow/i, "#bef264"], [/sparkle|glitter|galaxy/i, "#f0abfc"],
  [/rainbow|multi|dual|tri/i, "#fda4af"], [/high.?speed|hs\b|hyper/i, "#22d3ee"], [/pla\s*\+|pla.?plus|pla.?pro/i, "#86efac"],
  [/cf|carbon|gf|glass/i, "#a1a1aa"], [/petg/i, "#60a5fa"], [/pla/i, "#8FC29E"], [/abs/i, "#fb923c"], [/asa/i, "#f87171"], [/tpu|tpe|flex/i, "#c084fc"], [/pa|nylon/i, "#facc15"], [/pc|polycarb/i, "#2dd4bf"]];
const hashC = (m: string) => { let h = 0; for (const c of m) h = (h * 31 + c.charCodeAt(0)) % 360; return `hsl(${h} 70% 65%)`; };
const matC = (m: string) => `color-mix(in srgb, ${masterMat(m)?.hex || (MAT_C.find(([r]) => r.test(m))?.[1] ?? hashC(m))} 68%, #000)`;
/** Spool number shown as a plain number: "SP-007" → "7". */
const spN = (no: string) => { const d = (no.match(/\d+/g) ?? []).pop(); return d ? String(Number(d)) : no; };
const lightHex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec(h.replace(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i, "#$1$1$2$2$3$3")); if (!m) return false; const n = parseInt(m[1], 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 160; };
const matId = (m: string) => `mat-${m.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
/** Waterfall: each card goes to the currently shortest column (height ≈ header + spool rows), so reading order stays left→right. */
function Masonry({ cols, items }: { cols: number; items: Spool[][] }) {
  const c: Spool[][][] = Array.from({ length: cols }, () => []); const h = Array(cols).fill(0);
  for (const g of items) { const i = h.indexOf(Math.min(...h)); c[i].push(g); h[i] += 1.4 + g.length; }
  return <div class="flex gap-2 mt-2 items-start">{c.map((col, i) => <div key={i} class="flex-1 min-w-0 flex flex-col gap-2">{col.map((gs) => <SpoolCard key={gs[0].id} list={gs} open={() => {}} />)}</div>)}</div>;
}
/** Long material sections render 12 cards first; the rest on demand. */
function MatCards({ cols, groups }: { cols: number; groups: Spool[][] }) {
  return <Masonry cols={cols} items={groups} />;
}
const isOwner = () => me.value?.role === "owner";
/** Owner-only: rename the colour and set its hex for every spool on this card. */
function CardEdit({ list, hex, done }: { list: Spool[]; hex: string; done: () => void }) {
  const [name, setName] = useState(list[0].colour); const [hx, setHx] = useState(/^#[0-9a-f]{6}$/i.test(hex) ? hex : "#888888");
  const ok = name.trim() && /^#[0-9a-f]{6}$/i.test(hx);
  const save = () => { if (!ok || !isOwner()) return; const n = name.trim(), ids = new Set(list.map((x) => x.id)), M = filMasterSig.value;
    const has = M.colours.some((c) => c.name.toLowerCase() === n.toLowerCase());
    filMasterSig.value = { ...M, colours: has ? M.colours.map((c) => c.name.toLowerCase() === n.toLowerCase() ? { ...c, hex: hx } : c) : [...M.colours, { ...(M.colours[0] ?? {}), name: n, hex: hx }].sort((a, b) => abc(a.name, b.name)) };
    spoolsSig.value = spoolsSig.value.map((x) => ids.has(x.id) ? { ...x, colour: n, hex: hx } : x);
    log(`Edited colour ${list[0].colour} → ${n} ${hx}`, `${list[0].material} · ${list.length} spools`, "stock"); done(); };
  return <div class="grid grid-cols-[auto_minmax(0,1fr)_84px] items-center gap-2 mt-2 pop-in">
    <input type="color" class="w-7 h-7 !min-h-0 p-0 border-0 bg-transparent cursor-pointer" value={hx} onInput={(e) => setHx((e.target as HTMLInputElement).value)} aria-label="Pick colour" />
    <input class="h-7 !min-h-0 rounded-md border border-line bg-c1 px-2 text-[12px]" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} aria-label="Colour name" />
    <input class="h-7 !min-h-0 rounded-md border border-line bg-c1 px-1.5 text-[11px] font-mono uppercase" value={hx} onInput={(e) => { const v = (e.target as HTMLInputElement).value.trim(); setHx(v.startsWith("#") ? v : `#${v}`); }} aria-label="Hex colour" />
    <span class="col-span-3 flex items-center gap-2"><span class="t-meta flex-1">Applies to all {list.length > 1 ? `${list.length} spools` : "this spool"}</span>
      <button class="h-7 !min-h-0 px-2.5 rounded-lg border border-line text-[11px] font-semibold" onClick={done}>Cancel</button>
      <button class="h-7 !min-h-0 px-2.5 rounded-lg bg-c4 text-c0 text-[11px] font-semibold disabled:opacity-40" disabled={!ok} onClick={save}>Save</button></span>
  </div>;
}
function SpoolCard({ list }: { list: Spool[]; open: (s: Spool) => void }) {
  const h = list[0]; const hex = spHex(h); const [hexOpen, setHexOpen] = useState(false); const [ed, setEd] = useState<string | null>(null);
  const mc = matC(h.material);
  const [showSealed, setShowSealed] = useState(false);
  const sealed = list.filter((x) => x.status === "sealed" && x.grams > 0);
  const rows = list; void sealed; void showSealed; void setShowSealed;
  return <div class="rounded-[var(--radius-card)] bg-c0 border border-line px-3 py-2.5 flex flex-col" style={{ borderLeft: `3px solid ${mc}` }}>
    <div class="flex items-center gap-2.5 -mx-3 -mt-2.5 px-3 py-2.5 rounded-t-[var(--radius-card)]" style={{ background: hex, color: lightHex(hex) ? "#1a1a1a" : "#fff" }}>
      <span class="w-9 h-5 rounded-md border border-current/30 shrink-0" style={{ background: hex }} />
      <div class="min-w-0 flex-1"><div class="font-semibold text-[13px] leading-tight truncate">{h.colour || h.material}</div><div class="text-[11px] opacity-75 truncate">{h.brand || "—"}</div></div>
      {isOwner() ? <button class="text-[10px] font-bold tracking-[0.06em] px-1.5 py-0.5 !min-h-0 rounded-md bg-c0 cursor-pointer" style={{ color: mc, outline: hexOpen ? "2px solid var(--acc)" : undefined }} onClick={() => setHexOpen(!hexOpen)} title="Edit colour for this card">{h.material}</button>
        : <span class="text-[10px] font-bold tracking-[0.06em] px-1.5 py-0.5 rounded-md bg-c0" style={{ color: mc }}>{h.material}</span>}
    </div>
    {hexOpen && <CardEdit list={list} hex={hex} done={() => setHexOpen(false)} />}
    <div class="mt-2 flex flex-col">
      {false && <button onClick={() => setShowSealed(true)} class="border-t border-line flex items-center gap-3 py-2 text-left cursor-pointer !min-h-0">
        <span class="text-[20px] font-extrabold num leading-none min-w-7 shrink-0">{sealed.length}×</span>
        <span class="flex-1 min-w-0"><span class="block h-1.5 rounded-full" style={{ background: hex, boxShadow: lightHex(hex) ? "inset 0 0 0 1px rgba(0,0,0,.25)" : undefined }} /><span class="flex justify-between mt-1 text-[11px]"><span class="text-c2">Sealed · #{sealed.map((x) => x.slot ?? spN(x.spoolNo)).slice(0, 4).join(", ")}{sealed.length > 4 ? "…" : ""}</span><b class="num">{(sealed.reduce((a, x) => a + x.grams, 0) / 1000).toFixed(1)} kg</b></span></span>
        <span class="h-7 px-2.5 rounded-lg border border-line text-[11px] font-semibold grid place-items-center">Show</span>
      </button>}
      {rows.map((s) => <div key={s.id} class="border-t border-line">
        <div class="flex items-center gap-3 py-2">
          <span class="text-[20px] font-extrabold num leading-none min-w-7 shrink-0">{s.slot ?? spN(s.spoolNo)}</span>
          <div class="flex-1 min-w-0">
            <div class="h-1.5 rounded-full bg-c1 overflow-hidden"><div class="h-full rounded-full" style={{ background: hex, boxShadow: lightHex(hex) ? "inset 0 0 0 1px rgba(0,0,0,.25)" : undefined, width: `${Math.max(spoolPct(s), s.grams > 0 ? 2 : 0)}%` }} /></div>
            <div class="flex justify-between mt-1 text-[11px]"><span class="text-c2">Net <b class="num text-c4">{s.grams.toLocaleString("en-IN")} g</b></span><span class="text-c2">Gross <b class="num text-c4">{spoolGross(s).toLocaleString("en-IN")} g</b></span></div>
          </div>
          <button class={`h-7 !min-h-0 px-2.5 rounded-lg border text-[11px] font-semibold ${ed === s.id ? "bg-c4 text-c0 border-c4" : "border-line"}`} onClick={() => setEd(ed === s.id ? null : s.id)}>{ed === s.id ? "Done" : "Edit"}</button>
        </div>
        {ed === s.id && <SpoolEdit s={s} done={() => setEd(null)} />}
      </div>)}
    </div>
  </div>;
}
const Swatch = ({ hex }: { hex?: string }) => <span class="inline-block w-3.5 h-3.5 rounded-full border border-c3 shrink-0" style={{ background: hex || "transparent" }} aria-hidden="true" />;
const MATS = () => filMasterSig.value.materials.map((m) => m.name).sort(abc);
const lowG = () => filMasterSig.value.lowG || 250;
const SP_STATUS = ["sealed", "open", "loaded", "empty"];
const lc = (x?: string) => (x ?? "").trim().toLowerCase();
/** Values already used on spools, for closed-loop dropdowns (most used first). */
const seen = (k: "vendor" | "location" | "lot" | "finish" | "brand" | "colour", only?: (s: Spool) => boolean) => {
  const m = new Map<string, number>(); for (const s of spoolsSig.value) { const v = String(s[k] ?? "").trim(); if (v && (!only || only(s))) m.set(v, (m.get(v) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1] || abc(a[0], b[0])).map(([v]) => v);
};
/** Colours for a material: ones already stocked in it first, then every other colour from Filament settings. */
const coloursFor = (r: Spool) => { const used = seen("colour", (s) => lc(s.material) === lc(r.material)); const all = filMasterSig.value.colours.map((c) => c.name).sort(abc); return [...used, ...all.filter((c) => !used.some((u) => lc(u) === lc(c)))]; };
const brandsFor = (r: Spool) => { const used = seen("brand", (s) => lc(s.material) === lc(r.material) && lc(s.colour) === lc(r.colour)); const all = [...new Set([...filMasterSig.value.brands, ...seen("brand")])].sort(abc); return ["", ...used, ...all.filter((b) => !used.includes(b))]; };
/** Next free spool no. within the same material + colour + brand. */
const nextSlot = (r: Spool) => { const g = spoolsSig.value.filter((s) => s.id !== r.id && lc(s.material) === lc(r.material) && lc(s.colour) === lc(r.colour) && lc(s.brand) === lc(r.brand)); const used = new Set(g.map((s) => s.slot ?? Number(spN(s.spoolNo)))); let n = 1; while (used.has(n)) n++; return n; };
const reslot = (_v: unknown, r: Spool): Partial<Spool> => ({ slot: nextSlot(r) });
const sFields: FDef<Spool>[] = [
  { k: "material", group: "Essentials", label: "Material", type: "select", options: MATS, then: (v, r) => ({ ...(coloursFor(r).some((c) => lc(c) === lc(r.colour)) ? {} : { colour: "" }), slot: nextSlot(r), ...(masterMat(String(v))?.costKg ? { costKg: masterMat(String(v))!.costKg } : {}) }) },
  { k: "colour", group: "Essentials", label: "Colour", type: "select", options: coloursFor, then: (v, r) => ({ slot: nextSlot(r), ...(masterColour(String(v))?.hex ? { hex: masterColour(String(v))!.hex } : {}) }) },
  { k: "brand", group: "Essentials", label: "Brand", type: "select", options: brandsFor, then: reslot },
  { k: "hex", group: "Essentials", label: "Colour swatch", type: "color" },
  { k: "diameter", group: "Spec", label: "Diameter (mm)", type: "select", options: () => filMasterSig.value.diameters.map(String) }, { k: "spoolMat", group: "Weight", label: "Spool type", type: "select", options: () => filMasterSig.value.bodies.map((b) => b.name).sort(abc) },
  { k: "slot", group: "Essentials", label: "Spool no. (suggested)", type: "number" }, { k: "lot", group: "Purchase", label: "Batch / lot", type: "combo", options: () => seen("lot") },
  { k: "size", group: "Weight", label: "Spool size (g net)", type: "select", options: () => filMasterSig.value.sizes.map(String) }, { k: "tare", group: "Weight", label: "Empty spool (tare)", type: "number", suffix: "g" },
  { k: "gross", group: "Weight", label: "Gross (last weigh-in)", type: "number", suffix: "g" }, { k: "grams", group: "Essentials", label: "Net remaining", type: "number", suffix: "g" },
  { k: "costKg", group: "Purchase", label: "Cost per kg", type: "number", suffix: "₹" }, { k: "vendor", group: "Purchase", label: "Vendor", type: "combo", options: () => seen("vendor") },
  { k: "bought", group: "Purchase", label: "Bought on", type: "date" }, { k: "opened", group: "Care", label: "Opened on", type: "date" },
  { k: "dried", group: "Care", label: "Last dried", type: "date" }, { k: "location", group: "Essentials", label: "Storage / dry box", type: "combo", options: () => seen("location") },
  { k: "nozzle", group: "Print settings", label: "Nozzle temp" }, { k: "bed", group: "Print settings", label: "Bed temp" },
  { k: "status", group: "Essentials", label: "Status", type: "select", options: SP_STATUS }, { k: "printer", group: "Essentials", when: (r) => r.status === "loaded", label: "Loaded on", type: "select", options: () => ["", ...printersSig.value.filter((p) => p.active !== false).map((p) => p.name)] },
  { k: "notes", group: "Notes", label: "Notes", type: "textarea" },
];
const spTone = (s: Spool) => (s.grams <= 0 ? <Status tone="blocked">Out</Status> : s.grams < lowG() ? <Status tone="waiting">Low</Status> : s.status === "loaded" ? <Status tone="active">Loaded</Status> : <Status tone="idle">{s.status ?? "open"}</Status>);


function WeighIn({ s, put }: { s: Spool; put: (p: Partial<Spool>, why?: string) => void }) {
  const [g, setG] = useState(0);
  const tare = s.tare ?? 0, net = Math.max(0, g - tare), diff = net - s.grams;
  return (
    <PaneSection title="Weigh-in">
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
  const [vw, setVw] = useState(innerWidth); useLayoutEffect(() => { const f = () => setVw(innerWidth); addEventListener("resize", f); return () => removeEventListener("resize", f); }, []);
  const cols = vw < 640 ? 1 : Math.max(2, Math.floor((vw - 120) / 300));
  const stripRef = useRef<HTMLDivElement>(null); const [cur, setCur] = useState<string | null>(null);
  useLayoutEffect(() => {
    const f = () => { const secs = document.querySelectorAll<HTMLElement>("section[data-mat]"); const sc = secs[0]?.closest(".overflow-y-auto");
      const b = sc ? sc.getBoundingClientRect().top : 0; let c: string | null = null;
      secs.forEach((el) => { if (el.getBoundingClientRect().top <= b + 1) c = el.dataset.mat!; }); setCur(c); };
    f(); addEventListener("scroll", f, true); addEventListener("resize", f); return () => { removeEventListener("scroll", f, true); removeEventListener("resize", f); };
  });
  const [mat, setMat] = useState("all");
  const [st, setSt] = useState("in stock");
  const [q, setQ] = useState(""); const [set, setSet] = useState(false);
  const r = useRecord<Spool>({
    sig: spoolsSig, kind: "Spool", title: (s) => `${s.material} ${s.colour} · ${s.spoolNo}`, fields: sFields,
    blank: () => { const M = filMasterSig.value, m0 = M.materials.find((x) => x.name === "PLA") ?? M.materials[0], t = bodyTare(M.body) ?? M.tare; return { id: uid(), material: m0?.name ?? "PLA", colour: "", hex: "#000000", brand: "", finish: "", diameter: M.diameter, grams: M.size, size: M.size, spoolMat: M.body, tare: t, gross: M.size + t, costKg: m0?.costKg || M.costKg, nozzle: m0?.nozzle, bed: m0?.bed, spoolNo: nextSpoolNo(), vendor: "", bought: today(), status: "sealed", active: true }; },
    onSave: (s, isNew) => { if (isNew && !s.slot) spoolsSig.value = spoolsSig.value.map((x) => (x.id === s.id ? { ...x, slot: nextSlot(s) } : x));
      if (isNew) { const t = bodyTare(s.spoolMat), c = masterMat(s.material)?.costKg; if (t != null || c) spoolsSig.value = spoolsSig.value.map((x) => x.id === s.id ? { ...x, ...(t != null ? { tare: t } : {}), ...(c && x.costKg === filMasterSig.value.costKg ? { costKg: c } : {}) } : x); }
      if (isNew) movesSig.value = [{ id: uid(), date: today(), cat: "filament", item: `${s.material} ${s.colour} · ${s.spoolNo}`, dir: "in", qty: s.grams, unit: "g", unitCost: (s.costKg ?? 0) / 1000, vendor: s.vendor ?? "", colour: s.colour, brand: s.brand, notes: "New spool", by: who() }, ...movesSig.value]; },
    facts: (s) => [
      ["Net remaining", <span class="text-lg font-extrabold num">{s.grams.toLocaleString("en-IN")} g</span>], ["Remaining", <span class="flex items-center gap-2"><span class="num">{spoolPct(s)}%</span><span class="flex-1"><Progress value={spoolPct(s)} /></span></span>],
      ["Gross · tare", `${spoolGross(s).toLocaleString("en-IN")} g · ${s.tare ?? 0} g`], ["Value left", inr(spoolValue(s))],
      ["Committed to queued jobs", `${committed(s).toLocaleString("en-IN")} g`], ["Expected after queue", <span class="num">{(s.grams - committed(s)).toLocaleString("en-IN")} g</span>],
      ["Cost per gram", `₹${((s.costKg ?? 0) / 1000).toFixed(2)}`], ["State", spTone(s)],
    ],
    actions: (s, put) => <>
      <select class="h-9 md:h-10 pl-4 pr-3 rounded-full border border-c4 bg-c0 text-[13px] md:text-sm font-semibold cursor-pointer" value={s.status === "loaded" ? s.printer ?? "" : ""} aria-label="Load on printer"
        onChange={(e) => { const p = (e.target as HTMLSelectElement).value; put(p ? { status: "loaded", printer: p, opened: s.opened || today() } : { status: s.grams > 0 ? "open" : "empty", printer: "" }, p ? `Loaded on ${p}` : "Unloaded"); }}>
        <option value="">Not loaded</option>{sortAbc(printersSig.value.filter((p) => p.active !== false), (p) => p.name).map((p) => <option key={p.id} value={p.name}>Load on {p.name}</option>)}
      </select>
      <Button variant="outline" onClick={() => put({ dried: today() }, "Dried")}>Mark dried</Button>
    </>,
    extra: (s, put) => {
      const use = consSig.value.filter((c) => isSpoolItem(c.item, s.spoolNo));
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
  const mats = [...new Set(spoolsSig.value.map((s) => s.material))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  const shown = all.filter((s) => (mat === "all" || s.material === mat) && (st === "all" ? true : st === "in stock" ? s.grams > 0 && s.active !== false : st === "retired" ? s.active === false : s.status === st)
    && (!q || `${s.colour} ${s.brand} ${s.spoolNo} ${s.finish}`.toLowerCase().includes(q.toLowerCase())));
  const tot = spoolsSig.value.filter((s) => s.active !== false);
  return (
    <Shell sub="Every spool — weight, colour, brand, cost, storage · tap a spool for weigh-in and history" actions={<><Button variant="outline" icon="settings" onClick={() => setSet(true)}>Filament settings</Button><Button variant="outline" icon="in" onClick={() => navigate("/workshop/movements")}>Log movement</Button><Button icon="plus" onClick={() => r.add()}>Add spool</Button></>}
      strip={(() => { const ms = (mat === "all" ? mats : [mat]).filter((m) => shown.some((s) => s.material === m)); const c = cur && ms.includes(cur) ? cur : null; return <div ref={stripRef} class="min-w-0 relative">
        {ms.length > 1 && <nav class="flex gap-1.5 overflow-x-auto pt-1">{ms.map((m) => <button key={m} class={`shrink-0 inline-flex items-center gap-1.5 h-7 !min-h-0 px-2.5 rounded-full border text-[12px] font-semibold ${m === c ? "bg-c1 border-c3" : "bg-c0 border-line"}`} onClick={() => document.getElementById(matId(m))?.scrollIntoView({ behavior: "smooth", block: "start" })}>
          <i class="w-2 h-2 rounded-full" style={{ background: matC(m) }} />{m}<span class="text-c2 font-medium">{shown.filter((s) => s.material === m).length}</span></button>)}</nav>}
        {c && (() => { const k = c; const g = tot.filter((s) => s.material === k).reduce((s, x) => s + x.grams, 0); return <div class="absolute left-0 right-0 top-full mt-2.5 z-20 bg-canvas flex items-center gap-2 pb-2 shadow-[0_6px_8px_-4px_rgba(0,0,0,.6)]" style={{ borderBottom: `2px solid ${matC(k)}` }}>
          <b class="text-[14px] tracking-[0.04em]" style={{ color: matC(k) }}>{k}</b><span class="t-meta">{shown.filter((s) => s.material === k).length} spools</span>
          <span class="ml-auto t-meta num whitespace-nowrap">{(g / 1000).toFixed(2)} kg net · {inr(tot.filter((s) => s.material === k).reduce((s, x) => s + spoolValue(x), 0))}</span></div>; })()}
      </div>; })()}
      toolbar={<div class="flex flex-wrap items-center gap-2">
        {!isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search colour, brand…" />}
        <Pick title="Material" value={mat} on={setMat} items={["all", ...mats]} label={(m) => m === "all" ? "All materials" : m} />
        <Pick title="Status" value={st} on={setSt} items={["in stock", "sealed", "open", "loaded", "empty", "retired", "all"]} label={(x) => x[0].toUpperCase() + x.slice(1)} />
      </div>} detail={r.detail}>
      {isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search colour, brand, spool no." />}
      <div class="strip grid grid-cols-2 md:grid-cols-4">
        <Stat value={`${(tot.reduce((s, x) => s + x.grams, 0) / 1000).toFixed(2)} kg`} label="on shelf" />
        <Stat value={inr(tot.reduce((s, x) => s + spoolValue(x), 0))} label="value" />
        <Stat value={tot.filter((s) => s.grams > 0).length} label="spools in stock" />
        <Stat value={tot.filter((s) => s.grams < lowG()).length} label="low or out" />
      </div>
      {(mat === "all" ? mats : [mat]).map((m) => {
                const sp = shown.filter((s) => s.material === m);
        if (!sp.length) return null;
        const g = tot.filter((s) => s.material === m).reduce((s, x) => s + x.grams, 0); const mc = matC(m);
        return (
          <section key={m} id={matId(m)} data-mat={m}>
            <div class="flex items-center gap-2 pb-2" style={{ borderBottom: `2px solid ${mc}` }}>
              <b class="text-[14px] tracking-[0.04em]" style={{ color: mc }}>{m}</b>
              <span class="t-meta">{sp.length} spools</span>
              {g <= (filMasterSig.value.reorderG || REORDER_G) && <span class="text-[11px] font-semibold px-1.5 rounded bg-warn/15">{g <= 0 ? "Out" : "Reorder"}</span>}
              <span class="ml-auto t-meta num whitespace-nowrap">{(g / 1000).toFixed(2)} kg net · {inr(tot.filter((s) => s.material === m).reduce((s, x) => s + spoolValue(x), 0))}</span>
            </div>
            <MatCards cols={cols} groups={groupSpools(sp)} />
          </section>
        );
      })}
      {!shown.length && <Card><p class="text-sm text-c3 text-center py-6">No spools match these filters.</p></Card>}
      {set && <FilSettings close={() => setSet(false)} />}
    </Shell>
  );
}

/* ---------------------------------------------------------------- Filament settings (master) */
type MKind = "materials" | "colours" | "brands" | "bodies";
const MF: Record<"materials" | "colours" | "brands", "material" | "colour" | "brand"> = { materials: "material", colours: "colour", brands: "brand" };
const SUGGEST: Record<MKind, string[]> = {
  materials: ["PLA", "PLA+", "PLA Matte", "PLA Silk", "PLA Wood", "PLA-CF", "PETG", "PETG-CF", "ABS", "ASA", "TPU 95A", "TPU 85A", "PC", "PA (Nylon)", "PA-CF", "PVA", "HIPS", "PP"],
  colours: ["Black", "White", "Grey", "Silver", "Red", "Orange", "Yellow", "Gold", "Green", "Blue", "Navy", "Purple", "Pink", "Brown", "Beige", "Clear", "Natural", "Sage", "Teal", "Bronze", "Copper"],
  brands: ["Bambu", "Prusament", "Polymaker", "eSun", "Elegoo", "Eryone", "Sunlu", "Creality", "Anycubic", "Overture", "Hatchbox", "Kingroon", "Jayo", "3D Fuel"],
  bodies: ["Plastic", "Cardboard", "Plastic (large)", "Metal", "Masterspool refill"],
};
const SUG_HEX: Record<string, string> = { black: "#1a1a1a", white: "#f4f2ec", grey: "#8a8a8a", silver: "#c0c0c0", red: "#c62828", orange: "#e8742a", yellow: "#f2c418", gold: "#c9a227", green: "#2e9a4b", blue: "#2a5cc9", navy: "#1f2f5c", purple: "#7a3fc0", pink: "#e07aa8", brown: "#6d4325", beige: "#e3c9a0", clear: "#d9e6ea", natural: "#efe6cf", sage: "#9cae8e", teal: "#138a8a", bronze: "#8c6239", copper: "#b8653a" };
function HexBox({ v, on, label }: { v?: string; on: (h: string) => void; label: string }) {
  const [t, setT] = useState(v ?? ""); const ok = /^#[0-9a-f]{6}$/i.test(v ?? "");
  return <div class="flex items-center gap-1.5 shrink-0">
    <label class="relative w-8 h-8 rounded-lg border border-line cursor-pointer shrink-0" style={{ background: ok ? v : "repeating-conic-gradient(#ccc 0 25%, #fff 0 50%) 0 0/8px 8px" }} title="Pick visually">
      <input type="color" class="absolute inset-0 opacity-0 cursor-pointer" value={ok ? v : "#888888"} onChange={(e) => { const h = (e.target as HTMLInputElement).value; setT(h); on(h); }} aria-label={`${label} picker`} />
    </label>
    <input class="h-8 !min-h-0 w-[92px] rounded-lg border border-line bg-c0 px-2 text-[13px] font-mono uppercase" value={t} placeholder="#RRGGBB" maxLength={7} aria-label={`${label} hex`}
      onInput={(e) => { let h = (e.target as HTMLInputElement).value.trim(); if (h && !h.startsWith("#")) h = `#${h}`; setT(h); if (/^#[0-9a-f]{6}$/i.test(h)) on(h.toLowerCase()); }} />
  </div>;
}
function FilSettings({ close }: { close: () => void }) {
  const [tab, setTab] = useState<MKind | "sizes" | "defaults">("materials"); const [nw, setNw] = useState(""); const [nwN, setNwN] = useState("");
  const M = filMasterSig.value; const put = (p: Partial<FilMaster>) => (filMasterSig.value = { ...filMasterSig.value, ...p });
  useLayoutEffect(() => { const m = filMasterSig.value, by = (a: { name: string }, b: { name: string }) => abc(a.name, b.name);
    put({ materials: [...m.materials].sort(by), colours: [...m.colours].sort(by), bodies: [...m.bodies].sort(by), brands: [...m.brands].sort(abc) }); }, [tab]);
  const names = (k: MKind) => (k === "materials" ? M.materials.map((x) => x.name) : k === "colours" ? M.colours.map((x) => x.name) : k === "bodies" ? M.bodies.map((x) => x.name) : M.brands);
  const setAt = <K extends "materials" | "colours" | "bodies">(k: K, i: number, p: Partial<FilMaster[K][number]>) => put({ [k]: (M[k] as object[]).map((x, j) => (j === i ? { ...x, ...p } : x)) } as Partial<FilMaster>);
  const rename = (k: MKind, i: number, to: string) => {
    const from = names(k)[i]; to = to.trim(); if (!to || to === from || names(k).some((x, j) => j !== i && x.toLowerCase() === to.toLowerCase())) return;
    if (k === "brands") put({ brands: M.brands.map((x, j) => (j === i ? to : x)) }); else setAt(k, i, { name: to });
    if (k === "bodies") spoolsSig.value = spoolsSig.value.map((s) => (s.spoolMat === from ? { ...s, spoolMat: to } : s)); else renameMaster(MF[k], from, to);
    if (k === "bodies" && M.body === from) put({ body: to });
  };
  const use = (k: MKind, n: string) => (k === "bodies" ? spoolsSig.value.filter((s) => s.active !== false && s.spoolMat === n).length : masterUse(MF[k], n));
  const del = (k: MKind, i: number) => (k === "brands" ? put({ brands: M.brands.filter((_, j) => j !== i) }) : put({ [k]: (M[k] as object[]).filter((_, j) => j !== i) } as Partial<FilMaster>));
  const add = (k: MKind) => { const v = nw.trim(); if (!v || names(k).some((x) => x.toLowerCase() === v.toLowerCase())) return;
    if (k === "materials") put({ materials: [...M.materials, { name: v, costKg: M.costKg }] });
    else if (k === "colours") put({ colours: [...M.colours, { name: v, hex: SUG_HEX[v.toLowerCase()] ?? "" }] });
    else if (k === "bodies") put({ bodies: [...M.bodies, { name: v, tare: Number(nwN) || 0 }] });
    else put({ brands: [...M.brands, v] });
    setNw(""); setNwN(""); };
  const TABS: [typeof tab, string][] = [["materials", "Types"], ["colours", "Colours"], ["brands", "Brands"], ["bodies", "Spool types"], ["sizes", "Sizes & diameter"], ["defaults", "Defaults"]];
  const sm = "h-8 !min-h-0 rounded-lg border border-line bg-c0 px-2 text-[13px] min-w-0";
  const numIn = (v: number | undefined, on: (n: number) => void, w: string, ph: string, label: string) => <input class={`${sm} ${w} num text-right`} inputMode="decimal" placeholder={ph} value={v ?? ""} onInput={(e) => on(Number((e.target as HTMLInputElement).value) || 0)} aria-label={label} />;
  const H = ({ cols }: { cols: string[] }) => <div class="flex items-center gap-2 px-0.5 pb-1 t-meta uppercase tracking-[0.06em] !text-[10px]">{cols.map((c, i) => <span key={i} class={c.startsWith("~") ? "flex-1" : ""} style={c.startsWith("~") ? undefined : { width: c.split("|")[1] }}>{c.replace(/^~/, "").split("|")[0]}</span>)}</div>;
  const chips = (k: "sizes" | "diameters", unit: string) => { const L = M[k]; return <div>
    <div class="flex flex-wrap gap-1.5">{L.map((v) => <span key={v} class="inline-flex items-center gap-1 h-8 pl-3 pr-1 rounded-full border border-line text-[13px] font-semibold num">{k === "sizes" && v >= 1000 ? `${v / 1000} kg` : `${v} ${unit}`}
      <button class="w-6 h-6 !min-h-0 grid place-items-center rounded-full hover:bg-c1" onClick={() => put({ [k]: L.filter((x) => x !== v) } as Partial<FilMaster>)} aria-label={`Remove ${v}`}><Icon name="close" size={12} /></button></span>)}</div>
    <form class="flex items-center gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); const f = e.target as HTMLFormElement, i = f.elements[0] as HTMLInputElement; const n = Number(i.value); if (n > 0 && !L.includes(n)) put({ [k]: [...L, n].sort((a, b) => a - b) } as Partial<FilMaster>); i.value = ""; }}>
      <input class={`${sm} w-40`} inputMode="decimal" placeholder={k === "sizes" ? "Add size in g" : "Add diameter mm"} /><Button icon="plus" variant="outline">Add</Button></form>
  </div>; };
  const list = tab !== "sizes" && tab !== "defaults" ? tab : null;
  const sugg = list ? SUGGEST[list].filter((x) => !names(list).some((n) => n.toLowerCase() === x.toLowerCase())) : [];
  return <Sheet wide onClose={close} title="Filament settings" footer={<div class="flex justify-end"><Button onClick={close}>Done</Button></div>}>
    <nav class="sticky top-0 z-10 bg-c0 flex gap-1.5 overflow-x-auto pb-3">{TABS.map(([k, l]) => <button key={k} onClick={() => { setTab(k); setNw(""); setNwN(""); }} class={`shrink-0 h-8 !min-h-0 px-3 rounded-full border text-[13px] font-semibold ${tab === k ? "bg-c4 text-c0 border-c4" : "border-line"}`}>{l}</button>)}</nav>
    {tab === "sizes" ? <div class="flex flex-col gap-5">
      <section><b class="text-sm">Spool sizes (net filament)</b><div class="mt-2">{chips("sizes", "g")}</div></section>
      <section><b class="text-sm">Filament diameters</b><div class="mt-2">{chips("diameters", "mm")}</div></section>
    </div> : tab === "defaults" ? <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <Field label="New spool size"><select class={inputCls} value={M.size} onChange={(e) => put({ size: Number((e.target as HTMLSelectElement).value) })}>{M.sizes.map((v) => <option key={v} value={v}>{v >= 1000 ? `${v / 1000} kg` : `${v} g`}</option>)}</select></Field>
      <Field label="New spool type"><select class={inputCls} value={M.body} onChange={(e) => put({ body: (e.target as HTMLSelectElement).value })}>{sortAbc(M.bodies, (b) => b.name).map((b) => <option key={b.name}>{b.name}</option>)}</select></Field>
      <Field label="New spool diameter"><select class={inputCls} value={M.diameter} onChange={(e) => put({ diameter: Number((e.target as HTMLSelectElement).value) })}>{M.diameters.map((v) => <option key={v} value={v}>{v} mm</option>)}</select></Field>
      <Field label="Fallback cost per kg (₹)"><input class={inputCls} inputMode="decimal" value={M.costKg} onInput={(e) => put({ costKg: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
      <Field label="Spool is low below (g)"><input class={inputCls} inputMode="numeric" value={M.lowG} onInput={(e) => put({ lowG: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
      <Field label="Reorder a type below (g)"><input class={inputCls} inputMode="numeric" value={M.reorderG} onInput={(e) => put({ reorderG: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
    </div> : list && <div class="flex flex-col gap-1.5">
      {list === "materials" && <H cols={["Tab colour|130px", "~Type", "Nozzle °C|64px", "Bed °C|56px", "₹ / kg|76px", "Spools|44px", "|32px"]} />}
      {list === "colours" && <H cols={["Hex|130px", "~Colour", "Spools|44px", "|32px"]} />}
      {list === "bodies" && <H cols={["~Spool type", "Empty weight g|110px", "Spools|44px", "|32px"]} />}
      {list === "brands" && <H cols={["~Brand", "Spools|44px", "|32px"]} />}
      {names(list).map((n, i) => { const used = use(list, n); return <div key={`${list}-${i}-${n}`} class="flex items-center gap-2">
        {list === "colours" && <HexBox v={M.colours[i].hex} on={(h) => setAt("colours", i, { hex: h })} label={n} />}
        {list === "materials" && <span class="w-[130px] shrink-0"><HexBox v={M.materials[i].hex} on={(h) => setAt("materials", i, { hex: h })} label={`${n} tab`} /></span>}
        <input class={`${sm} flex-1`} defaultValue={n} onBlur={(e) => rename(list, i, (e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()} aria-label="Name" />
        {list === "materials" && <>
          <input class={`${sm} w-16`} placeholder="—" value={M.materials[i].nozzle ?? ""} onInput={(e) => setAt("materials", i, { nozzle: (e.target as HTMLInputElement).value })} aria-label="Nozzle temp" />
          <input class={`${sm} w-14`} placeholder="—" value={M.materials[i].bed ?? ""} onInput={(e) => setAt("materials", i, { bed: (e.target as HTMLInputElement).value })} aria-label="Bed temp" />
          {numIn(M.materials[i].costKg, (c) => setAt("materials", i, { costKg: c }), "w-[76px]", String(M.costKg), "Cost per kg")}</>}
        {list === "bodies" && numIn(M.bodies[i].tare, (t) => setAt("bodies", i, { tare: t }), "w-[110px]", "g", "Empty spool weight")}
        <span class="t-meta num w-11 text-right shrink-0">{used}</span>
        <button class="w-8 h-8 !min-h-0 grid place-items-center rounded-lg border border-line disabled:opacity-30 shrink-0" disabled={used > 0} title={used ? "In use on spools" : "Remove"} onClick={() => del(list, i)} aria-label={`Remove ${n}`}><Icon name="close" size={14} /></button>
      </div>; })}
      <form class="flex items-center gap-2 mt-2 pt-3 border-t border-line" onSubmit={(e) => { e.preventDefault(); add(list); }}>
        <input class={`${sm} flex-1 !h-9`} list={`sug-${list}`} placeholder={`Add ${list === "materials" ? "type" : list === "bodies" ? "spool type" : MF[list]} — pick or type`} value={nw} onInput={(e) => setNw((e.target as HTMLInputElement).value)} />
        <datalist id={`sug-${list}`}>{sugg.map((x) => <option key={x} value={x} />)}</datalist>
        {list === "bodies" && <input class={`${sm} w-28 !h-9`} inputMode="numeric" placeholder="Empty g" value={nwN} onInput={(e) => setNwN((e.target as HTMLInputElement).value)} />}
        <Button icon="plus" disabled={!nw.trim()}>Add</Button>
      </form>
    </div>}
  </Sheet>;
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

/** Rapid audit: ± on the row itself, debounced into one logged stock movement. */
function QuickCount({ p }: { p: PackItem }) {
  const cat = p.cat === "Part" ? "part" : p.cat === "Accessory" ? "accessory" : "packing";
  return (
    <span class="inline-flex items-center gap-1.5" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Stepper label={`${p.name} stock`} value={p.qty} onCommit={(n) => {
        const d = n - p.qty; if (!d) return;
        applyMove({ id: uid(), date: today(), cat, item: p.name, dir: d > 0 ? "in" : "out", qty: Math.abs(d), unit: p.unit, unitCost: p.cost, vendor: "", notes: "Quick count", by: who() });
        log(`Stock count ${d > 0 ? "+" : ""}${d} ${p.unit}`, p.name, "stock");
      }} />
      <span class="t-meta">{p.unit}</span>
    </span>
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
  { key: "q", label: "Stock", align: "right", render: (p) => <QuickCount p={p} /> },
  { key: "r", label: "Reorder at", align: "right", render: (p) => p.reorderAt },
  { key: "c", label: "Unit cost", align: "right", render: (p) => inr(p.cost) },
  { key: "v", label: "Value", align: "right", render: (p) => inr(p.cost * p.qty) },
  { key: "w", label: "Vendor", render: (p) => p.vendor || "—", hideTablet: true },
  { key: "s", label: "State", card: "status", render: (p) => stockTone(p.qty, p.reorderAt) },
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
  const [q, setQ] = useState("");
  const r = useItems(itemsSig, "Accessory / part", (p) => (p.cat === "Part" ? "part" : "accessory"), (p) => p.cat === "Part");
  const rows = byActive(itemsSig.value, f).filter((p) => matchQ(q, p.name, p.size, p.vendor, p.machine)).sort((a, b) => abc(a.name, b.name));
  return (
    <Shell sub="Magnets, NFC tags, inserts and machine spares · tap a row to adjust stock" toolbar={<div class="flex flex-wrap items-center gap-2">{!isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search parts…" />}<ActiveChips v={f} on={setF} /></div>} detail={r.detail}
      actions={<><Button variant="outline" icon="plus" onClick={() => r.add({ cat: "Part" })}>Add part</Button><Button icon="plus" onClick={() => r.add({ cat: "Accessory" })}>Add accessory</Button></>}>
      {isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search parts, spares, vendor" />}
      <Section title="Accessories" note={String(rows.filter((a) => a.cat !== "Part").length)}><Card class="!py-1"><Table rows={rows.filter((a) => a.cat !== "Part")} rowKey={(a) => a.id} onRow={r.open} cols={iCols()} /></Card></Section>
      <Section title="Parts & spares" note={String(rows.filter((a) => a.cat === "Part").length)}><Card class="!py-1"><Table rows={rows.filter((a) => a.cat === "Part")} rowKey={(a) => a.id} onRow={r.open} cols={[...iCols().slice(0, 1), { key: "m", label: "Machine", render: (p) => p.machine || "Any" }, ...iCols().slice(1)]} /></Card></Section>
    </Shell>
  );
}

export function PackStock() {
  const [f, setF] = useState("active");
  const [q, setQ] = useState("");
  const r = useItems(packSig, "Packing item", () => "packing", () => false);
  const rows = byActive(packSig.value, f).filter((p) => matchQ(q, p.name, p.size, p.vendor)).sort((a, b) => abc(a.name, b.name));
  return (
    <Shell sub="Boxes, wrap, tape, stickers — consumed at packing" toolbar={<div class="flex flex-wrap items-center gap-2">{!isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search packing…" />}<ActiveChips v={f} on={setF} /></div>} detail={r.detail} actions={<Button icon="plus" onClick={() => r.add()}>Add packing item</Button>}>
      {isPhone.value && <SearchBar q={q} setQ={setQ} ph="Search boxes, tape, vendor" />}
      <div class="strip grid grid-cols-3">
        <Stat value={rows.length} label="items" />
        <Stat value={inr(rows.reduce((s, p) => s + p.qty * p.cost, 0))} label="value" />
        <Stat value={rows.filter((p) => p.qty <= p.reorderAt).length} label="to reorder" />
      </div>
      <Card class="!py-1"><Table rows={rows} rowKey={(p) => p.id} onRow={r.open} cols={iCols()} /></Card>
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
        <Field label="Item"><select class={inputCls} value={d.item} onChange={(e) => set({ item: (e.target as HTMLSelectElement).value })}>{names.map((n) => <option key={n} value={n}>{itemLabel(n)}</option>)}</select></Field>
        <Field label="Direction"><select class={inputCls} value={d.dir} onChange={(e) => set({ dir: (e.target as HTMLSelectElement).value as "in" })}><option value="in">In — purchase / return</option><option value="out">Out — manual use / write-off</option></select></Field>
        <Field label={`Quantity (${d.unit})`}><input class={inputCls} type="number" value={d.qty || ""} onInput={(e) => set({ qty: num(e) })} /></Field>
        <Field label="Unit cost ₹ (at this time)"><input class={inputCls} type="number" step="0.01" value={d.unitCost || ""} onInput={(e) => set({ unitCost: num(e) })} /></Field>
        <Field label="Vendor"><input class={inputCls} value={d.vendor} onInput={(e) => set({ vendor: val(e) })} /></Field>
        <Field label="Date"><input class={inputCls} type="date" value={d.date} onInput={(e) => set({ date: val(e) })} /></Field>
        {d.cat === "filament" && <Field label="Colour · brand"><input class={inputCls} value={`${d.colour ?? ""}${d.brand ? " · " + d.brand : ""}`} onInput={(e) => { const [c, b] = val(e).split("·").map((x) => x.trim()); set({ colour: c, brand: b ?? "" }); }} /></Field>}
        <div class="sm:col-span-2"><Field label="Notes"><input class={inputCls} value={d.notes} onInput={(e) => set({ notes: val(e) })} /></Field></div>
      </div>
      <div class="mt-4"><Actions><Button icon="check" disabled={!d.qty || !d.item} onClick={() => { applyMove(d); log(`Stock ${d.dir} ${d.qty} ${d.unit}`, d.item, "stock"); setOpen(d); setForm(false); setD(blank()); }}>Save movement</Button><Button variant="outline" onClick={() => setForm(false)}>Cancel</Button></Actions></div>
    </div>
  ) : open && <Inspect title={`${open.dir === "in" ? "In" : "Out"} · ${itemLabel(open.item)}`} row={{ date: open.date, category: open.cat, direction: open.dir, quantity: `${open.qty} ${open.unit}`, unitCost: `₹${open.unitCost}`, value: inr(open.qty * open.unitCost), vendor: open.vendor, colour: open.colour ?? "", brand: open.brand ?? "", notes: open.notes, loggedBy: open.by }} onClose={() => setOpen(null)} />;
  return (
    <Shell sub="Purchases and manual adjustments — every movement in and out" detail={detail}
      toolbar={<div class="flex flex-wrap gap-2"><Pick title="Category" value={cat} on={setCat} items={["all", ...CATS]} label={(c) => c === "all" ? "All" : c[0].toUpperCase() + c.slice(1)} /></div>}
      actions={<Button icon="plus" onClick={() => { setOpen(null); setForm(true); }}>Log movement</Button>}>
      <div class="strip grid grid-cols-3">
        <Stat value={rows.filter((m) => m.dir === "in").length} label="in" />
        <Stat value={rows.filter((m) => m.dir === "out").length} label="out" />
        <Stat value={inr(rows.filter((m) => m.dir === "in").reduce((s, m) => s + m.qty * m.unitCost, 0))} label="bought" />
      </div>
      <Card class="!py-1">
        <Table rows={rows} rowKey={(m) => m.id} onRow={(m) => { setForm(false); setOpen(m); }} cols={[
          { key: "i", label: "Item", render: (m) => itemLabel(m.item) },
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
      detail={open && <Inspect title={itemLabel(open.item)} row={{ kind: open.kind, quantity: `${open.qty} ${open.unit}`, cost: inr(open.cost), order: open.orderNo ?? "Store use", batch: open.batch ?? "", printer: open.printer ?? "", when: open.at, who: open.who }} onClose={() => setOpen(null)} />}>
      <div class="strip grid grid-cols-3 md:grid-cols-6">
        <Stat value={inr(consSig.value.reduce((s, c) => s + c.cost, 0))} label="Total" />
        {["filament", "machine", "packing", "labour", "scrap"].map((x) => <Stat key={x} value={inr(by(x))} label={x} />)}
      </div>
      <Card><div class="text-sm font-bold mb-2">Log consumption <span class="font-normal text-c3">— no order = store use</span></div><ConsumeForm /></Card>
      <Card class="!py-1">
        <Table rows={rows} rowKey={(c) => c.id} onRow={setOpen} cols={[
          { key: "i", label: "Item", render: (c) => itemLabel(c.item) },
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
