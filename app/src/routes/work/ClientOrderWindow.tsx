/**
 * Client order window: one fixed-size, centred window that walks a client order from quotation to archive.
 * Left: the steps (click any to look at it). Right: that step's work, or the order's items, client & payment, history.
 * Footer: Back, Edit details, and the one button that moves the order forward (gates and overrides as in the old side panel).
 */
import { useState } from "preact/hooks";
import { Button, Sheet, Status, askText } from "../../ui";
import { Thumb } from "../../ui/media";
import { lazy, navigate } from "../../router";
import {
  advancesOf, can, clientsSig, gateReason, historySig, inr, invoicesSig, lineProgress, me, moveTo, nextOf, orderProgress, orderTotal, patchOrder, prevOf, shipmentsSig,
  shortDate, STAGE_LABEL, STAGE_ORDER, SUGGESTED, batchesSig, type Order, type Stage, openOrderSig,
} from "../../data";
import { quoteOf } from "../../data/quoting";
import { RecordSheet } from "./RecordForms";

const AdvanceCard = lazy<{ order: Order; total: number }>(() => import("./Advance").then((m) => m.AdvanceCard));
const QuoteFlow = lazy<{ order: Order; onClose: () => void; start?: "approve" }>(() => import("./ClientFlow").then((m) => m.QuoteFlow));
const Floor = lazy<{ order: Order; onClose: () => void }>(() => import("./Floor").then((m) => m.Floor));

type Tab = "step" | "items" | "client" | "history";
const TABS: [Tab, string][] = [["step", "Step"], ["items", "Items"], ["client", "Client & payment"], ["history", "History"]];
const SAY: Record<string, string> = {
  quotation: "Create the quotation, send it, then record the client's answer.",
  production: "Print every piece on the Floor sheet. Moving on needs every piece printed.",
  qc: "Check the prints and log the result.",
  packing: "Pack it and record what was used.",
  invoice: "Raise the invoice (needed before archiving).",
  shipping: "Hand it over, record the delivery and the payment.",
  archived: "This order is complete and archived.",
};

export function ClientOrderWindow({ order, onClose, onOpen, onEdit }: { order: Order; onClose: () => void; onOpen: (o: Order) => void; onEdit: (o: Order) => void }) {
  const [tab, setTab] = useState<Tab>("step");
  const [view, setView] = useState<Stage | null>(null);          // the step being looked at (default: the current one)
  const [qf, setQf] = useState<"" | "open" | "approve">(""), [fl, setFl] = useState(false), [rec, setRec] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const flow = SUGGESTED.client;
  const cur = order.stage, curAt = flow.indexOf(cur);
  const shown = view ?? cur;
  const next = nextOf(order), prev = prevOf(order);
  const total = orderTotal(order);
  const adv = advancesOf(order.no).reduce((s, m) => s + m.amount, 0);
  const prog = orderProgress(order);
  const gate = gateReason(order, batchesSig.value);
  const cl = clientsSig.value.find((c) => c.name.toLowerCase() === order.customer.toLowerCase());
  const q = quoteOf(order);
  const refresh = (o?: Order) => { setView(null); onOpen(o ?? { ...order }); };

  /** Same rules as the old panel: back needs a reason; forward passes the gate, or an owner/manager overrides with a reason. */
  const go = async (to: Stage) => {
    if (to === order.stage) return;
    const back = STAGE_ORDER.indexOf(to) < STAGE_ORDER.indexOf(order.stage);
    let reason = "";
    if (back) { reason = (await askText(`Reason for sending ${order.no} back to ${STAGE_LABEL[to]}?`)) ?? ""; if (!reason.trim()) return; }
    const passing = STAGE_ORDER.slice(STAGE_ORDER.indexOf(order.stage), STAGE_ORDER.indexOf(to)).filter((s) => s === order.stage || flow.includes(s));
    const block = back ? null : passing.map((s) => gateReason({ ...order, stage: s }, batchesSig.value)).find(Boolean) ?? null;
    if (block) {
      if (!can("work") || !["owner", "partner", "manager"].includes(me.value?.role ?? "")) { setMsg(block); return; }
      reason = (await askText(`${block}\n\nOverride and move anyway? Give a reason:`, { ok: "Override" })) ?? ""; if (!reason.trim()) { setMsg(block); return; }
      reason = `override: ${reason}`;
    }
    setMsg(""); refresh(moveTo(order, to, reason));
  };

  /* What the current step needs: [what is done?, button label, action] */
  const handed = !!order.delivery && order.delivery.method !== "courier";
  const need: Partial<Record<Stage, { ok: boolean; label: string; run: () => void }>> = {
    quotation: { ok: !!order.approved, label: q ? "Client approved" : "Create quotation", run: () => setQf(q ? "approve" : "open") },
    production: { ok: !!order.jobsDone || prog.pending === 0, label: prog.printed || prog.failed ? "Open floor sheet" : "Start printing", run: () => setFl(true) },
    qc: { ok: !!order.qcLogged, label: "Log QC", run: () => setRec("qcLogged") },
    packing: { ok: !!order.packed || !!order.skipPacking, label: "Record packing", run: () => setRec("packed") },
    invoice: { ok: !!order.invoiced, label: "Record invoice", run: () => setRec("invoiced") },
    shipping: { ok: !!order.tracking || handed, label: "Record delivery", run: () => setRec("tracking") },
  };
  const n = need[cur];
  const pay = order.paid ? "Paid" : `Unpaid · ${inr(Math.max(0, total - adv))} due`;

  const Row = ({ k, v }: { k: string; v?: preact.ComponentChildren }) => <div class="flex justify-between gap-3 py-1.5 border-t border-line first:border-0 text-[13px]"><span class="text-c3 shrink-0">{k}</span><span class="text-right min-w-0 break-words">{v || "—"}</span></div>;
  const Box = ({ title, children }: { title: string; children: preact.ComponentChildren }) => <section class="rounded-xl border border-line bg-c0 p-3 grid gap-2"><h3 class="text-[13px] font-semibold">{title}</h3>{children}</section>;

  const stepBody = () => {
    const isCur = shown === cur, at = flow.indexOf(shown), done = at >= 0 && at < curAt;
    const status = done ? "Done" : isCur ? "Current step" : "Not reached yet";
    const info: preact.ComponentChildren = ({
      quotation: <Row k="Quotation" v={q ? `${q.no} · ${q.outcome}${q.sent ? ` · sent ${shortDate(q.sent)}${q.via ? ` by ${q.via}` : ""}` : " · not sent"}` : "None yet"} />,
      production: <><Row k="Printed" v={`${prog.printed}/${prog.qty}`} /><Row k="Wasted" v={String(prog.failed)} /><Row k="Left to print" v={String(prog.pending)} /></>,
      qc: <Row k="QC" v={order.qcLogged ? "Logged" : "Not logged"} />,
      packing: <Row k="Packing" v={order.packed ? "Recorded" : order.skipPacking ? "Skipped" : "Not recorded"} />,
      invoice: <><Row k="Invoice" v={order.invoiced ? "Raised" : "Not raised"} />{invoicesSig.value.filter((i) => i.orderNo === order.no).map((i) => <Row key={i.id} k={`${i.kind === "credit" ? "Credit note" : "Invoice"} ${i.no}`} v={`${shortDate(i.date)}${i.paidOn ? " · paid" : ""}`} />)}</>,
      shipping: <><Row k="Delivery" v={order.tracking ? `Tracking ${order.tracking}` : handed ? "Handed over" : "Not recorded"} />{shipmentsSig.value.filter((s) => s.orderNo === order.no).map((s) => <Row key={s.id} k={s.courier} v={s.tracking || shortDate(s.date)} />)}<Row k="Payment" v={pay} /></>,
      archived: <Row k="Status" v="Archived" />,
    } as Record<string, preact.ComponentChildren>)[shown];
    return <div class="grid gap-3">
      <Box title={`${STAGE_LABEL[shown]} · ${status}`}>
        <p class="text-[13px] text-c3">{SAY[shown]}</p>
        <div>{info}</div>
        {isCur && n && <div class="flex flex-wrap gap-2 pt-1">
          <Button variant={n.ok ? "outline" : "primary"} onClick={n.run}>{n.ok && cur === "quotation" ? "Open quotation" : n.ok && cur === "production" ? "Open floor sheet" : n.ok ? `${n.label} (edit)` : n.label}</Button>
          {cur === "quotation" && q && !order.approved && <Button variant="outline" onClick={() => setQf("open")}>Open quotation</Button>}
          {cur === "packing" && !n.ok && <Button variant="outline" onClick={() => refresh(patchOrder(order, { skipPacking: true }))}>Skip packing</Button>}
          {cur === "shipping" && !order.paid && <Button variant="outline" onClick={() => setRec("paid")}>Record payment</Button>}
        </div>}
        {isCur && n?.ok && next && <p class="text-[12.5px] font-medium text-grn">Done. Move to {STAGE_LABEL[next]} when you are ready.</p>}
        {!isCur && !done && <p class="t-meta">This step opens when the order gets here.</p>}
        {!isCur && at >= 0 && <button class="text-[12px] underline self-start cursor-pointer !min-h-0" onClick={() => setView(null)}>Back to the current step</button>}
      </Box>
      {gate && cur !== "archived" && isCur && <p class="text-[12px] text-c3" role="note">⚠ {gate}</p>}
    </div>;
  };

  const itemsBody = () => <div class="grid gap-2">
    {order.items.map((i, k) => { const p = lineProgress(order, i), pct = i.qty ? Math.min(100, (p.printed / i.qty) * 100) : 0, wp = i.qty ? Math.min(100 - pct, (p.failed / i.qty) * 100) : 0;
      return <div key={k} class="rounded-xl border border-line p-2.5 flex items-center gap-3">
        <Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-12 h-12 shrink-0" />
        <div class="min-w-0 flex-1">
          <div class="text-[14px] font-semibold truncate">{i.name}</div>
          <div class="t-meta">×{i.qty} · {[i.material, i.colour].filter(Boolean).join(" ") || "material not set"}</div>
          <span class="flex h-1.5 rounded-full bg-c1 overflow-hidden mt-1.5" aria-hidden="true"><span class="bg-grn" style={{ width: `${pct}%` }} /><span class="bg-red" style={{ width: `${wp}%` }} /></span>
          <div class="text-[11px] font-medium mt-0.5"><span class="text-grn">{p.printed} done</span> · <span class="text-red">{p.failed} failed</span> · <span class="text-c3">{p.pending} left</span>{p.printing > 0 && <b> · {p.printing} printing</b>}</div>
        </div>
        <div class="num text-[14px] font-semibold whitespace-nowrap">{i.price ? inr(i.price * i.qty) : "—"}</div>
      </div>; })}
    <div class="flex justify-between text-[13px] pt-1"><span class="text-c3">Total</span><b class="num">{inr(total)}</b></div>
  </div>;

  const clientBody = () => <div class="grid gap-3">
    <Box title="Client">
      <div><Row k="Name" v={order.customer} /><Row k="Phone" v={cl?.phone && <a class="underline" href={`tel:${cl.phone}`}>{cl.phone}</a>} /><Row k="Email" v={cl?.email && <a class="underline" href={`mailto:${cl.email}`}>{cl.email}</a>} />
        <Row k="Address" v={cl?.address} /><Row k="City" v={cl?.city} /><Row k="GSTIN" v={cl?.gstin} /><Row k="Came via" v={order.medium} /></div>
      <button class="text-xs underline self-start cursor-pointer !min-h-0" onClick={() => { openOrderSig.value = order.no; navigate("/work/clients"); }}>{cl ? "Edit client" : "Add to clients"} →</button>
    </Box>
    <Box title={`Payment · ${pay}`}>
      <AdvanceCard order={order} total={total} />
      <label class="flex items-center gap-2 text-[13px] pt-1"><input type="checkbox" checked={!!order.paid} onChange={() => refresh(patchOrder(order, { paid: !order.paid }))} /> Payment received in full</label>
    </Box>
  </div>;

  const hist = historySig.value.filter((h) => h.orderNo === order.no);
  const historyBody = () => <Box title={`Stage history · ${hist.length}`}>
    <ul>{hist.map((h) => <li key={h.id} class="py-1.5 border-t border-line first:border-0 text-[13px]">{h.at} · {h.by}: {STAGE_LABEL[h.from]} → {STAGE_LABEL[h.to]}{h.reason ? ` — “${h.reason}”` : ""}</li>)}{!hist.length && <li class="text-c3 text-[13px]">No moves yet.</li>}</ul>
    <p class="t-meta">Created {shortDate(order.created)} · Due {shortDate(order.due)}</p>
  </Box>;

  const last = cur === "archived";
  return (
    <Sheet win open onClose={onClose}
      title={<span class="flex items-center gap-2.5 flex-wrap min-w-0"><span class="truncate">{order.no} · {order.customer}</span><Status tone={last ? "done" : "active"}>{STAGE_LABEL[cur]}</Status></span>}
      footer={<div class="flex-1 min-w-0 !h-auto flex items-center gap-2 flex-wrap max-md:grid max-md:grid-cols-2 [&_button]:!h-10 max-md:[&_button]:!h-12 [&>*]:!flex-none max-md:[&>*]:!flex-1">
        <p class="text-[12.5px] min-w-0 flex-1 basis-40 max-md:col-span-2" role="status">{msg || (last ? "Order complete." : next ? `Next: ${STAGE_LABEL[next]}` : "")}</p>
        {prev && <Button variant="outline" onClick={() => go(prev)}>← {STAGE_LABEL[prev]}</Button>}
        <Button variant="outline" icon="edit" onClick={() => onEdit(order)}>Edit details</Button>
        {next && <Button class="max-md:col-span-2" onClick={() => go(next)}>{next === "archived" ? "Complete order" : `Move to ${STAGE_LABEL[next]}`} →</Button>}
      </div>}>
      {qf && <QuoteFlow order={order} start={qf === "approve" ? "approve" : undefined} onClose={() => { setQf(""); refresh(); }} />}
      {fl && <Floor order={order} onClose={() => { setFl(false); refresh(); }} />}
      {rec && <RecordSheet order={order} field={rec} onClose={() => setRec(null)} onDone={(o) => refresh(o)} />}
      <div class="h-full min-h-0 flex max-md:flex-col">
        <nav aria-label="Order steps" class="shrink-0 md:w-[200px] md:border-r border-line p-3 flex md:flex-col gap-1 overflow-x-auto md:overflow-y-auto">
          {flow.map((st, i) => { const done = i < curAt, now = st === cur, on = st === shown;
            return <button key={st} type="button" onClick={() => { setView(st); setTab("step"); }} aria-current={now ? "step" : undefined}
              class={`flex items-center gap-2.5 h-10 !min-h-0 px-2 rounded-lg text-left cursor-pointer whitespace-nowrap ${on && tab === "step" ? "bg-c1" : "hover:bg-c1/60"}`}>
              <span class={`w-6 h-6 rounded-full grid place-items-center shrink-0 text-[11px] font-bold ${now ? "bg-c4 text-c0" : done ? "bg-grn-bg text-grn" : "ring-1 ring-inset ring-line text-c3"}`}>{done ? "✓" : i + 1}</span>
              <span class={`text-[13px] ${now ? "font-bold" : ""}`}>{STAGE_LABEL[st]}</span>
            </button>; })}
        </nav>
        <div class="flex-1 min-w-0 min-h-0 flex flex-col">
          <div class="shrink-0 px-4 pt-3 pb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] border-b border-line">
            <span><span class="text-c3">Due</span> <b>{shortDate(order.due)}</b></span><span><span class="text-c3">Total</span> <b class="num">{inr(total)}</b></span>
            <span><span class="text-c3">Printed</span> <b class="num">{prog.printed}/{prog.qty}</b></span><span class={order.paid ? "text-grn font-semibold" : ""}>{pay}</span>
            <span class="ml-auto flex gap-1" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} class={`h-8 !min-h-0 px-3 rounded-full text-[12.5px] font-semibold cursor-pointer ${tab === k ? "bg-c4 text-c0" : "bg-c1"}`}>{l}</button>)}</span>
          </div>
          <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4">{tab === "step" ? <div class="grid gap-4 min-[1400px]:grid-cols-2 items-start"><div>{stepBody()}</div><div class="hidden min-[1400px]:grid gap-4"><Box title={`Items · ${order.items.length}`}>{itemsBody()}</Box>{clientBody()}</div></div> : tab === "items" ? itemsBody() : tab === "client" ? clientBody() : historyBody()}</div>
        </div>
      </div>
    </Sheet>
  );
}
