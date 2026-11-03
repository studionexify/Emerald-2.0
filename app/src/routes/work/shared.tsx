import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { WORK_TABS } from "../../nav";
import { Button, Chip, DetailHead, Fact, Page, Status } from "../../ui";
import { addBatch, advance, batchAction, BATCH_LABEL, batchesSig, canAdvance, canAdvanceBatch, checks, duplicateOrder, flowOf, FLOW_NOTE, inr, nextOf, orderCost, orderTotal, patchOrder, satisfy, shortDate, STAGE_LABEL, TYPE_LABEL, type Batch, type Order, type OrderType } from "../../data";

export function WorkShell({ title, sub, actions, toolbar, detail, children }: { title: string; sub?: string; actions?: ComponentChildren; toolbar?: ComponentChildren; detail?: ComponentChildren | null; children: ComponentChildren }) {
  return <Page title={title} sub={sub} actions={actions} tabs={WORK_TABS} toolbar={toolbar} detail={detail}>{children}</Page>;
}

export type TypeFilter = "all" | OrderType;
export function TypeChips({ value, onChange }: { value: TypeFilter; onChange: (v: TypeFilter) => void }) {
  const opts: TypeFilter[] = ["all", "client", "bulk", "inhouse"];
  return (
    <div class="flex flex-wrap gap-1.5">
      {opts.map((o) => <Chip key={o} active={value === o} onClick={() => onChange(o)}>{o === "all" ? "All" : TYPE_LABEL[o]}</Chip>)}
    </div>
  );
}

export const stageLabel = (o: Order) => STAGE_LABEL[o.stage];

export function OrderCard({ o, onOpen, inset }: { o: Order; onOpen: (o: Order) => void; inset?: boolean }) {
  return (
    <button onClick={() => onOpen(o)} class={`w-full min-w-0 text-left rounded-xl p-2.5 xl:p-3 cursor-pointer text-[13px] md:text-sm ${o.type === "bulk" ? "bg-c4 text-c0" : inset ? "bg-c1" : "bg-c0"}`}>
      <div class="flex flex-wrap justify-between gap-x-2 text-xs opacity-80 mb-1"><span>{o.no}</span><span>{TYPE_LABEL[o.type]}</span></div>
      <div class="font-semibold break-words leading-snug text-sm">{o.customer}</div>
      <div class="text-xs opacity-80 break-words leading-snug">{o.items.map((i) => i.name).join(", ")}</div>
      <div class="flex flex-wrap justify-between items-center gap-x-2 mt-1.5 text-xs">
        <span class="num font-semibold">{o.type === "inhouse" ? "Internal" : inr(orderTotal(o))}</span>
        <span class="opacity-80">Due {shortDate(o.due)}</span>
      </div>
      {o.blocked && <div class="mt-2 text-xs font-semibold flex items-start gap-2"><span class="w-2 h-2 mt-1 shrink-0 rotate-45 bg-current" />{o.blocked}</div>}
    </button>
  );
}

/** Inline order detail (no overlay). Render via the page's `detail` prop. */
export function OrderDetail({ order, onClose, onOpen }: { order: Order; onClose: () => void; onOpen: (o: Order) => void }) {
  const [msg, setMsg] = useState("");
  const flow = flowOf(order);
  const idx = flow.indexOf(order.stage);
  const next = nextOf(order);
  const batches = batchesSig.value;
  const gate = canAdvance(order, batches);
  const total = orderTotal(order), cost = orderCost(order);
  const mine = batches.filter((b) => b.orderNo === order.no);
  return (
    <div>
      <DetailHead title={`${order.no} · ${order.customer}`} onClose={() => { setMsg(""); onClose(); }} />
      <div class="text-xs text-c3 mb-2">{TYPE_LABEL[order.type]} · via {order.medium} · {FLOW_NOTE[order.type]}</div>
      <ol class="flex flex-wrap gap-1 mb-3" aria-label="Flow">
        {flow.map((s, i) => (
          <li key={s} class={`text-[11px] px-2 h-6 inline-flex items-center rounded-full ${i < idx ? "bg-c2 text-c0" : i === idx ? "bg-c4 text-c0 font-semibold" : "bg-c1 text-c3"}`}>{i + 1}. {STAGE_LABEL[s]}</li>
        ))}
      </ol>
      {order.stage !== "archived" && (
        <div class="rounded-xl bg-c1 p-3 mb-3">
          <div class="text-xs font-semibold mb-1.5">To leave {STAGE_LABEL[order.stage]}</div>
          <ul class="flex flex-col gap-1.5">
            {checks(order, batches).map((c) => (
              <li key={c.label} class="flex items-center justify-between gap-2 text-sm">
                <Status tone={c.done ? "done" : "waiting"}>{c.label}</Status>
                {!c.done && c.action && <button class="text-xs underline cursor-pointer whitespace-nowrap" onClick={() => onOpen(satisfy(order, c.field))}>{c.action}</button>}
              </li>
            ))}
          </ul>
          {order.type === "inhouse" && order.stage === "qc" && (
            <label class="flex items-center gap-2 text-xs mt-2"><input type="checkbox" checked={!!order.skipPacking} onChange={() => onOpen(patchOrder(order, { skipPacking: !order.skipPacking }))} /> Skip packing for this job</label>
          )}
        </div>
      )}
      {order.blocked && <div class="mb-3 rounded-xl bg-c4 text-c0 p-3 text-sm"><b>On hold:</b> {order.blocked}</div>}
      <div class="flex flex-wrap items-center gap-2 mb-1">
        <Button disabled={!gate.ok} onClick={() => { const n = advance(order); if (n) onOpen(n); }}>{next ? `Move to ${STAGE_LABEL[next]}` : "Final stage"}</Button>
        <Button variant="outline" icon="copy" onClick={() => { const c = duplicateOrder(order); setMsg(`Created ${c.no}`); onOpen(c); }}>Duplicate</Button>
      </div>
      {!gate.ok && <p class="text-xs text-c3 mb-3">Can't move yet — {gate.reason}</p>}
      {msg && <p class="text-sm mb-3 font-medium" role="status">{msg}</p>}

      {order.type === "bulk" && order.stage !== "quotation" && order.stage !== "po" && (
        <>
          <h3 class="font-semibold text-sm mt-3 mb-2 flex justify-between items-center">Batches · invoice per dispatch <button class="text-xs underline cursor-pointer" onClick={() => { addBatch(order); onOpen({ ...order }); }}>+ Add batch</button></h3>
          <ul class="flex flex-col gap-1.5 mb-3">{mine.map((b) => <BatchRow key={b.id} b={b} after={() => onOpen({ ...order })} />)}</ul>
        </>
      )}

      <div class="grid grid-cols-2 gap-3 my-3 text-sm">
        <Fact label="Created" value={shortDate(order.created)} />
        <Fact label="Due" value={shortDate(order.due)} />
        <Fact label="Value" value={order.type === "inhouse" ? "Internal" : inr(total)} />
        <Fact label="Internal cost" value={inr(cost)} />
        {order.type === "client" && <Fact label="Payment" value={order.paid ? "Paid" : "On delivery"} />}
        {order.type === "bulk" && <Fact label="PO" value={order.po ?? "—"} />}
        {order.type === "inhouse" && <Fact label="Cost goes to" value="Internal jobs" />}
      </div>
      <h3 class="font-semibold text-sm mb-2">Line items</h3>
      <ul class="flex flex-col gap-1.5 mb-3">
        {order.items.map((i, k) => (
          <li key={k} class="bg-c1 rounded-xl p-2.5 text-sm flex justify-between gap-3">
            <span class="min-w-0"><span class="font-medium block">{i.name}</span><span class="text-c3 text-xs">{i.material} · {i.colour} · ×{i.qty}</span></span>
            <span class="num text-right">{order.type === "inhouse" ? "—" : inr(i.price * i.qty)}<span class="block text-c3 text-xs">cost {inr(i.cost * i.qty)}</span></span>
          </li>
        ))}
      </ul>
      <p class="text-xs text-c3">Tasks linked to {order.no} live in <a class="underline" href="/todo">To-do</a>.</p>
    </div>
  );
}

export function BatchRow({ b, after }: { b: Batch; after?: () => void }) {
  const g = canAdvanceBatch(b);
  const act = (w: "print" | "invoice" | "tracking" | "advance") => { batchAction(b, w); after?.(); };
  return (
    <li class="bg-c1 rounded-xl p-2.5 text-sm">
      <div class="flex justify-between gap-2"><span class="font-medium">{b.name}</span><Status tone={b.stage === "done" ? "done" : g.ok ? "active" : "waiting"}>{BATCH_LABEL[b.stage]}</Status></div>
      <div class="text-xs text-c3">{b.done}/{b.units} units{b.invoiceNo ? ` · ${b.invoiceNo}` : ""}{b.tracking ? ` · ${b.tracking}` : ""}</div>
      {b.stage !== "done" && (
        <div class="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-xs">
          {b.stage === "production" && b.done < b.units && <button class="underline cursor-pointer" onClick={() => act("print")}>Mark printed</button>}
          {b.stage === "invoice" && !b.invoiceNo && <button class="underline cursor-pointer" onClick={() => act("invoice")}>Raise invoice</button>}
          {b.stage === "shipping" && !b.tracking && <button class="underline cursor-pointer" onClick={() => act("tracking")}>Add tracking</button>}
          <button class={`font-semibold ${g.ok ? "underline cursor-pointer" : "text-c3"}`} disabled={!g.ok} onClick={() => act("advance")}>{g.ok ? "Advance →" : g.reason}</button>
        </div>
      )}
    </li>
  );
}
