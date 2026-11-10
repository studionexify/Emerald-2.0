import { Thumb } from "../../ui/media";
import { vOrders } from "../../data";
import { useEffect, useState } from "preact/hooks";
import { Button, Icon, Section, Sheet, Status, Waterfall } from "../../ui";
import { b2bFor } from "../../data/inventory";
import { inr, orderTotal, ordersSig, shortDate, STAGES, type Order, printersSig, jobsSig, batchesSig, today, clientsSig, toBin, log, me, duplicateOrder, STAGE_LABEL, TYPE_LABEL, SIZE_LABEL, B2B_TYPES, shrinkImage, storeMedia, lineProgress, orderProgress, lineMachines, SUGGESTED, orderPace, type OrderSize, type Client } from "../../data";
import { OrderDetail, WorkShell , useOpenOrder } from "./shared";
import { lazy } from "../../router";
const Floor = lazy(() => import("./Floor").then((m) => m.Floor));
const QuickCreate = lazy(() => import("./InHouseParts").then((m) => m.QuickCreate));
const InHouseCard = lazy(() => import("./InHouseParts").then((m) => m.InHouseCard));
import { Pick } from "../../ui";
import { booksModeSig, canSwitchMode, PAY_LABEL } from "../../data/mode";
import { segmentOf, SEGMENT_LABEL, type Segment } from "../../data/inventory";

const PAGE = 25;
/** A run can span several machines, stored as "A + B". */
const ranOn = (printer: string | undefined, name: string) => !!printer && printer.split(" + ").includes(name);


const DAY = 86400000;
/** Small / Bulk / B2B (business clients, with their kind of shop). */
function kindOf(o: Order, c?: Client) {
  if (o.type === "inhouse") return "In-house";
  if (o.size) return o.size === "b2b" ? (o.b2b ? `B2B · ${o.b2b}` : "B2B") : SIZE_LABEL[o.size];
  if (o.type === "bulk") return "Bulk";
  if (c && (c.kind === "Business" || c.gstin)) return c.medium ? `B2B · ${c.medium}` : "B2B";
  return "Small";
}
const left = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / DAY);
const leftLabel = (n: number) => (n === 0 ? "today" : n > 0 ? `${n}d left` : `${-n}d late`);

/** Row menu: client, value, edit, delete. */
function RowMenu({ o, c, onOpen, onEdit }: { o: Order; c?: Client; onOpen: (o: Order) => void; onEdit: (o: Order) => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const f = () => setOn(false); addEventListener("click", f); return () => removeEventListener("click", f); }, [on]);
  const it = "w-full text-left px-3 h-9 !min-h-0 text-[13px] hover:bg-c1 cursor-pointer flex items-center gap-2";
  return (
    <div class="relative" onClick={(e) => e.stopPropagation()}>
      <button aria-label="More" onClick={() => setOn(!on)} class="w-8 h-8 !min-h-0 rounded-lg grid place-items-center hover:bg-c1 cursor-pointer"><Icon name="more" size={16} /></button>
      {on && (
        <div class="absolute right-0 top-9 z-30 w-64 rounded-xl bg-c0 border border-line shadow-lg py-1 pop-in">
          <div class="px-3 py-2 border-b border-line text-[12px]">
            <div class="font-semibold text-[13px]">{o.customer}</div>
            {c ? <div class="text-c3">{[c.phone, c.email, c.city].filter(Boolean).join(" · ") || "No contact saved"}{c.gstin && <span class="block">GSTIN {c.gstin}</span>}{c.address && <span class="block">{c.address}</span>}</div> : <div class="text-c3">Not in clients list</div>}
          </div>
          <div class="px-3 py-2 border-b border-line flex justify-between text-[13px]"><span class="text-c3">Order value</span><b class="num">{o.type === "inhouse" ? "Internal" : inr(orderTotal(o))}</b></div>
          <div class="px-3 py-1.5 border-b border-line flex justify-between text-[12px] text-c3"><span>Order no.</span><span class="font-mono">{o.no}</span></div>
          <div class="px-3 py-1.5 border-b border-line flex justify-between text-[12px] text-c3"><span>Payment</span><span>{o.paid ? "Paid" : "Unpaid"}{o.invoiced ? " · invoiced" : ""}</span></div>
          <button class={it} onClick={() => { setOn(false); onOpen(o); }}><Icon name="right" size={14} />Open details</button>
          <button class={it} onClick={() => { setOn(false); onEdit(o); }}><Icon name="edit" size={14} />Edit order</button>
          <button class={it} onClick={() => { setOn(false); onOpen(duplicateOrder(o)); }}><Icon name="copy" size={14} />Duplicate</button>
          {c?.phone && <a class={it} href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Icon name="out" size={14} />WhatsApp client</a>}
          <button class={`${it} text-warn`} onClick={() => { setOn(false); if (confirm(`Delete order for ${o.customer}? It goes to the Bin.`)) { toBin("Order", o, `${o.customer} · ${o.no}`, me.value?.name ?? "you"); log("Deleted order", o.no); } }}><Icon name="bin" size={14} />Delete order</button>
        </div>
      )}
    </div>
  );
}

/** Live order row: client · type | items | stage | city | deadline | ⋯ */
/* Live-orders table: fixed columns stay tight, flexible ones (client, items, city) share the extra width. */
const STAGE_HUE: Record<string, string> = { quotation: "#8A93A3", po: "#8C8FC4", production: "#6B8DB5", qc: "#C49A5A", packing: "#9A86B8", invoice: "#6FA39C", shipping: "#6E9C7C", archived: "#8A93A3", blocked: "#B97468" };
const KIND_HUE = (k: string) => (k.startsWith("B2B") ? "#6B8DB5" : k === "Bulk" ? "#9A86B8" : k === "In-house" ? "#8A93A3" : "#6FA39C");
const tint = (h: string) => ({ color: h, background: `color-mix(in srgb, ${h} 13%, transparent)` });

/* ——— Per-tab layouts. Each production tab shows the columns that matter to it. ——— */
const HEAD = "hidden @lg:grid gap-x-4 px-4 h-10 items-center bg-c1 rounded-t-[var(--radius-card)] border-b border-line text-[11px] font-bold uppercase tracking-[0.06em] text-c3";
const ROW = "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 py-3 px-4 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0";
const SEG_COLS: Record<Segment, { cols: string; head: string[] }> = {
  client: { cols: "@lg:grid-cols-[minmax(140px,1.2fr)_minmax(170px,1.6fr)_96px_110px_120px_84px_28px]", head: ["Client", "Items", "Amount", "Payment", "Stage", "Deadline", ""] },
  bulk: { cols: "@lg:grid-cols-[minmax(150px,0.7fr)_minmax(150px,1.2fr)_minmax(200px,2fr)_110px_minmax(150px,170px)]", head: ["Type", "Client", "Print progress", "Deadline", ""] },
  inhouse: { cols: "@lg:grid-cols-[minmax(150px,1.3fr)_minmax(170px,1.6fr)_minmax(120px,0.9fr)_120px_84px_28px]", head: ["Build", "Items", "Machine", "Stage", "Due", ""] },
};
function Items({ o, seg, all, setAll }: { o: Order; seg?: Segment; all?: boolean; setAll?: (v: boolean) => void }) {
  const [more, setMore] = useState(false);
  const bulk = seg === "bulk", open = bulk ? !!all : more;
  const shown = open && !bulk ? o.items : o.items.slice(0, 2);
  return <ul class="min-w-0 @max-lg:col-span-2 @max-lg:row-start-2 text-[13px] leading-[1.5]">
    {shown.map((i, k) => <li key={k} class="flex items-center gap-2 min-w-0"><span class="num font-semibold text-c4 w-10 shrink-0 text-right">{i.qty}×</span><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-7 h-7 !rounded-md" /><span class="min-w-0 text-c3 truncate">{i.name}</span></li>)}
    {(o.items.length > 2 || bulk) && <li class="pl-[48px]"><button class={`cursor-pointer !min-h-0 ${bulk ? `mt-1 h-7 px-2.5 rounded-md text-[12px] font-semibold ${open ? "bg-c4 text-c0" : "bg-c1 text-c4"}` : "t-meta underline"}`} onClick={(e) => { e.stopPropagation(); bulk ? setAll?.(!open) : setMore(!more); }} aria-expanded={open}>
      {bulk ? (open ? "Close print desk" : `${o.items.length > 2 ? `All ${o.items.length} items · ` : ""}Log printing ▾`) : more ? "Show less" : `+${o.items.length - 2} more — show all`}</button></li>}
  </ul>;
}
export const StagePill = ({ o }: { o: Order }) => { const st = o.blocked ? "blocked" : o.stage; return <div class="@max-lg:hidden"><span class="inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[12px] font-semibold whitespace-nowrap" style={tint(STAGE_HUE[st])}><span class="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_HUE[st] }} />{o.blocked ? "Blocked" : STAGE_LABEL[o.stage]}</span></div>; };
const Due = ({ o }: { o: Order }) => { const d = left(o.due); return <div class="text-right @lg:text-left @max-lg:col-start-2 @max-lg:row-start-1">
  <div class="text-[13px] font-semibold whitespace-nowrap">{shortDate(o.due)}</div>
  <div class="text-[11px] whitespace-nowrap font-medium" style={{ color: d < 0 ? STAGE_HUE.blocked : d <= 2 ? STAGE_HUE.qc : "var(--c-3)" }}>{leftLabel(d)}</div></div>; };
function Pace({ o }: { o: Order }) {
  const p = orderPace(o); if (!p) return null;
  if (p.finish === null && p.late === 0) return null;
  const bad = p.late > 0;
  return <div class={`text-[11px] font-semibold whitespace-nowrap ${bad ? "text-red" : "text-grn"}`} title={`About ${Math.round(p.rate)} good pieces a day so far`}>
    {p.late === Infinity ? "No pace yet" : bad ? `${p.late}d late at this pace` : `On track · ${shortDate(p.finish!)}`}</div>;
}
function Progress({ o }: { o: Order }) {
  const t = orderProgress(o), pct = t.qty ? Math.min(100, (t.printed / t.qty) * 100) : 0, wp = t.qty ? Math.min(100 - pct, (t.failed / t.qty) * 100) : 0;
  return <div class="@max-lg:col-span-2 min-w-0">
    <div class="flex h-2 rounded-full bg-c1 overflow-hidden"><span class="bg-grn" style={{ width: `${pct}%` }} /><span class="bg-red" style={{ width: `${wp}%` }} /></div>
    <div class="text-[11px] font-medium mt-1 whitespace-nowrap"><span class="text-grn">{t.printed}</span><span class="text-c3">/{t.qty} printed</span> · <span class="text-red">{t.failed} wasted</span> · <span class="text-c3">{t.pending} pending</span></div>
  </div>;
}
function SegRow({ seg, o, onOpen, onEdit, onFloor }: { seg: Segment; o: Order; onOpen: (o: Order) => void; onEdit: (o: Order) => void; onFloor: (o: Order) => void }) {
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  const kind = kindOf(o, c);
  const open = { role: "button" as const, tabIndex: 0, onClick: () => onOpen(o), onKeyDown: (e: KeyboardEvent) => e.key === "Enter" && onOpen(o), class: `${ROW} ${SEG_COLS[seg].cols}` };
  const menu = <div class="@max-lg:hidden"><RowMenu o={o} c={c} onOpen={onOpen} onEdit={onEdit} /></div>;
  if (seg === "client") return <div {...open}>
    <div class="min-w-0"><div class="text-[14px] font-semibold leading-snug truncate">{o.customer}</div><div class="t-meta truncate">{[c?.city, c?.phone || o.medium].filter(Boolean).join(" · ")}</div></div>
    <Items o={o} seg={seg} />
    <span class="@max-lg:hidden num text-[13px] font-semibold">{inr(orderTotal(o))}</span>
    <span class="@max-lg:hidden"><span class="inline-flex px-2 h-6 items-center rounded-md text-[12px] font-semibold" style={tint(o.paid ? STAGE_HUE.shipping : STAGE_HUE.qc)}>{o.paid ? "Paid" : "Unpaid"}</span></span>
    <StagePill o={o} /><Due o={o} />{menu}
  </div>;
  if (seg === "inhouse") { const ms = [...new Set(o.items.flatMap((i) => lineMachines(o, i).map((m) => m.name)))]; return <div {...open}>
    <div class="min-w-0"><div class="text-[14px] font-semibold leading-snug truncate">{o.customer}</div><div class="t-meta font-mono">{o.no}</div></div>
    <Items o={o} seg={seg} />
    <span class="@max-lg:hidden text-[13px] text-c3 truncate">{ms.join(", ") || "—"}</span>
    <StagePill o={o} /><Due o={o} />{menu}
  </div>; }
  const tp = o.items.filter((i) => !i.offFloor).length;
  return <div {...open}>
    <div class="@max-lg:hidden flex flex-wrap gap-1.5"><span class="inline-flex px-2 h-6 items-center rounded-md text-[12px] font-semibold whitespace-nowrap" style={tint(KIND_HUE(kind))}>{kind}</span>{canSwitchMode() && booksModeSig.value === "both" && <span class=" inline-flex px-1.5 h-6 items-center rounded-md text-[11px] font-bold" style={tint(o.pay === "beta" ? "#B39567" : "#6B8DB5")}>{o.pay === "beta" ? "β" : "α"}</span>}</div>
    <div class="min-w-0 text-[15px] font-semibold leading-snug">{o.customer}</div>
    <Progress o={o} />
    <div class="@max-lg:col-start-2 @max-lg:row-start-1"><Due o={o} /><Pace o={o} /></div>
    <button type="button" onClick={(e) => { e.stopPropagation(); onFloor(o); }} class="@max-lg:col-span-2 !min-h-0 rounded-xl bg-grn text-c0 py-3 px-4 text-center cursor-pointer hover:opacity-90">
      <span class="block text-[17px] font-bold tracking-wide leading-tight">FLOOR</span><span class="block text-[11px] opacity-80">{tp} item{tp === 1 ? "" : "s"} · open sheet</span></button>
  </div>;
}
/** One strip: key numbers, queue and the pipeline stages, each with a glyph. Stages filter the list. */
const STAGE_GLYPH: Record<string, string> = { production: "printer", qc: "shield", packing: "box", archive: "archive", archived: "archive", quotation: "doc", po: "stamp", invoice: "receipt", shipping: "truck" };
function Summary({ kpis, list, active, onPick, stages }: { kpis: [string, string | number, string, string?][]; list: Order[]; active: string; onPick: (k: string) => void; stages: typeof STAGES }) {
  const tile = "px-3 py-2.5 min-w-0 text-left border-line";
  return <div class="grid rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden divide-x divide-line" style={{ gridTemplateColumns: `repeat(${kpis.length + stages.length}, minmax(0, 1fr))` }}>
    {kpis.map(([k, v, ic, cl]) => <div key={k} class={tile}><div class="t-meta flex items-center gap-1.5 truncate"><Icon name={ic} size={14} /><span class="truncate">{k}</span></div><div class={`num text-[22px] font-semibold leading-tight ${cl ?? ""}`}>{v}</div></div>)}
    {stages.map((s) => { const n = list.filter((o) => o.stage === s.key).length, on = active === s.key; return (
      <button key={s.key} type="button" onClick={() => onPick(on ? "" : s.key)} aria-pressed={on} class={`${tile} cursor-pointer !min-h-0 ${on ? "bg-c4 text-c0" : "bg-c1/50 hover:bg-c1"}`}>
        <div class={`text-[12px] flex items-center gap-1.5 truncate ${on ? "opacity-80" : "text-c3"}`}><Icon name={STAGE_GLYPH[s.key] ?? "rows"} size={14} /><span class="truncate">{s.label}</span></div>
        <div class="num text-[22px] font-semibold leading-tight">{n}</div></button>); })}
  </div>;
}

/** Quick edit of the order header and line quantities. */
function EditOrder({ order, onDone }: { order: Order; onDone: (o: Order | null) => void }) {
  const [o, setO] = useState<Order>({ ...order, items: order.items.map((i) => ({ ...i })) });
  const f = "h-9 px-2 rounded-lg border border-line bg-c1 text-[13px] w-full min-w-0";
  const put = (k: number, patch: Partial<Order["items"][number]>) => setO((cur) => ({ ...cur, items: cur.items.map((x, j) => (j === k ? { ...x, ...patch } : x)) }));
  const attach = async (k: number, file?: File | null) => {
    if (!file || !file.type.startsWith("image/")) return;
    const [full, thumb] = await Promise.all([shrinkImage(file, 1024, 0.6), shrinkImage(file, 160, 0.6)]);
    put(k, { img: storeMedia(full, `${o.no} ${o.items[k]?.name ?? file.name}`), thumb });
  };
  const addLine = () => setO((cur) => { const last = cur.items[cur.items.length - 1]; return { ...cur, items: [...cur.items, { name: "", material: last?.material || "PLA", colour: last?.colour || "", qty: 1, price: 0, cost: 0 }] }; });
  const save = () => { const items = o.items.filter((i) => i.name.trim()); const next = { ...o, items }; ordersSig.value = ordersSig.value.map((x) => (x.id === next.id ? next : x)); log("Edited order", next.no); onDone(next); };
  const num = (v: string) => Math.max(0, Number(v) || 0);
  const tot = orderProgress(o);
  const th = "text-left text-[11px] font-semibold uppercase tracking-wide text-c3 px-1.5 py-2 whitespace-nowrap";
  return (
    <Sheet huge open onClose={() => onDone(null)} title={`Edit order · ${order.customer}`}
      footer={<><Button variant="outline" onClick={() => onDone(null)}>Cancel</Button><Button onClick={save}>Save changes</Button></>}>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
        <label class="col-span-2">Client<input class={f} value={o.customer} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setO({ ...o, customer: v, ...(b2bFor(v) ?? {}) }); }} /></label>
        <label>Type<select class={f} value={o.type} onChange={(e) => setO({ ...o, type: (e.target as HTMLSelectElement).value as Order["type"] })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Order type<select class={f} value={o.size ?? ""} onChange={(e) => { const v = (e.target as HTMLSelectElement).value as OrderSize; setO({ ...o, size: v || undefined, b2b: v === "b2b" ? o.b2b ?? B2B_TYPES[0] : undefined }); }}><option value="">—</option>{Object.entries(SIZE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {canSwitchMode() && <label>Payment mode<select class={f} value={o.pay ?? "alpha"} onChange={(e) => setO({ ...o, pay: (e.target as HTMLSelectElement).value as "alpha" | "beta" })}><option value="alpha">{PAY_LABEL.alpha}</option><option value="beta">{PAY_LABEL.beta}</option></select></label>}
        {o.size === "b2b" && <label>B2B type<select class={f} value={o.b2b} onChange={(e) => setO({ ...o, b2b: (e.target as HTMLSelectElement).value })}>{B2B_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>}
        <label>Deadline<input type="date" class={f} value={o.due} onInput={(e) => setO({ ...o, due: (e.target as HTMLInputElement).value })} /></label>
        <label>Medium<input class={f} value={o.medium} onInput={(e) => setO({ ...o, medium: (e.target as HTMLInputElement).value })} /></label>
      </div>
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mt-5 mb-2">
        <h3 class="font-semibold text-sm mr-auto">Items · {o.items.length}</h3>
        <span class="text-[12px]">Ordered <b class="num">{tot.qty}</b></span>
        <span class="text-[12px] text-grn">Printed <b class="num">{tot.printed}</b></span>
        <span class="text-[12px] text-red">Wasted <b class="num">{tot.failed}</b></span>
        <span class="text-[12px]">Pending <b class="num">{tot.pending}</b></span>
        <span class="text-[13px] font-semibold num">Total {inr(orderTotal(o))}</span>
      </div>
      <div class="overflow-x-auto rounded-xl border border-line">
        <table class="w-full min-w-[920px] border-collapse">
          <thead class="bg-c1/60"><tr>
            <th class={th}>Image</th><th class={`${th} w-[30%]`}>Item</th><th class={th}>Material</th><th class={th}>Colour</th>
            <th class={th}>Qty</th><th class={th}>₹ each</th><th class={th}>Printed</th><th class={th}>Wasted</th><th class={th}>Pending</th><th class={th}>Amount</th><th class={th} />
          </tr></thead>
          <tbody>
            {o.items.map((i, k) => { const p = lineProgress(o, i); return (
              <tr key={k} class="border-t border-line align-middle"
                onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); attach(k, e.dataTransfer?.files?.[0]); }}
                onPaste={(e) => { const fl = [...(e.clipboardData?.files ?? [])][0]; if (fl) { e.preventDefault(); attach(k, fl); } }}>
                <td class="px-1.5 py-1.5"><div class="flex items-center gap-1.5">
                  <Thumb thumb={i.thumb} full={i.img} alt={i.name || "Item"} onAdd={(fl) => attach(k, fl)} />
                  <div class="flex flex-col text-[11px] leading-tight">
                    <label class="underline cursor-pointer whitespace-nowrap">{i.img || i.thumb ? "Replace" : "Upload"}<input type="file" accept="image/*" class="sr-only" onChange={(e) => { attach(k, (e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} /></label>
                    {(i.img || i.thumb) && <button type="button" class="underline text-red cursor-pointer !min-h-0 text-left" onClick={() => put(k, { img: undefined, thumb: undefined })}>Remove</button>}
                  </div></div></td>
                <td class="px-1.5"><input class={f} placeholder="Item name" title={i.name} value={i.name} onInput={(e) => put(k, { name: (e.target as HTMLInputElement).value })} /></td>
                <td class="px-1.5 w-[110px]"><input class={f} value={i.material} onInput={(e) => put(k, { material: (e.target as HTMLInputElement).value })} /></td>
                <td class="px-1.5 w-[110px]"><input class={f} value={i.colour} onInput={(e) => put(k, { colour: (e.target as HTMLInputElement).value })} /></td>
                <td class="px-1.5 w-[80px]"><input class={f} type="number" min={0} value={i.qty} onInput={(e) => put(k, { qty: num((e.target as HTMLInputElement).value) })} /></td>
                <td class="px-1.5 w-[90px]"><input class={f} type="number" min={0} value={i.price} onInput={(e) => put(k, { price: num((e.target as HTMLInputElement).value) })} /></td>
                <td class="px-1.5 w-[80px]"><input class={f} type="number" min={0} value={p.printed} onInput={(e) => put(k, { printed: num((e.target as HTMLInputElement).value) })} /></td>
                <td class="px-1.5 w-[80px]"><input class={f} type="number" min={0} value={p.failed} onInput={(e) => put(k, { failed: num((e.target as HTMLInputElement).value) })} /></td>
                <td class="px-1.5 w-[70px] num text-[13px] font-semibold">{p.pending}</td>
                <td class="px-1.5 w-[90px] num text-[13px] whitespace-nowrap">{inr(i.qty * i.price)}</td>
                <td class="px-1.5 w-[40px]"><button type="button" aria-label="Remove line" class="h-9 w-9 !min-h-0 rounded-lg hover:bg-c1 grid place-items-center cursor-pointer" onClick={() => setO({ ...o, items: o.items.filter((_, j) => j !== k) })}><Icon name="close" size={14} /></button></td>
              </tr>); })}
          </tbody>
        </table>
      </div>
      <div class="flex items-center justify-between gap-3 mt-2">
        <span class="t-meta">Drop or paste an image onto any row. Lines without a name are dropped on save.</span>
        <Button variant="outline" onClick={addLine}>+ Add item</Button>
      </div>
    </Sheet>
  );
}

export const BulkB2B = () => <Overview seg="bulk" />;
export const InHouse = () => <Overview seg="inhouse" />;
const SEG_SUB: Record<Segment, string> = { client: "Small orders from individual clients", bulk: "Bulk runs and business clients — stationery, gift shops, corporate", inhouse: "Our own builds, samples and stock prints" };
export default function Overview({ seg = "client" }: { seg?: Segment }) {
  const [f, setF] = useState<string>("all");
  const [open, setOpen] = useOpenOrder();
  const [edit, setEdit] = useState<Order | null>(null);
  const [floor, setFloor] = useState<Order | null>(null), [quick, setQuick] = useState(false);
  const [n, setN] = useState(PAGE);
  const [st, setSt] = useState("");
  const [q, setQ] = useState(""), [sort, setSort] = useState<"due" | "done" | "pending">("due");
  const mine = vOrders().filter((o) => segmentOf(o) === seg);
  const subs = [...new Set(mine.map((o) => kindOf(o)))].sort();
  const list = mine.filter((o) => f === "all" || kindOf(o) === f);
  const ql = q.trim().toLowerCase();
  const pctDone = (o: Order) => { const t = orderProgress(o); return t.qty ? t.printed / t.qty : 0; };
  const live = list.filter((o) => (st ? o.stage === st : o.stage !== "archived")).filter((o) => !ql || o.customer.toLowerCase().includes(ql) || o.no.toLowerCase().includes(ql) || o.items.some((i) => i.name.toLowerCase().includes(ql)))
    .sort((a, b) => sort === "done" ? pctDone(b) - pctDone(a) : sort === "pending" ? orderProgress(b).pending - orderProgress(a).pending : seg === "inhouse" ? b.created.localeCompare(a.created) || b.no.localeCompare(a.no) : Number(!!b.blocked) - Number(!!a.blocked) || a.due.localeCompare(b.due));
  const fleet = printersSig.value.filter((p) => p.active !== false);
  const nos = new Set(mine.map((o) => o.no));
  const isOn = (p: (typeof fleet)[number]) => p.status === "printing" || batchesSig.value.some((b) => b.running && ranOn(b.printer, p.name));
  const activeFleet = fleet.filter(isOn);
  const myJobs = jobsSig.value.filter((j) => nos.has(j.orderNo));
  const flow = SUGGESTED[seg === "client" ? "client" : seg === "inhouse" ? "inhouse" : "bulk"];
  const stages = STAGES.filter((x) => flow.includes(x.key));
  const all = mine.filter((o) => o.stage !== "archived");
  const weekEnd = left(today()) + 7;
  const queued = myJobs.filter((j) => j.status === "queued").length;
  type K = [string, string | number, string, string?];
  const kpis: K[] = seg === "client"
    ? [["Value in work", inr(all.reduce((t, o) => t + orderTotal(o), 0)), "money"], ["Unpaid", all.filter((o) => !o.paid).length, "alert", "text-red"], ["Due this week", all.filter((o) => left(o.due) <= weekEnd).length, "calendar"]]
    : seg === "bulk" ? (() => { const t = all.reduce((a, o) => { const p = orderProgress(o); return { p: a.p + p.printed, f: a.f + p.failed, n: a.n + p.pending }; }, { p: 0, f: 0, n: 0 });
        return [["Pending", t.n, "hourglass"], ["Printed", t.p, "check", "text-grn"], [t.p + t.f ? `Wasted · ${Math.round((t.f / (t.p + t.f)) * 100)}%` : "Wasted", t.f, "alert", "text-red"]] as K[]; })()
    : [["To print", all.reduce((t, o) => t + orderProgress(o).pending, 0), "hourglass"], ["Printing now", myJobs.filter((j) => j.status === "printing").length + batchesSig.value.filter((b) => b.running && nos.has(b.orderNo)).length, "printer"]];
  kpis.push(["Queue", queued, "list"]);
  return (
    <>{floor && <Floor order={floor} onClose={() => setFloor(null)} />}{quick && <QuickCreate onClose={() => setQuick(false)} />}{edit && <EditOrder order={edit} onDone={(o) => { setEdit(null); if (o) setOpen(o); }} />}<WorkShell detail={open && <OrderDetail order={vOrders().find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} onStage={(k) => setSt(k)} />} title={`Production · ${SEGMENT_LABEL[seg]}`} sub={SEG_SUB[seg]} toolbar={subs.length > 1 ? <Pick title="Type" value={f} on={setF} items={["all", ...subs]} label={(k) => (k === "all" ? "All types" : k)} /> : undefined}>
      <Summary kpis={kpis} list={list} active={st} onPick={setSt} stages={stages} />

      {seg === "inhouse" && <button type="button" onClick={() => setQuick(true)} class="self-start !min-h-0 h-11 px-5 rounded-xl bg-grn text-c0 inline-flex items-center gap-2 text-[15px] font-bold tracking-wide cursor-pointer hover:opacity-90"><Icon name="plus" size={18} />Create</button>}
      <Section title={st ? `${STAGES.find((x) => x.key === st)?.label} orders` : "Live orders"} note={String(live.length)} action={st ? <button class="t-meta underline cursor-pointer !min-h-0" onClick={() => setSt("")}>Show all live</button> : undefined}>
          <div class="flex flex-wrap items-center gap-2 mb-2">
            <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search client, order no. or product" aria-label="Search live orders" class="h-9 px-3 rounded-lg border border-line bg-c0 text-[13px] flex-1 min-w-[180px]" />
            <select value={sort} onChange={(e) => setSort((e.target as HTMLSelectElement).value as typeof sort)} aria-label="Sort live orders" class="h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] cursor-pointer">
              <option value="due">{seg === "inhouse" ? "Sort: newest" : "Sort: deadline"}</option>{seg !== "client" && <option value="done">Sort: most done</option>}{seg !== "client" && <option value="pending">Sort: most pending</option>}
            </select>
          </div>
          <div class="@container rounded-[var(--radius-card)] bg-c0 border border-line overflow-x-auto">
            {seg !== "inhouse" && <div class={`${HEAD} ${SEG_COLS[seg].cols}`}>{SEG_COLS[seg].head.map((h, i) => <span key={i}>{h}</span>)}</div>}
            {live.slice(0, n).map((o) => seg === "inhouse" ? <InHouseCard key={o.id} o={o} onOpen={(x) => { setEdit(null); setOpen(x); }} /> : <SegRow key={o.id} seg={seg} o={o} onOpen={(x) => { setEdit(null); setOpen(x); }} onEdit={(x) => setEdit(x)} onFloor={(x) => setFloor(x)} />)}
            {live.length > n && <button onClick={() => setN(n + PAGE)} class="w-full h-9 border-t border-line text-[13px] font-medium text-c3 hover:bg-c1/60 cursor-pointer">Show {Math.min(PAGE, live.length - n)} more</button>}
          </div>
        </Section>

      {seg !== "client" && activeFleet.length > 0 && <Section title="Printing now" note={`${activeFleet.length} of ${fleet.length} machines`} action={<a href="/workshop/printers" class="t-meta">All →</a>}>
        <Waterfall min={260} max={5} gap="gap-3" items={[
          ...activeFleet.map((p): [number, preact.ComponentChildren] => {
            const j = myJobs.find((x) => x.printer === p.name && x.status === "printing");
            const run = batchesSig.value.find((b) => b.running && ranOn(b.printer, p.name));
            const ord = j ? mine.find((o) => o.no === j.orderNo) : run && mine.find((o) => o.no === run.orderNo);
            const hot = !!j || !!run || p.status === "printing";
            return [j || (run && ord) ? 3 : 2,
              <a key={p.id} href="#" onClick={(e) => { e.preventDefault(); if (ord) setOpen(ord); }}
                class={`rounded-[var(--radius-card)] p-4 min-w-0 block min-h-[148px] transition-colors ${hot ? "bg-c4 text-c0 border-2 border-c4 shadow-lg" : "bg-c0 border border-line hover:bg-c1/40"}`}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0"><div class="text-[16px] font-bold leading-tight">{p.name}</div><div class={`text-[12px] ${hot ? "opacity-70" : "text-c3"}`}>{p.model}</div></div>
                  {hot ? <span class="inline-flex items-center gap-1.5 px-2 h-6 rounded-full bg-c0 text-c4 text-[11px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-[#8FC29E] animate-pulse" />Printing</span>
                    : <Status tone={p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>}
                </div>
                {!j && run && ord ? (
                  <div class="mt-3">
                    <div class="text-[11px] uppercase tracking-[0.06em] opacity-70">For</div>
                    <div class="text-[15px] font-semibold leading-snug">{ord.customer}</div>
                    <div class="text-[13px] opacity-80">{run.units}× {run.name}</div>
                    <div class="text-[12px] opacity-70 mt-1 truncate">{[run.spool, run.by, run.at ? `since ${new Date(run.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""].filter(Boolean).join(" · ")}</div>
                  </div>
                ) : j ? (
                  <div class="mt-3">
                    <div class="text-[11px] uppercase tracking-[0.06em] opacity-70">For</div>
                    <div class="text-[15px] font-semibold leading-snug">{ord?.customer ?? j.orderNo}</div>
                    <div class="text-[13px] opacity-80">{j.item}</div>
                    <div class="text-[12px] opacity-70 num mt-1">{j.hours} h · {j.grams} g{j.operator ? ` · ${j.operator}` : ""}</div>
                  </div>
                ) : <div class={`mt-3 text-[13px] ${hot ? "opacity-70" : "text-c3"}`}>{p.status === "down" ? "Out of service" : hot ? "Busy with another tab’s order" : "Free — nothing printing"}</div>}
              </a>];
          }),
        ]} />
      </Section>}

    </WorkShell></>
  );
}
