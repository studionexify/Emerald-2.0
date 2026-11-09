import { Thumb } from "../../ui/media";
import { vOrders } from "../../data";
import { useEffect, useState } from "preact/hooks";
import { Button, Icon, Section, Sheet, Status, Waterfall } from "../../ui";
import { b2bFor } from "../../data/inventory";
import { inr, orderTotal, ordersSig, shortDate, STAGES, type Order, printersSig, jobsSig, today, clientsSig, toBin, log, me, duplicateOrder, STAGE_LABEL, TYPE_LABEL, SIZE_LABEL, B2B_TYPES, shrinkImage, storeMedia, lineProgress, orderProgress, type OrderSize, type Client } from "../../data";
import { OrderDetail, WorkShell , useOpenOrder } from "./shared";
import { Pick } from "../../ui";
import { booksModeSig, canSwitchMode, PAY_LABEL } from "../../data/mode";
import { segmentOf, SEGMENT_LABEL, type Segment } from "../../data/inventory";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";
const PAGE = 25;

/** Pipeline tracker: one segmented strip, each stage a count + share bar. */
function StageStrip({ list }: { list: Order[] }) {
  const live = list.filter((o) => o.stage !== "archived");
  const max = Math.max(1, ...STAGES.map((s) => list.filter((o) => o.stage === s.key).length));
  return (
    <div class="grid grid-cols-4 md:grid-cols-8 rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden divide-x divide-line">
      {STAGES.map((s) => {
        const n = list.filter((o) => o.stage === s.key).length;
        return (
          <a key={s.key} href="/work/orders" class="px-3 py-2 min-w-0 hover:bg-c1/60 border-line max-md:[&:nth-child(n+5)]:border-t">
            <div class="t-meta truncate">{s.label}</div>
            <div class="num text-[17px] font-semibold leading-tight">{n}</div>
            <div class="mt-1.5 h-1 rounded-full bg-c1 overflow-hidden"><div class="h-full bg-c4 rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div>
          </a>
        );
      })}
      <span class="sr-only">{live.length} live orders</span>
    </div>
  );
}

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
const COLS = "@lg:grid-cols-[minmax(130px,1.3fr)_minmax(104px,0.7fr)_minmax(150px,1.6fr)_minmax(100px,0.6fr)_minmax(70px,0.7fr)_80px_28px] @4xl:grid-cols-[minmax(140px,1.3fr)_minmax(110px,0.7fr)_minmax(160px,1.6fr)_minmax(150px,1fr)_minmax(104px,0.6fr)_minmax(80px,0.7fr)_84px_28px]";
const TRACK: [Order["stage"], string][] = [["quotation", "doc"], ["po", "stamp"], ["production", "printer"], ["qc", "shield"], ["packing", "box"], ["invoice", "receipt"], ["shipping", "truck"]];
const STAGE_HUE: Record<string, string> = { quotation: "#8A93A3", po: "#8C8FC4", production: "#6B8DB5", qc: "#C49A5A", packing: "#9A86B8", invoice: "#6FA39C", shipping: "#6E9C7C", archived: "#8A93A3", blocked: "#B97468" };
const KIND_HUE = (k: string) => (k.startsWith("B2B") ? "#6B8DB5" : k === "Bulk" ? "#9A86B8" : k === "In-house" ? "#8A93A3" : "#6FA39C");
const tint = (h: string) => ({ color: h, background: `color-mix(in srgb, ${h} 13%, transparent)` });

function Track({ o }: { o: Order }) {
  const at = TRACK.findIndex(([k]) => k === o.stage);
  const hue = o.blocked ? STAGE_HUE.blocked : STAGE_HUE[o.stage];
  return (
    <div class="flex items-center" aria-label={`Stage ${at + 1} of ${TRACK.length}`}>
      {TRACK.map(([k, ic], i) => (
        <span key={k} class="contents">
          {i > 0 && <span class="h-[2px] flex-1 min-w-1.5" style={{ background: i <= at ? hue : "color-mix(in srgb, var(--c-2) 30%, transparent)" }} />}
          <span title={STAGE_LABEL[k]} class="w-[18px] h-[18px] shrink-0 rounded-full grid place-items-center"
            style={i <= at ? { background: hue, color: "#fff" } : { background: "transparent", color: "color-mix(in srgb, var(--c-2) 70%, transparent)", boxShadow: "inset 0 0 0 1.5px color-mix(in srgb, var(--c-2) 45%, transparent)" }}>
            <Icon name={ic} size={10} />
          </span>
        </span>
      ))}
    </div>
  );
}

function OrderRow({ o, onOpen, onEdit }: { o: Order; onOpen: (o: Order) => void; onEdit: (o: Order) => void }) {
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  const d = left(o.due), kind = kindOf(o, c), st = o.blocked ? "blocked" : o.stage;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(o)} onKeyDown={(e) => e.key === "Enter" && onOpen(o)}
      class={`grid grid-cols-[minmax(0,1fr)_auto] ${COLS} items-center gap-x-4 @6xl:gap-x-6 gap-y-1.5 py-3 px-4 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0`}>
      <div class="min-w-0 text-[14px] font-semibold leading-snug">{o.customer}</div>
      <div class="@max-lg:hidden"><span class="inline-flex px-2 h-6 items-center rounded-md text-[12px] font-semibold whitespace-nowrap" style={tint(KIND_HUE(kind))}>{kind}</span>{canSwitchMode() && booksModeSig.value === "both" && <span class="ml-1.5 inline-flex px-1.5 h-6 items-center rounded-md text-[11px] font-bold" style={tint(o.pay === "beta" ? "#B39567" : "#6B8DB5")}>{o.pay === "beta" ? "β" : "α"}</span>}</div>
      <ul class="min-w-0 @max-lg:col-span-2 @max-lg:row-start-2 text-[13px] leading-[1.5]">
        {o.items.slice(0, 2).map((i, k) => <li key={k} class="flex items-center gap-2 min-w-0"><span class="num font-semibold text-c4 w-10 shrink-0 text-right">{i.qty}×</span><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-7 h-7 !rounded-md" /><span class="min-w-0 text-c3 truncate">{i.name}</span></li>)}
        {o.items.length > 2 && <li class="pl-[84px] t-meta">+{o.items.length - 2} more</li>}
        {(() => { const t = orderProgress(o); return (t.printed > 0 || t.failed > 0 || o.type === "bulk") && <li class="pl-[84px] text-[11px] font-medium whitespace-nowrap"><span class="text-grn">{t.printed} printed</span> · <span class="text-red">{t.failed} wasted</span> · <span class="text-c3">{t.pending} pending</span></li>; })()}
      </ul>
      <div class="@max-4xl:hidden pr-2"><Track o={o} /></div>
      <div class="@max-lg:hidden"><span class="inline-flex items-center gap-1.5 px-2 h-6 rounded-full text-[12px] font-semibold whitespace-nowrap" style={tint(STAGE_HUE[st])}><span class="w-1.5 h-1.5 rounded-full" style={{ background: STAGE_HUE[st] }} />{o.blocked ? "Blocked" : STAGE_LABEL[o.stage]}</span></div>
      <span class="@max-lg:hidden text-[13px] text-c3 truncate">{c?.city || "—"}</span>
      <div class="text-right @lg:text-left @max-lg:col-start-2 @max-lg:row-start-1">
        <div class="text-[13px] font-semibold whitespace-nowrap">{shortDate(o.due)}</div>
        <div class={`text-[11px] whitespace-nowrap font-medium`} style={{ color: d < 0 ? STAGE_HUE.blocked : d <= 2 ? STAGE_HUE.qc : "var(--c-3)" }}>{leftLabel(d)}</div>
      </div>
      <div class="@max-lg:hidden"><RowMenu o={o} c={c} onOpen={onOpen} onEdit={onEdit} /></div>
    </div>
  );
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
  const [n, setN] = useState(PAGE);
  const mine = vOrders().filter((o) => segmentOf(o) === seg);
  const subs = [...new Set(mine.map((o) => kindOf(o)))].sort();
  const list = mine.filter((o) => f === "all" || kindOf(o) === f);
  const live = list.filter((o) => o.stage !== "archived").sort((a, b) => Number(!!b.blocked) - Number(!!a.blocked) || a.due.localeCompare(b.due));
  const fleet = printersSig.value.filter((p) => p.active !== false);
  const busy = fleet.filter((p) => p.status === "printing").length;
  return (
    <>{edit && <EditOrder order={edit} onDone={(o) => { setEdit(null); if (o) setOpen(o); }} />}<WorkShell detail={open && <OrderDetail order={vOrders().find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />} title={`Production · ${SEGMENT_LABEL[seg]}`} sub={SEG_SUB[seg]} toolbar={subs.length > 1 ? <Pick title="Type" value={f} on={setF} items={["all", ...subs]} label={(k) => (k === "all" ? "All types" : k)} /> : undefined}>
      <Section title="Pipeline" note={`${live.length} live`}><StageStrip list={list} /></Section>

      <Section title="Live orders" note={String(live.length)} action={<a href="/work/orders" class="t-meta whitespace-nowrap">Board →</a>}>
          <div class="@container rounded-[var(--radius-card)] bg-c0 border border-line overflow-x-auto">
            <div class={`hidden @lg:grid ${COLS} gap-x-4 @6xl:gap-x-6 px-4 h-10 items-center bg-c1 rounded-t-[var(--radius-card)] border-b border-line text-[11px] font-bold uppercase tracking-[0.06em] text-c3`}><span>Client</span><span>Type</span><span>Items</span><span class="@max-4xl:hidden">Progress</span><span>Stage</span><span>City</span><span>Deadline</span><span /></div>
            {live.slice(0, n).map((o) => <OrderRow key={o.id} o={o} onOpen={(x) => { setEdit(null); setOpen(x); }} onEdit={(x) => setEdit(x)} />)}
            {live.length > n && <button onClick={() => setN(n + PAGE)} class="w-full h-9 border-t border-line text-[13px] font-medium text-c3 hover:bg-c1/60 cursor-pointer">Show {Math.min(PAGE, live.length - n)} more</button>}
          </div>
        </Section>

      <Section title="Machine fleet" note={`${busy}/${fleet.length} busy`} action={<a href="/workshop/printers" class="t-meta">All →</a>}>
        <Waterfall min={260} max={5} gap="gap-3" items={[
          ...fleet.map((p): [number, preact.ComponentChildren] => {
            const j = jobsSig.value.find((x) => x.printer === p.name && x.status === "printing");
            const ord = j && vOrders().find((o) => o.no === j.orderNo);
            const hot = !!j || p.status === "printing";
            return [j ? 3 : 2,
              <a key={p.id} href="/work/production" onClick={(e) => { if (ord) { e.preventDefault(); setOpen(ord); } }}
                class={`rounded-[var(--radius-card)] p-4 min-w-0 block min-h-[148px] transition-colors ${hot ? "bg-c4 text-c0 border-2 border-c4 shadow-lg" : "bg-c0 border border-line hover:bg-c1/40"}`}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0"><div class="text-[16px] font-bold leading-tight">{p.name}</div><div class={`text-[12px] ${hot ? "opacity-70" : "text-c3"}`}>{p.model}</div></div>
                  {hot ? <span class="inline-flex items-center gap-1.5 px-2 h-6 rounded-full bg-c0 text-c4 text-[11px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-[#8FC29E] animate-pulse" />Printing</span>
                    : <Status tone={p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>}
                </div>
                {j ? (
                  <div class="mt-3">
                    <div class="text-[11px] uppercase tracking-[0.06em] opacity-70">For</div>
                    <div class="text-[15px] font-semibold leading-snug">{ord?.customer ?? j.orderNo}</div>
                    <div class="text-[13px] opacity-80">{j.item}</div>
                    <div class="text-[12px] opacity-70 num mt-1">{j.hours} h · {j.grams} g{j.operator ? ` · ${j.operator}` : ""}</div>
                  </div>
                ) : <div class="mt-3 text-[13px] text-c3">{p.status === "down" ? "Out of service" : "Free — nothing printing"}</div>}
              </a>];
          }),
        ]} />
      </Section>

      <Section title="Queue" note={`${jobsSig.value.filter((j) => j.status === "queued").length} queued`} action={<a href="/work/production" class="t-meta">All →</a>}>
        <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
          {jobsSig.value.filter((j) => j.status !== "done").map((j) => { const ord = vOrders().find((o) => o.no === j.orderNo); return (
            <button key={j.id} onClick={() => ord && setOpen(ord)} class="w-full text-left flex items-center gap-3 px-4 py-2.5 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0">
              <span class="min-w-0 flex-1"><span class="block text-[14px] font-semibold truncate">{j.item}</span><span class="block t-meta truncate">{j.orderNo}{ord ? ` · ${ord.customer}` : ""} · {j.printer || "Unassigned"}</span></span>
              <span class="num t-meta whitespace-nowrap">{j.hours} h · {j.grams} g</span>
              <Status tone={jobTone(j.status)}>{j.status}</Status>
            </button>); })}
          {!jobsSig.value.some((j) => j.status !== "done") && <p class="t-meta px-4 py-3">Queue is empty.</p>}
        </div>
      </Section>
    </WorkShell></>
  );
}
