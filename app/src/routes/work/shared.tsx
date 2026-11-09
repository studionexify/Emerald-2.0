import { canSwitchMode, PAY_LABEL } from "../../data/mode";
import { itemLabel, ordersSig, log, clientsSig, invoicesSig, quotesSig, shipmentsSig, openOrderSig, returnSig } from "../../data";
import { navigate, path } from "../../router";
import { segmentOf, type Segment } from "../../data/inventory";
import { STAGE_HREF } from "../../ui/stage-strip";
import { vOrders } from "../../data";
import { LinkedTasks } from "../Todo";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { WORK_TABS } from "../../nav";
import { Pick, Button, DetailHead, Fold, Icon, Page, Status } from "../../ui";
import { startRun, finishRun, runSpools, printersSig, lineProgress, orderProgress, storeMedia, shrinkImage, can, addBatch, BATCH_LABEL, BATCH_STAGES, batchAction, batchesSig, batchTo, checks, consume, duplicateOrder, inr, moveTo, gateReason, me, itemsSig, nextOf, orderConsumption, orderTotal, packSig, patchOrder, prevOf, satisfy, shortDate, spoolsSig, STAGE_LABEL, STAGE_ORDER, SUGGESTED, TYPE_LABEL, historySig, designSig, photosSig, nowS, uid, type Stage, UNIT, type Batch, type ConKind, type Order, type OrderType } from "../../data";
import { Thumb } from "../../ui/media";
import { StageStrip } from "../../ui/stage-strip";

/** Order panel state for a list page: reopens the order you came back to (and its scroll). */
export function useOpenOrder() {
  return useState<Order | null>(() => {
    let no = openOrderSig.value; openOrderSig.value = null; const r = returnSig.value;
    if (!no && r && r.path === path.value) { no = r.no; returnSig.value = null; const y = r.scroll; setTimeout(() => { const m = document.querySelector("[data-split-main]"); if (m) m.scrollTop = y; }, 60); }
    return no ? vOrders().find((o) => o.no === no) ?? null : null;
  });
}
const goStage = (o: Order, st: Stage) => { returnSig.value = { path: path.value, no: o.no, scroll: document.querySelector("[data-split-main]")?.scrollTop ?? 0 }; openOrderSig.value = o.no; navigate(STAGE_HREF[st]); };
export function WorkShell({ title, sub, actions, toolbar, detail, children, stage }: { stage?: Stage; title: string; sub?: string; actions?: ComponentChildren; toolbar?: ComponentChildren; detail?: ComponentChildren | null; children: ComponentChildren }) {
  const r = returnSig.value; const back = r && r.path !== path.value ? r : null;
  return <Page title={title} sub={sub} actions={<>{back && <Button variant="outline" icon="left" onClick={() => navigate(back.path)}>Back to {back.no}</Button>}{actions}</>} tabs={WORK_TABS} toolbar={toolbar} detail={detail}>{stage && <StageStrip orders={vOrders()} showValue={can("mauny")} active={stage} />}{children}</Page>;
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
      <div class="flex items-center gap-2 mt-1"><Thumb thumb={o.items[0]?.thumb} full={o.items[0]?.img} alt={o.items[0]?.name ?? ""} class="w-9 h-9" /><div class="min-w-0"><div class="font-medium truncate">{o.customer}</div>
      <div class="t-meta truncate">{o.items[0]?.name}{o.items.length > 1 ? ` +${o.items.length - 1} more` : ""}</div></div></div>
      <div class="flex items-center justify-between gap-2 mt-1">
        <span class="num text-[12px]">{o.type === "inhouse" ? "Internal" : inr(orderTotal(o))}</span>
        {o.blocked && <span class="inline-flex items-center gap-1 text-[11px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-warn" />Blocked</span>}
      </div>
    </button>
  );
}

/** Inline order detail (no overlay; forward moves honour the stage gate). Render via the page's `detail` prop. */
/** `onStage` keeps stage clicks inside the calling tab instead of opening the shared stage page. */
export function OrderDetail({ order, onClose, onOpen, onStage }: { order: Order; onClose: () => void; onOpen: (o: Order) => void; onStage?: (st: Stage) => void }) {
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
      if (!can("work") || !["owner", "partner", "manager"].includes(me.value?.role ?? "")) { setMsg(block); return; }
      reason = prompt(`${block}\n\nOverride and move anyway? Give a reason:`) ?? ""; if (!reason.trim()) { setMsg(block); return; }
      reason = `override: ${reason}`;
    }
    onOpen(moveTo(order, to, reason));
  };
  const hist = historySig.value.filter((h) => h.orderNo === order.no);
  const photos = photosSig.value.filter((p) => p.ref === order.no);
  const lowAcc = itemsSig.value.filter((a) => a.cat === "Accessory" && a.qty <= a.reorderAt);
  const ck = checks(order, batchesSig.value); const ckDone = ck.filter((c) => c.done).length;
  const sel = "h-9 !min-h-0 rounded-lg border border-line bg-c0 px-2 text-[13px] font-semibold min-w-0 cursor-pointer";
  const H = { client: "#4a7bd0", order: "#8a5cc2", prod: "#2e9a4b", docs: "#1f9a9a", internal: "#7a8594" };
  const filG = cons.filter((x) => x.kind === "filament").reduce((s, x) => s + x.qty, 0);
  const cl = clientsSig.value.find((c) => c.name.toLowerCase() === order.customer.toLowerCase());
  const qs = quotesSig.value.filter((q) => q.orderNo === order.no), invs = invoicesSig.value.filter((i) => i.orderNo === order.no), ships = shipmentsSig.value.filter((x) => x.orderNo === order.no);
  const docN = qs.length + invs.length + ships.length + photos.length + (order.po ? 1 : 0);
  const cur = STAGE_ORDER.indexOf(order.stage);
  const F = (id: string) => `${order.no}:${id}`;
  const seg = segmentOf(order);
  const Row = ({ k, v }: { k: string; v?: ComponentChildren }) => <div class="flex justify-between gap-3 py-1 border-t border-line first:border-0 text-[13px]"><span class="text-c3 shrink-0">{k}</span><span class="text-right min-w-0 break-words">{v || "—"}</span></div>;
  const Doc = ({ label, sub, href }: { label: string; sub?: string; href: string }) => <button class="w-full flex items-center justify-between gap-2 py-1.5 border-t border-line first:border-0 text-left text-[13px] cursor-pointer !min-h-0" onClick={() => { returnSig.value = { path: path.value, no: order.no, scroll: document.querySelector("[data-split-main]")?.scrollTop ?? 0 }; navigate(href); }}><span class="min-w-0"><b>{label}</b>{sub && <span class="t-meta"> · {sub}</span>}</span><Icon name="right" size={12} /></button>;
  return (
    <div>
      <DetailHead title={<>{order.no} <span class="text-c3 font-medium">· {order.customer}</span></>} onClose={() => { setMsg(""); onClose(); }} />
      <div class="t-meta -mt-2 mb-2">Due {shortDate(order.due)}{seg !== "inhouse" && total ? ` · ${inr(total)}` : ""}</div>
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full bg-c1 text-[12px] font-semibold whitespace-nowrap"><span class="w-1.5 h-1.5 rounded-full" style={{ background: H.prod }} />{STAGE_LABEL[order.stage]}</span>
        {next && <Button onClick={() => go(next)}>Move to {STAGE_LABEL[next]} →</Button>}
      </div>
      {gate && order.stage !== "archived" && <p class="text-[11px] mb-2 text-c3" role="note">⚠ {gate}</p>}
      {msg && <p class="text-sm mb-2 font-medium" role="status">{msg}</p>}

      {seg !== "inhouse" && <Fold id={F("client")} hue={H.client} title="Client" meta={cl?.city || order.medium}>
        <Row k="Name" v={order.customer} />
        <Row k="Phone" v={cl?.phone && <a class="underline" href={`tel:${cl.phone}`}>{cl.phone}</a>} />
        <Row k="Email" v={cl?.email && <a class="underline" href={`mailto:${cl.email}`}>{cl.email}</a>} />
        <Row k="Delivery address" v={cl?.address} />
        <Row k="City" v={cl?.city} />
        <Row k="GSTIN" v={cl?.gstin} />
        <Row k="Came via" v={order.medium} />
        {!onStage && <button class="text-xs underline mt-1.5 cursor-pointer" onClick={() => { returnSig.value = { path: path.value, no: order.no, scroll: 0 }; navigate("/work/clients"); }}>{cl ? "Edit client" : "Add to clients"} →</button>}
        {seg === "client" && <Row k="Payment" v={order.paid ? "Paid" : `Unpaid · ${inr(total)} due`} />}
      </Fold>}

      <Fold id={F("order")} hue={H.order} open title={`${seg === "inhouse" ? "Build" : "Items"} · ${order.items.length}`} meta={total ? inr(total) : "Internal"}>
        {(() => { const t = orderProgress(order); if (!(t.printed || t.failed || seg === "bulk")) return null;
          return <div class="mb-1">
            <div class="flex h-1.5 rounded-full bg-c1 overflow-hidden"><span class="bg-grn" style={{ width: `${t.qty ? Math.min(100, t.printed / t.qty * 100) : 0}%` }} /><span class="bg-red" style={{ width: `${t.qty ? Math.min(100, t.failed / t.qty * 100) : 0}%` }} /></div>
            <div class="text-[11px] font-medium mt-1"><span class="text-grn">{t.printed}</span><span class="text-c3">/{t.qty} printed</span> · <span class="text-red">{t.failed} wasted</span> · <span class="text-c3">{t.pending} pending</span></div>
          </div>; })()}
        <ul class="flex flex-col">{order.items.map((i, k) => <LineRow key={k} order={order} i={i} k={k} onOpen={onOpen} filG={filG} seg={seg} />)}</ul>
        {seg !== "inhouse" && <div class="flex justify-between text-[13px] pt-2 mt-1 border-t border-line"><span class="text-c3">Total</span><b class="num">{inr(total)}</b></div>}
      </Fold>

      <Fold id={F("prod")} hue={H.prod} title="Stages & checklist" meta={`${STAGE_LABEL[order.stage]} · ${ckDone}/${ck.length}`}>
        <ol class="flex flex-col mb-2" aria-label="Pipeline">
          {STAGE_ORDER.filter((st) => seg !== "inhouse" || sug.includes(st) || st === order.stage).map((st, i) => { const at = STAGE_ORDER.indexOf(st), done = at < cur, now = at === cur, off = !sug.includes(st);
            return <li key={st}><button onClick={() => (onStage ? onStage(st) : goStage(order, st))} class={`w-full flex items-center gap-2.5 h-9 !min-h-0 px-1 rounded-lg text-left cursor-pointer hover:bg-c1 ${off && !now ? "opacity-45" : ""}`} title={`Open ${STAGE_LABEL[st]} page`}>
              <span class="w-5 h-5 rounded-full grid place-items-center shrink-0 text-[10px] font-bold" style={now ? { background: H.prod, color: "#fff" } : done ? { background: `color-mix(in srgb, ${H.prod} 25%, var(--c0))`, color: H.prod } : { boxShadow: "inset 0 0 0 1.5px var(--line)" }}>{done ? "✓" : i + 1}</span>
              <span class={`flex-1 text-[13px] ${now ? "font-bold" : ""}`}>{STAGE_LABEL[st]}</span>
              {now && <span class="text-[11px] font-semibold" style={{ color: H.prod }}>Current</span>}
              <Icon name="right" size={12} />
            </button></li>; })}
        </ol>
        {prev && <Button variant="outline" onClick={() => go(prev)}>← Back to {STAGE_LABEL[prev]}</Button>}
        <label class="flex items-center gap-2 text-[12px] mb-2"><span class="text-c3">Jump to</span><select class={`${sel} flex-1`} value={order.stage} onChange={(e) => go((e.target as HTMLSelectElement).value as Stage)}>{STAGE_ORDER.map((st) => <option key={st} value={st}>{STAGE_LABEL[st]}{sug.includes(st) ? "" : " (off path)"}</option>)}</select></label>
        <details class="text-xs"><summary class="cursor-pointer font-semibold py-1">Checklist · {ckDone}/{ck.length}</summary>
          <ul class="flex flex-col">{ck.map((c) => <li key={c.label} class="flex items-center justify-between gap-2 py-1 border-t border-line first:border-0"><Status tone={c.done ? "done" : "idle"}>{c.label}</Status>{!c.done && <button class="underline cursor-pointer" onClick={() => onOpen(satisfy(order, c.field))}>{c.action}</button>}</li>)}</ul>
        </details>
        <details class="text-xs"><summary class="cursor-pointer font-semibold py-1">Batches · {mine.length}</summary>
          <ul class="flex flex-col gap-2 py-1">{mine.map((b) => <BatchRow key={b.id} b={b} after={() => onOpen({ ...order })} />)}{!mine.length && <li class="text-c3">No batches — any order can be split.</li>}</ul>
          <button class="underline cursor-pointer" onClick={() => { addBatch(order); onOpen({ ...order }); }}>+ Add batch</button>
        </details>
        {order.stage === "production" && lowAcc.length > 0 && <p class="text-xs mt-1 rounded-lg bg-c1 p-2"><b>Low stock:</b> {lowAcc.map((a) => a.name).join(", ")}</p>}
      </Fold>

      <Fold id={F("docs")} hue={H.docs} title="Documents & photos" meta={String(docN)} action={<label class="text-xs underline cursor-pointer">+ Photo<input type="file" accept="image/*" capture="environment" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; shrinkImage(f).then((data) => { photosSig.value = [...photosSig.value, { id: uid(), ref: order.no, stage: STAGE_LABEL[order.stage], name: f.name, data: storeMedia(data, order.no + " " + f.name), at: nowS() }]; onOpen({ ...order }); }); }} /></label>}>
        {qs.map((q) => <Doc key={q.id} label={`Quotation ${q.no}`} sub={`${shortDate(q.date)} · ${q.outcome}`} href="/work/quotes" />)}
        {order.po && <Doc label={`Purchase order ${order.po}`} href="/work/orders" />}
        {invs.map((i) => <Doc key={i.id} label={`${i.kind === "credit" ? "Credit note" : "Invoice"} ${i.no}`} sub={`${shortDate(i.date)}${i.paidOn ? " · paid" : ""}${i.status === "cancelled" ? " · cancelled" : ""}`} href="/work/invoice" />)}
        {ships.map((x) => <Doc key={x.id} label={`Shipment · ${x.courier}`} sub={x.tracking || shortDate(x.date)} href="/work/shipping" />)}
        {!qs.length && !invs.length && !ships.length && !order.po && <p class="text-xs text-c3 mb-1">No documents yet.</p>}
        <div class="grid grid-cols-4 gap-2 mt-2">{photos.map((p) => <figure key={p.id} class="text-[10px] text-c3"><Thumb full={p.data} alt={p.name} class="w-full aspect-square" /><figcaption class="truncate">{p.stage}</figcaption></figure>)}
          {Array.from({ length: Math.max(0, 4 - photos.length) }, (_, k) => <figure key={`ph${k}`} class="text-[10px] text-c3"><Thumb alt="Photo" class="w-full aspect-square" onAdd={(f) => shrinkImage(f).then((data) => { photosSig.value = [...photosSig.value, { id: uid(), ref: order.no, stage: STAGE_LABEL[order.stage], name: f.name, data: storeMedia(data, order.no + " " + f.name), at: nowS() }]; onOpen({ ...order }); })} /><figcaption>{["QC", "Packing", "Shipping", "Other"][photos.length + k] ?? "Photo"}</figcaption></figure>)}</div>
      </Fold>

      <Fold id={F("internal")} hue={H.internal} title="Internal" meta={total ? `${inr(used)} used · ${Math.round((1 - used / total) * 100)}% margin` : `${inr(used)} used`}>
        {canSwitchMode() && order.type !== "inhouse" && <label class="flex items-center gap-2 text-[12px] mb-2"><span class="text-c3 w-24">Payment mode</span>
          <select class={`${sel} flex-1`} value={order.pay ?? "alpha"} onChange={(e) => { const m = (e.target as HTMLSelectElement).value as "alpha" | "beta"; ordersSig.value = ordersSig.value.map((x) => (x.id === order.id ? { ...x, pay: m } : x)); log("Payment mode", `${order.no} → ${PAY_LABEL[m]}`); onOpen({ ...order, pay: m }); }}>
            {(["alpha", "beta"] as const).map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}</select></label>}
        <label class="flex items-center gap-2 text-xs mb-2"><input type="checkbox" checked={!!order.paid} onChange={() => onOpen(patchOrder(order, { paid: !order.paid }))} /> Payment received</label>
        <details class="text-xs"><summary class="cursor-pointer font-semibold py-1">Consumption · {inr(used)} · {cons.length}</summary>
          <ConsumeForm orderNo={order.no} batches={mine.map((b) => b.name)} />
          <ul class="flex flex-col mt-2">{cons.map((c) => <li key={c.id} class="flex justify-between gap-2 py-1 border-t border-line"><span class="min-w-0"><b class="capitalize">{c.kind}</b> · {itemLabel(c.item)}{c.batch ? ` · ${c.batch}` : ""}<span class="block text-c3">{c.at} · {c.who}</span></span><span class="num whitespace-nowrap text-right">{c.qty} {c.unit}<span class="block text-c3">{inr(c.cost)}</span></span></li>)}{!cons.length && <li class="text-c3">Nothing logged yet.</li>}</ul>
        </details>
        <details class="text-xs"><summary class="cursor-pointer font-semibold py-1">Tasks</summary><LinkedTasks kind={order.stage === "quotation" ? "Quotation" : "Order"} refNo={order.no} /></details>
        <details class="text-xs"><summary class="cursor-pointer font-semibold py-1">Stage history · {hist.length}</summary>
          <ul>{hist.map((h) => <li key={h.id} class="py-1 border-t border-line">{h.at} · {h.by}: {STAGE_LABEL[h.from]} → {STAGE_LABEL[h.to]}{h.reason ? ` — “${h.reason}”` : ""}</li>)}{!hist.length && <li class="text-c3">No moves yet.</li>}</ul>
        </details>
        <div class="flex justify-between items-center text-xs mt-2 pt-2 border-t border-line"><span class="text-c3">Created {shortDate(order.created)}</span>
          <button class="underline cursor-pointer" onClick={() => { const c = duplicateOrder(order); setMsg(`Created ${c.no}`); onOpen(c); }}>Duplicate order</button></div>
      </Fold>
    </div>
  );
}

/** One order line: basic row; tap to reveal image upload and the design record. */
function LineRow({ order, i, k, onOpen, filG, seg }: { order: Order; i: Order["items"][number]; k: number; onOpen: (o: Order) => void; filG: number; seg: Segment }) {
  const [open, setOpen] = useState(false); const [drag, setDrag] = useState(false);
  const key = `${order.no}#${k}`; const d = designSig.value[key] ?? { file: "", profile: "", grams: 0, minutes: 0, bom: "", measuredBy: "", source: "slicer" as const };
  const set = (p: Partial<typeof d>) => (designSig.value = { ...designSig.value, [key]: { ...d, ...p, measuredBy: "you" } });
  const putItem = (p: Partial<typeof i>) => onOpen(patchOrder(order, { items: order.items.map((x, j) => (j === k ? { ...x, ...p } : x)) }));
  const attach = async (f?: File | null) => { if (!f || !f.type.startsWith("image/")) return;
    const [full, thumb] = await Promise.all([shrinkImage(f, 1024, 0.6), shrinkImage(f, 160, 0.6)]);
    putItem({ img: storeMedia(full, `${order.no} ${i.name}`), thumb }); };
  const c = "h-8 px-2 rounded-lg border border-line bg-c0 text-xs min-w-0";
  return <li class="border-t border-line first:border-0">
    <div class="flex items-center gap-2.5 py-2">
      <Thumb thumb={i.thumb} full={i.img} alt={i.name} onAdd={attach} />
      <button class="flex-1 min-w-0 text-left cursor-pointer !min-h-0" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span class="font-medium text-sm block truncate">{i.name}</span>
        <span class="t-meta">×{i.qty}{seg !== "bulk" ? ` · ${[i.material, i.colour].filter(Boolean).join(" ")}` : ""}</span>
        {(() => { const p = lineProgress(order, i); if (!(p.printed || p.failed || seg === "bulk")) return null;
          const pct = i.qty ? Math.min(100, (p.printed / i.qty) * 100) : 0, wp = i.qty ? Math.min(100 - pct, (p.failed / i.qty) * 100) : 0;
          return <>
            <span class="flex h-1.5 rounded-full bg-c1 overflow-hidden mt-1 mb-0.5" aria-hidden="true"><span class="bg-grn" style={{ width: `${pct}%` }} /><span class="bg-red" style={{ width: `${wp}%` }} /></span>
            <span class="block text-[11px] font-medium"><span class="text-grn">{p.printed} done</span> · <span class="text-red">{p.failed} failed</span> · <span class="text-c3">{p.pending} left</span>{p.printing > 0 && <b class="text-c4"> · {p.printing} printing</b>}</span>
          </>; })()}
      </button>
      {seg === "client" && <span class="num text-sm text-right whitespace-nowrap">{i.price ? inr(i.price * i.qty) : "—"}</span>}
      <button class="w-7 h-7 !min-h-0 grid place-items-center rounded-lg text-c3 cursor-pointer" style={{ transform: open ? "rotate(90deg)" : undefined }} onClick={() => setOpen(!open)} aria-label="More"><Icon name="right" size={12} /></button>
    </div>
    {open && <div class="pb-3 flex flex-col gap-2 text-xs pop-in">
      {seg === "bulk" && <PrintRuns order={order} item={i} onOpen={onOpen} />}
      {seg === "bulk" ? <details><summary class="cursor-pointer t-meta py-1">Product image</summary>
      <label class={`flex items-center gap-2 rounded-lg border border-dashed p-2 cursor-pointer ${drag ? "border-c4 bg-c1" : "border-line"}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); attach(e.dataTransfer?.files?.[0]); }}
        onPaste={(e) => attach([...(e.clipboardData?.files ?? [])][0])} tabIndex={0}>
        <Icon name="image" size={16} /><span class="flex-1">{i.img ? "Replace product image" : "Add product image"} — drop, paste or pick</span>
        {i.img && <button class="underline text-red" onClick={(e) => { e.preventDefault(); putItem({ img: undefined, thumb: undefined }); }}>Remove</button>}
        <input type="file" accept="image/*" class="sr-only" onChange={(e) => attach((e.target as HTMLInputElement).files?.[0])} />
      </label>
      </details> : <>
      <label class={`flex items-center gap-2 rounded-lg border border-dashed p-2 cursor-pointer ${drag ? "border-c4 bg-c1" : "border-line"}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); attach(e.dataTransfer?.files?.[0]); }}
        onPaste={(e) => attach([...(e.clipboardData?.files ?? [])][0])} tabIndex={0}>
        <Icon name="image" size={16} /><span class="flex-1">{i.img ? "Replace product image" : "Add product image"} — drop, paste or pick</span>
        {i.img && <button class="underline text-red" onClick={(e) => { e.preventDefault(); putItem({ img: undefined, thumb: undefined }); }}>Remove</button>}
        <input type="file" accept="image/*" class="sr-only" onChange={(e) => attach((e.target as HTMLInputElement).files?.[0])} />
      </label>
      </>}
      {seg !== "bulk" && <>
      <div class="flex justify-between t-meta"><span>Est. cost {inr(i.cost * i.qty)}</span>{d.grams > 0 && <span>Sliced {d.grams * i.qty} g · logged {filG} g</span>}</div>
      <div class="grid grid-cols-2 gap-1.5">
        <input class={c} placeholder="Print file name" value={d.file} onInput={(e) => set({ file: (e.target as HTMLInputElement).value })} />
        <input class={c} placeholder="Slice profile" value={d.profile} onInput={(e) => set({ profile: (e.target as HTMLInputElement).value })} />
        <input class={c} type="number" placeholder="Sliced g" value={d.grams || ""} onInput={(e) => set({ grams: Number((e.target as HTMLInputElement).value) || 0 })} />
        <input class={c} type="number" placeholder="Sliced min" value={d.minutes || ""} onInput={(e) => set({ minutes: Number((e.target as HTMLInputElement).value) || 0 })} />
        <input class={`${c} col-span-2`} placeholder="BOM: magnets ×2, insert ×4…" value={d.bom} onInput={(e) => set({ bom: (e.target as HTMLInputElement).value })} />
      </div>
      </>}
    </div>}
  </li>;
}

/** Bulk lines print in runs: N units on a printer with a spool, then logged good / failed. */
export function PrintRuns({ order, item, onOpen }: { order: Order; item: Order["items"][number]; onOpen: (o: Order) => void }) {
  const runs = batchesSig.value.filter((b) => b.orderNo === order.no && b.name === item.name && (b.running || b.printer || b.spool));
  const p = lineProgress(order, item);
  const printers = printersSig.value.filter((x) => x.active !== false && x.status !== "down");
  const spools = spoolsSig.value.filter((x) => x.active !== false && x.status !== "empty");
  const [qty, setQty] = useState(0), [pr, setPr] = useState(""), [sps, setSps] = useState<string[]>([""]);
  const [fin, setFin] = useState<Record<string, [number, number]>>({}), [gm, setGm] = useState<Record<string, Record<string, number>>>({});
  const c = "h-8 px-2 rounded-lg border border-line bg-c0 text-xs min-w-0";
  const spLabel = (x: typeof spools[number]) => `${x.spoolNo} · ${x.material} ${x.colour}`.trim();
  const room = Math.max(0, p.pending - p.printing);
  const start = (e: Event) => { e.preventDefault(); const n = qty || room; if (!n) return; startRun(order, item.name, n, pr || printers[0]?.name || "Printer", sps.filter(Boolean).join(" + ")); setQty(0); setSps([""]); onOpen({ ...order }); };
  const live = runs.filter((r) => r.running), past = runs.filter((r) => !r.running);
  return <div class="flex flex-col gap-2">
    <form class="rounded-lg border border-c4/30 bg-c1 p-2 flex flex-col gap-1.5" onSubmit={start}>
      <span class="font-semibold text-[12px]">Start print <span class="t-meta font-normal">· {room} left to print</span></span>
      <div class="grid grid-cols-[64px_1fr] gap-1.5">
        <input class={c} type="number" min={1} placeholder={String(room)} value={qty || ""} onInput={(e) => setQty(Number((e.target as HTMLInputElement).value) || 0)} aria-label="Pieces in this run" />
        <select class={c} value={pr || printers[0]?.name} onChange={(e) => setPr((e.target as HTMLSelectElement).value)} aria-label="Printer">{printers.map((x) => <option key={x.id} value={x.name}>{x.name}</option>)}</select>
      </div>
      <span class="t-meta">Spools / materials used</span>
      {sps.map((v, k) => <div key={k} class="flex items-center gap-1.5">
        <span class="t-meta w-4 text-right">{k + 1}</span>
        <select class={`${c} flex-1`} value={v} onChange={(e) => setSps(sps.map((x, j) => (j === k ? (e.target as HTMLSelectElement).value : x)))} aria-label={`Spool ${k + 1}`}><option value="">{spools.length ? "Pick spool…" : "No spools"}</option>{spools.filter((x) => spLabel(x) === v || !sps.includes(spLabel(x))).map((x) => <option key={x.id} value={spLabel(x)}>{spLabel(x)} ({x.grams} g)</option>)}</select>
        {sps.length > 1 && <button type="button" class="w-7 h-7 !min-h-0 rounded-lg text-c3 hover:bg-c0 cursor-pointer" onClick={() => setSps(sps.filter((_, j) => j !== k))} aria-label={`Remove spool ${k + 1}`}>×</button>}
      </div>)}
      <button type="button" class="self-start underline t-meta cursor-pointer !min-h-0" onClick={() => setSps([...sps, ""])}>+ Add another spool / material</button>
      <button class="h-8 rounded-lg bg-c4 text-c0 text-xs font-medium cursor-pointer">Start print</button>
    </form>
    {live.map((r) => { const f = fin[r.id] ?? [r.units, 0]; return <form key={r.id} class="rounded-lg border border-line p-2 flex flex-col gap-1.5" onSubmit={(e) => { e.preventDefault(); onOpen(finishRun(order, r.id, f[0], f[1], gm[r.id])); }}>
      <div class="flex items-center gap-2"><Status tone="active">printing</Status><span class="flex-1 min-w-0 truncate"><b class="num">{r.units}×</b> {r.printer}{r.spool ? ` · ${r.spool}` : ""}</span></div>
      <div class="flex items-center gap-1.5">
        <label class="t-meta">Good</label><input class={`${c} w-14`} type="number" min={0} value={f[0]} onInput={(e) => setFin({ ...fin, [r.id]: [Number((e.target as HTMLInputElement).value) || 0, f[1]] })} />
        <label class="t-meta">Failed</label><input class={`${c} w-14`} type="number" min={0} value={f[1]} onInput={(e) => setFin({ ...fin, [r.id]: [f[0], Number((e.target as HTMLInputElement).value) || 0] })} />
        <button class="h-8 px-3 ml-auto rounded-lg bg-c4 text-c0 text-xs font-medium cursor-pointer">Print done</button>
      </div>
      {runSpools(r.spool).length > 0 && <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span class="t-meta w-full">Filament used (comes off the spool)</span>
        {runSpools(r.spool).map((no) => { const left = spoolsSig.value.find((x) => x.spoolNo === no)?.grams; return <label key={no} class="flex items-center gap-1.5">
          <span class="font-mono text-[11px]">{no}</span>
          <input class={`${c} w-20`} type="number" min={0} placeholder="g" value={gm[r.id]?.[no] || ""} onInput={(e) => setGm({ ...gm, [r.id]: { ...gm[r.id], [no]: Number((e.target as HTMLInputElement).value) || 0 } })} aria-label={`Grams used from ${no}`} />
          <span class="t-meta">g{left !== undefined ? ` · ${left} g left` : ""}</span>
        </label>; })}
      </div>}
    </form>; })}
    {past.length > 0 && <details><summary class="cursor-pointer t-meta py-1">{past.length} run{past.length === 1 ? "" : "s"} done</summary>
      <ul class="flex flex-col divide-y divide-line">{past.map((r) => <li key={r.id} class="flex items-center gap-2 py-1"><span class="flex-1 min-w-0 truncate">{r.printer || "—"}{r.spool ? ` · ${r.spool}` : ""}</span><span class="whitespace-nowrap"><span class="text-grn">{r.done}</span> · <span class="text-red">{r.failed ?? 0} ✕</span></span></li>)}</ul>
    </details>}
  </div>;
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
