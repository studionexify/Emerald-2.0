import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { WORK_TABS } from "../../nav";
import { Button, Chip, DetailHead, Fact, Page, Progress, Status } from "../../ui";
import { duplicateOrder, GATE, inr, orderCost, orderTotal, shortDate, nextStage, STAGES, stagesFor, TYPE_LABEL, type Order, type OrderType } from "../../data";

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

export const stageIndex = (o: Order) => STAGES.findIndex((s) => s.key === o.stage);
export const stageLabel = (o: Order) => STAGES[stageIndex(o)].label;

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
  const flow = stagesFor(order);
  const idx = flow.findIndex((s) => s.key === order.stage);
  const next = nextStage(order);
  const total = orderTotal(order), cost = orderCost(order);
  return (
    <div>
      <DetailHead title={`${order.no} · ${order.customer}`} onClose={() => { setMsg(""); onClose(); }} />
      <div class="flex flex-wrap gap-2 mb-3">
        <Status tone={order.blocked ? "blocked" : order.stage === "archived" ? "done" : "active"}>{stageLabel(order)}</Status>
        <span class="text-xs text-c3">· {TYPE_LABEL[order.type]} · via {order.medium}</span>
      </div>
      <div class="mb-1 flex justify-between text-xs text-c3"><span>Stage {idx + 1} of {flow.length}{order.type === "inhouse" ? " · skips Invoice" : ""}</span><span>{Math.round(((idx + 1) / flow.length) * 100)}%</span></div>
      <Progress value={((idx + 1) / flow.length) * 100} />
      <div class="mt-3 rounded-xl bg-c1 p-3 text-xs"><b>Gate:</b> {GATE[order.stage]}</div>
      {order.blocked && <div class="mt-2 rounded-xl bg-c4 text-c0 p-3 text-sm"><b>Blocked:</b> {order.blocked}</div>}
      <div class="grid grid-cols-2 gap-3 my-4 text-sm">
        <Fact label="Created" value={shortDate(order.created)} />
        <Fact label="Due" value={shortDate(order.due)} />
        <Fact label="Value" value={order.type === "inhouse" ? "Internal" : inr(total)} />
        <Fact label="Internal cost" value={inr(cost)} />
        <Fact label="Margin" value={order.type === "inhouse" || !total ? "—" : `${Math.round((1 - cost / total) * 100)}%`} />
        <Fact label="Invoice" value={order.invoiced ? "Raised" : "Not yet"} />
      </div>
      <h3 class="font-semibold text-sm mb-2">Line items</h3>
      <ul class="flex flex-col gap-1.5 mb-4">
        {order.items.map((i, k) => (
          <li key={k} class="bg-c1 rounded-xl p-2.5 text-sm flex justify-between gap-3">
            <span class="min-w-0"><span class="font-medium block">{i.name}</span><span class="text-c3 text-xs">{i.material} · {i.colour} · ×{i.qty}</span></span>
            <span class="num text-right">{inr(i.price * i.qty)}<span class="block text-c3 text-xs">cost {inr(i.cost * i.qty)}</span></span>
          </li>
        ))}
      </ul>
      <h3 class="font-semibold text-sm mb-1">Build sheet</h3>
      <p class="text-xs text-c3 mb-4">Material, colour, accessories, machine, operator, layer/infill and estimates — filled at approval.</p>
      <h3 class="font-semibold text-sm mb-1">Tasks</h3>
      <p class="text-xs text-c3 mb-4">Tasks linked to {order.no} appear here. <a class="underline" href="/todo">Open To-do</a></p>
      <div class="flex flex-wrap gap-2">
        <Button disabled={!!order.blocked || order.stage === "archived"}>{next ? `Move to ${next.label}` : "Final stage"}</Button>
        <Button variant="outline" icon="copy" onClick={() => { const c = duplicateOrder(order); setMsg(`Created ${c.no}`); onOpen(c); }}>Duplicate</Button>
        <Button variant="ghost">Documents</Button>
      </div>
      {(order.blocked || order.stage === "archived") && <p class="text-xs text-c3 mt-2">Can't advance: {order.blocked ?? GATE[order.stage]}</p>}
      {msg && <p class="text-sm mt-2 font-medium" role="status">{msg} — fresh copy at {stageLabel({ ...order, stage: order.type === "inhouse" ? "production" : "quotation" })}.</p>}
    </div>
  );
}
