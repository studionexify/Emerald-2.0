import { LinkedTasks } from "../Todo";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { WORK_TABS } from "../../nav";
import { Pick, Button, DetailHead, Fact, Page, Status } from "../../ui";
import { storeMedia, shrinkImage, can, ordersSig, addBatch, BATCH_LABEL, BATCH_STAGES, batchAction, batchesSig, batchTo, checks, consume, duplicateOrder, FLOW_NOTE, inr, moveTo, gateReason, me, itemsSig, nextOf, orderConsumption, orderTotal, packSig, patchOrder, prevOf, satisfy, shortDate, spoolsSig, STAGE_LABEL, STAGE_ORDER, SUGGESTED, TYPE_LABEL, historySig, designSig, photosSig, nowS, uid, type Stage, UNIT, type Batch, type ConKind, type Order, type OrderType } from "../../data";
import { MediaImg } from "../../ui/media";
import { StageStrip } from "../../ui/stage-strip";

export function WorkShell({ title, sub, actions, toolbar, detail, children, stage }: { stage?: Stage; title: string; sub?: string; actions?: ComponentChildren; toolbar?: ComponentChildren; detail?: ComponentChildren | null; children: ComponentChildren }) {
  return <Page title={title} sub={sub} actions={actions} tabs={WORK_TABS} toolbar={toolbar} detail={detail}>{stage && <StageStrip orders={ordersSig.value} showValue={can("mauny")} active={stage} />}{children}</Page>;
}

export type TypeFilter = "all" | OrderType;
export function TypeChips({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  const opts: TypeFilter[] = ["all", "client", "bulk", "inhouse"];
  return (
    <Pick title="Type" value={value} on={onChange} items={opts} label={(o) => (o === "all" ? "All types" : TYPE_LABEL[o as OrderType])} />
  );
}

export const stageLabel = (o: Order) => STAGE_LABEL[o.stage];

export function OrderCard({ o, onOpen }: { o: Order; onOpen: (o: Order) => void; inset?: boolean }) {
  return (
    <button onClick={() => onOpen(o)} class="w-full min-w-0 text-left rounded-2xl bg-c0 border border-line hover:border-c2 px-2.5 py-2 cursor-pointer text-[13px]">
      <div class="flex items-center justify-between gap-2"><span class="font-mono text-[11px] font-bold">{o.no}</span><span class="t-meta">{o.type === "bulk" ? "Bulk" : shortDate(o.due)}</span></div>
      <div class="font-medium truncate mt-0.5">{o.customer}</div>
      <div class="t-meta truncate">{o.items.map((i) => i.name).join(", ")}</div>
      <div class="flex items-center justify-between gap-2 mt-1">
        <span class="num text-[12px]">{o.type === "inhouse" ? "Internal" : inr(orderTotal(o))}</span>
        {o.blocked && <span class="inline-flex items-center gap-1 text-[11px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-warn" />Blocked</span>}
      </div>
    </button>
  );
}

/** Inline order detail (no overlay; forward moves honour the stage gate). Render via the page's `detail` prop. */
export function OrderDetail({ order, onClose, onOpen }: { order: Order; onClose: () => void; onOpen: (o: Order) => void }) {
  const [msg, setMsg] = useState("");
  const next = nextOf(order), prev = prevOf(order);
  const sug = SUGGESTED[order.type];
  const mine = batchesSig.value.filter((b) => b.orderNo === order.no);
  const cons = orderConsumption(order.no);
  const used = cons.reduce((s, c) => s + c.cost, 0);
  const total = orderTotal(order);
  /** Re-slice rule: moving back needs a reason; every move lands in stage history. */
  /** Forward moves pass the stage gate; an owner/manager may override with a reason, which is logged. */
  const gate = gateReason(order, batchesSig.value);
  const go = (to: Stage) => {
    if (to === order.stage) return;
    const back = STAGE_ORDER.indexOf(to) < STAGE_ORDER.indexOf(order.stage);
    let reason = "";
    if (back) { reason = prompt(`Reason for sending ${order.no} back to ${STAGE_LABEL[to]}?`) ?? ""; if (!reason.trim()) return; }
    const passing = STAGE_ORDER.slice(STAGE_ORDER.indexOf(order.stage), STAGE_ORDER.indexOf(to)).filter((s) => s === order.stage || SUGGESTED[order.type].includes(s));
    const block = back ? null : passing.map((s) => gateReason({ ...order, stage: s }, batchesSig.value)).find(Boolean) ?? null;
    if (block) {
      if (!can("work") || !["owner", "manager"].includes(me.value?.role ?? "")) { setMsg(block); return; }
      reason = prompt(`${block}\n\nOverride and move anyway? Give a reason:`) ?? ""; if (!reason.trim()) { setMsg(block); return; }
      reason = `override: ${reason}`;
    }
    onOpen(moveTo(order, to, reason));
  };
  const hist = historySig.value.filter((h) => h.orderNo === order.no);
  const photos = photosSig.value.filter((p) => p.ref === order.no);
  const lowAcc = itemsSig.value.filter((a) => a.cat === "Accessory" && a.qty <= a.reorderAt);
  return (
    <div>
      <DetailHead title={`${order.no} · ${order.customer}`} onClose={() => { setMsg(""); onClose(); }} />
      <div class="text-xs text-c3 mb-2">{TYPE_LABEL[order.type]} · via {order.medium} · {FLOW_NOTE[order.type]}</div>
      <div class="text-[11px] text-c3 mb-1">Stage — tap any to move (outlined = usual path)</div>
      <ol class="flex flex-wrap gap-1 mb-2" aria-label="Stages">
        {STAGE_ORDER.map((s) => (
          <li key={s}><button onClick={() => go(s)} aria-pressed={order.stage === s}
            class={`text-[11px] px-2 h-6 inline-flex items-center rounded-full cursor-pointer ${order.stage === s ? "bg-c4 text-c0 font-semibold" : sug.includes(s) ? "bg-c0 border border-c3" : "bg-c1 text-c3"}`}>{STAGE_LABEL[s]}</button></li>
        ))}
      </ol>
      <div class="flex flex-wrap gap-2 mb-3">
        {prev && <Button variant="outline" onClick={() => go(prev)}>← {STAGE_LABEL[prev]}</Button>}
        {next && <Button onClick={() => go(next)}>{STAGE_LABEL[next]} →</Button>}
        <Button variant="outline" icon="copy" onClick={() => { const c = duplicateOrder(order); setMsg(`Created ${c.no}`); onOpen(c); }}>Duplicate</Button>
      </div>
      {gate && order.stage !== "archived" && <p class="text-xs mb-2 rounded-xl bg-c1 p-2" role="note"><b>Blocked:</b> {gate}</p>}
      {msg && <p class="text-sm mb-2 font-medium" role="status">{msg}</p>}
      <LinkedTasks kind={order.stage === "quotation" ? "Quotation" : "Order"} refNo={order.no} />

      {order.stage === "production" && lowAcc.length > 0 && <div class="rounded-xl bg-c1 p-2 text-xs mb-3"><b>Stock check (advisory):</b> {lowAcc.map((a) => a.name).join(", ")} at or below reorder.</div>}
      <h3 class="font-semibold text-sm mb-1.5">Recorded</h3>
      <ul class="grid grid-cols-2 gap-x-3 gap-y-1 mb-3 text-xs">
        {checks(order, batchesSig.value).map((c) => (
          <li key={c.label} class="flex items-center justify-between gap-1">
            <Status tone={c.done ? "done" : "idle"}>{c.label}</Status>
            {!c.done && <button class="underline cursor-pointer" onClick={() => onOpen(satisfy(order, c.field))}>{c.action}</button>}
          </li>
        ))}
      </ul>

      <h3 class="font-semibold text-sm mb-1.5 flex justify-between">Consumption <span class="num font-normal text-c3">{inr(used)} used{total ? ` · margin ${Math.round((1 - used / total) * 100)}%` : ""}</span></h3>
      <ConsumeForm orderNo={order.no} batches={mine.map((b) => b.name)} />
      <ul class="flex flex-col mt-2 mb-3 text-xs">
        {cons.map((c) => (
          <li key={c.id} class="flex justify-between gap-2 py-1 border-t border-line">
            <span class="min-w-0"><b class="capitalize">{c.kind}</b> · {c.item}{c.batch ? ` · ${c.batch}` : ""}<span class="block text-c3">{c.at} · {c.who}</span></span>
            <span class="num whitespace-nowrap text-right">{c.qty} {c.unit}<span class="block text-c3">{inr(c.cost)}</span></span>
          </li>
        ))}
        {!cons.length && <li class="text-c3">Nothing logged yet.</li>}
      </ul>

      <h3 class="font-semibold text-sm mb-1.5 flex justify-between items-center">Batches <button class="text-xs underline cursor-pointer" onClick={() => { addBatch(order); onOpen({ ...order }); }}>+ Add batch</button></h3>
      <ul class="flex flex-col gap-2 mb-3">{mine.map((b) => <BatchRow key={b.id} b={b} after={() => onOpen({ ...order })} />)}{!mine.length && <li class="text-xs text-c3">No batches — any order can be split.</li>}</ul>

      <div class="grid grid-cols-2 gap-3 my-3 text-sm">
        <Fact label="Created" value={shortDate(order.created)} />
        <Fact label="Due" value={shortDate(order.due)} />
        <Fact label="Value" value={total ? inr(total) : "Internal"} />
        <Fact label="Payment" value={order.paid ? "Paid" : "On delivery"} />
        <Fact label="PO" value={order.po ?? "—"} />
        <Fact label="Invoice" value={order.invoiced ? "Raised" : "—"} />
      </div>
      <h3 class="font-semibold text-sm mb-2">Line items</h3>
      <ul class="flex flex-col gap-2 mb-3">
        {order.items.map((i, k) => (
          <li key={k} class="bg-c1 rounded-xl p-2.5 text-sm flex justify-between gap-3">
            <span class="min-w-0"><span class="font-medium block">{i.name}</span><span class="text-c3 text-xs">{i.material} · {i.colour} · ×{i.qty}</span></span>
            <span class="num text-right">{i.price ? inr(i.price * i.qty) : "—"}<span class="block text-c3 text-xs">est. cost {inr(i.cost * i.qty)}</span></span>
          </li>
        ))}
      </ul>
      <h3 class="font-semibold text-sm mb-1.5">Design record per line</h3>
      <div class="flex flex-col gap-2 mb-3">
        {order.items.map((i, k) => { const key = `${order.no}#${k}`; const d = designSig.value[key] ?? { file: "", profile: "", grams: 0, minutes: 0, bom: "", measuredBy: "", source: "slicer" as const };
          const set = (p: Partial<typeof d>) => (designSig.value = { ...designSig.value, [key]: { ...d, ...p, measuredBy: "you" } });
          const c = "h-8 px-2 rounded-lg border border-c3 bg-c0 text-xs min-w-0";
          return (
            <div key={k} class="bg-c1 rounded-xl p-2 text-xs">
              <div class="font-medium mb-1">{i.name}</div>
              <div class="grid grid-cols-2 gap-1">
                <input class={c} placeholder="Print file name" value={d.file} onInput={(e) => set({ file: (e.target as HTMLInputElement).value })} />
                <input class={c} placeholder="Slice profile" value={d.profile} onInput={(e) => set({ profile: (e.target as HTMLInputElement).value })} />
                <input class={c} type="number" placeholder="Sliced g" value={d.grams || ""} onInput={(e) => set({ grams: Number((e.target as HTMLInputElement).value) || 0 })} />
                <input class={c} type="number" placeholder="Sliced min" value={d.minutes || ""} onInput={(e) => set({ minutes: Number((e.target as HTMLInputElement).value) || 0 })} />
                <input class={`${c} col-span-2`} placeholder="BOM: magnets ×2, insert ×4…" value={d.bom} onInput={(e) => set({ bom: (e.target as HTMLInputElement).value })} />
              </div>
              {d.grams > 0 && <div class="text-c3 mt-1">Sliced vs logged filament: {d.grams * i.qty} g vs {cons.filter((x) => x.kind === "filament").reduce((s, x) => s + x.qty, 0)} g</div>}
            </div>
          ); })}
      </div>

      <h3 class="font-semibold text-sm mb-1.5 flex justify-between items-center">Photos <label class="text-xs underline cursor-pointer">+ Add (QC / packing)<input type="file" accept="image/*" capture="environment" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; shrinkImage(f).then((data) => { photosSig.value = [...photosSig.value, { id: uid(), ref: order.no, stage: STAGE_LABEL[order.stage], name: f.name, data: storeMedia(data, order.no + " " + f.name), at: nowS() }]; onOpen({ ...order }); }); }} /></label></h3>
      <div class="grid grid-cols-4 gap-2 mb-3">{photos.map((p) => <figure key={p.id} class="text-[10px] text-c3"><MediaImg v={p.data} alt={p.name} class="w-full aspect-square object-cover rounded-lg bg-c1" /><figcaption>{p.stage}</figcaption></figure>)}{!photos.length && <p class="col-span-4 text-xs text-c3">None yet.</p>}</div>

      <h3 class="font-semibold text-sm mb-1.5">Stage history</h3>
      <ul class="text-xs mb-3">{hist.map((h) => <li key={h.id} class="py-1 border-t border-line">{h.at} · {h.by}: {STAGE_LABEL[h.from]} → {STAGE_LABEL[h.to]}{h.reason ? ` — “${h.reason}”` : ""}</li>)}{!hist.length && <li class="text-c3">No moves yet.</li>}</ul>
      <label class="flex items-center gap-2 text-xs"><input type="checkbox" checked={!!order.paid} onChange={() => onOpen(patchOrder(order, { paid: !order.paid }))} /> Payment received</label>
    </div>
  );
}

const KINDS: ConKind[] = ["filament", "machine", "power", "labour", "packing", "accessory", "part", "freight", "scrap"];
export function ConsumeForm({ orderNo, batches = [] }: { orderNo?: string; batches?: string[] }) {
  const [k, setK] = useState<ConKind>("filament");
  const [item, setItem] = useState("");
  const [qty, setQty] = useState(0);
  const [batch, setBatch] = useState("");
  const opts = k === "filament" || k === "scrap" ? spoolsSig.value.map((s) => `${s.material} ${s.colour} · ${s.spoolNo}`)
    : k === "packing" ? packSig.value.map((p) => p.name) : k === "machine" || k === "power" ? ["P1S-01", "A1-01", "A1-02"] : [];
  const sm = "h-8 px-2 rounded-lg border border-c3 bg-c0 text-xs min-w-0";
  return (
    <form class="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!qty) return; consume({ kind: k, item: item || opts[0] || k, qty, orderNo, batch: batch || undefined, printer: k === "machine" || k === "power" ? item || opts[0] : undefined }); setQty(0); }}>
      <select class={sm} value={k} onChange={(e) => { setK((e.target as HTMLSelectElement).value as ConKind); setItem(""); }}>{KINDS.map((x) => <option key={x}>{x}</option>)}</select>
      {opts.length ? <select class={`${sm} flex-1`} value={item || opts[0]} onChange={(e) => setItem((e.target as HTMLSelectElement).value)}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
        : <input class={`${sm} flex-1`} placeholder="What" value={item} onInput={(e) => setItem((e.target as HTMLInputElement).value)} />}
      <input class={`${sm} w-16`} type="number" placeholder={UNIT[k]} value={qty || ""} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value) || 0)} aria-label={`Quantity (${UNIT[k]})`} />
      {batches.length > 0 && <select class={sm} value={batch} onChange={(e) => setBatch((e.target as HTMLSelectElement).value)}><option value="">Whole order</option>{batches.map((b) => <option key={b}>{b}</option>)}</select>}
      <button class="h-8 px-3 rounded-lg bg-c4 text-c0 text-xs font-medium cursor-pointer">Log</button>
    </form>
  );
}

export function BatchRow({ b, after }: { b: Batch; after?: () => void }) {
  const act = (w: "print" | "invoice" | "tracking") => { batchAction(b, w); after?.(); };
  return (
    <li class="bg-c1 rounded-xl p-2.5 text-sm">
      <div class="flex justify-between items-center gap-2">
        <span class="font-medium">{b.name}</span>
        <select class="h-7 px-2 rounded-full bg-c0 text-xs" value={b.stage} aria-label="Batch stage" onChange={(e) => { batchTo(b, (e.target as HTMLSelectElement).value as Batch["stage"]); after?.(); }}>
          {BATCH_STAGES.map((s) => <option key={s} value={s}>{BATCH_LABEL[s]}</option>)}
        </select>
      </div>
      <div class="text-xs text-c3">{b.done}/{b.units} units{b.invoiceNo ? ` · ${b.invoiceNo}` : ""}{b.tracking ? ` · ${b.tracking}` : ""}</div>
      <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
        <button class="underline cursor-pointer" onClick={() => act("print")}>Mark printed</button>
        <button class="underline cursor-pointer" onClick={() => act("invoice")}>{b.invoiceNo ? "Re-invoice" : "Raise invoice"}</button>
        <button class="underline cursor-pointer" onClick={() => act("tracking")}>{b.tracking ? "Update tracking" : "Add tracking"}</button>
      </div>
    </li>
  );
}
