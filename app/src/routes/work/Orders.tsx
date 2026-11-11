import { sortAbc } from "../../mock/types";
import { vOrders } from "../../data";
import { useState } from "preact/hooks";
import { Button, Card, DetailHead, Field, Icon, inputCls, isPhone, Status, Table } from "../../ui";
import { MetaRow } from "../../ui/disclose";
import { Initials, StagePill, StageStrip } from "../../ui/stage-strip";
import { b2bFor } from "../../data/inventory";
import { canSwitchMode, PAY_LABEL } from "../../data/mode";
import { batchesSig, can, createOrder, duplicateOrder, inr, orderTotal, type OrderType, shortDate, STAGES, TYPE_LABEL, SIZE_LABEL, B2B_TYPES, type OrderSize, type Order, type Stage } from "../../data";
import { OrderCard, OrderDetail, stageLabel, TypeChips, WorkShell, type TypeFilter , useOpenOrder } from "./shared";

export default function Orders() {
  const [f, setF] = useState<TypeFilter>("all");
  const [view, setView] = useState<"board" | "list">("list");
  const [open, setOpen] = useOpenOrder();
  const [creating, setCreating] = useState(false);
  const cur = open && (vOrders().find((o) => o.id === open.id) ?? open);
  const batchesAt = (k: Stage) => (["production", "qc", "packing", "invoice", "shipping"].includes(k) ? batchesSig.value.filter((b) => b.stage === k && list.some((o) => o.no === b.orderNo)) : []);
  const [stage, setStage] = useState<Stage>("quotation");
  const list = vOrders().filter((o) => f === "all" || o.type === f);
  const count = (k: Stage) => list.filter((o) => o.stage === k).length + batchesAt(k).length;
  const viewToggle = (
    <div class="flex bg-c1 rounded-lg p-0.5" role="group" aria-label="View">
      {(["board", "list"] as const).map((v) => (
        <button key={v} onClick={() => setView(v)} aria-label={v} aria-pressed={view === v}
          class={`w-10 h-10 md:w-7 md:h-7 rounded-md flex items-center justify-center cursor-pointer ${view === v ? "bg-c0 text-c4 shadow-sm" : "text-c3"}`}>
          <Icon name={v === "board" ? "grid" : "rows"} size={14} />
        </button>
      ))}
    </div>
  );
  return (
    <WorkShell title="Orders" sub="Quotation to archive, every order type" actions={<><Button variant="outline" icon="copy" onClick={() => { const no = prompt(`Copy which order? (${vOrders().slice(0, 6).map((o) => o.no).join(", ")})`, vOrders()[0]?.no); const src = vOrders().find((o) => o.no === no?.trim()); if (src) { setCreating(false); setOpen(duplicateOrder(src)); } }}>From template</Button><Button icon="plus" onClick={() => { setOpen(null); setCreating(true); }}>New order</Button></>}
      detail={creating ? <NewOrder onDone={(o) => { setCreating(false); if (o) setOpen(o); }} /> : cur && <OrderDetail order={cur} onClose={() => setOpen(null)} onOpen={setOpen} />}
      toolbar={<div class="flex flex-wrap gap-2 items-center w-full">
        <TypeChips value={f} onChange={setF} />
        {!isPhone.value && <div class="ml-auto">{viewToggle}</div>}
      </div>}>
      <StageStrip orders={list} showValue={can("mauny")} active={isPhone.value && view === "board" ? stage : undefined} />
      {isPhone.value && (
        <div class="flex gap-2 items-center">
          {view === "board" ? (
            <select aria-label="Stage" value={stage} onChange={(e) => setStage((e.target as HTMLSelectElement).value as Stage)}
              class="flex-1 h-11 px-3 rounded-lg border border-line bg-c0 text-[15px] font-semibold min-w-0">
              {STAGES.map((s) => <option key={s.key} value={s.key}>{s.n}. {s.label} ({count(s.key)})</option>)}
            </select>
          ) : <span class="flex-1 t-meta">{list.length} orders</span>}
          {viewToggle}
        </div>
      )}
      {view === "board" ? (
        <>
          <div class="md:hidden flex flex-col gap-2">
            {list.filter((o) => o.stage === stage).map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
            {batchesAt(stage).map((b) => <BatchCard key={b.id} b={b} onOpen={() => setOpen(vOrders().find((o) => o.no === b.orderNo)!)} />)}
            {!count(stage) && <div class="rounded-2xl border border-dashed border-line p-3 text-center t-meta">No orders at this stage</div>}
          </div>
          <div class={`hidden md:grid gap-2.5 ${open || creating ? "grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid-cols-4 2xl:grid-cols-8"}`}>
            {STAGES.map((s) => {
              const col = list.filter((o) => o.stage === s.key), bcol = batchesAt(s.key);
              return (
                <div key={s.key} class="min-w-0">
                  <div class="flex items-center justify-between px-1 mb-1.5">
                    <span class="t-section !text-[11px] truncate">{s.label}</span>
                    <span class="num t-meta">{col.length + bcol.length}</span>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    {col.map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
                    {bcol.map((b) => <BatchCard key={b.id} b={b} onOpen={() => setOpen(vOrders().find((o) => o.no === b.orderNo)!)} />)}
                    {!col.length && !bcol.length && <div class="rounded-2xl border border-dashed border-line h-10 flex items-center justify-center t-meta">Empty</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Card class="!py-1">
          <Table rows={list} rowKey={(o) => o.id} onRow={setOpen} cols={[
            { key: "no", label: "Order", render: (o) => <span class="flex items-center gap-2.5 min-w-0"><Initials name={o.customer} /><span class="flex flex-col min-w-0"><span class="truncate font-semibold">{o.customer}</span><MetaRow items={[o.no, o.items[0]?.name, o.items.length > 1 && `+${o.items.length - 1} more`]} /></span></span> },
            { key: "s", label: "Stage", card: "status", render: (o) => o.blocked ? <Status tone="blocked">{stageLabel(o)}</Status> : <StagePill stage={o.stage} label={stageLabel(o)} /> },
            { key: "d", label: "Due", card: "foot", render: (o) => <span class={`inline-flex items-center gap-1 whitespace-nowrap ${o.stage !== "archived" && o.due && o.due < new Date().toISOString().slice(0, 10) ? "text-late font-semibold" : ""}`}><Icon name="calendar" size={12} />{shortDate(o.due)}</span> },
            { key: "v", label: "Value", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
            { key: "t", label: "Type", level: 2, render: (o) => TYPE_LABEL[o.type] },
            { key: "m", label: "Medium", level: 2, render: (o) => o.medium },
            { key: "it", label: "Items", level: 2, render: (o) => o.items.map((i) => `${i.qty}× ${i.name} (${i.material} ${i.colour})`).join(", ") },
            { key: "dl", label: "Delivery", level: 2, render: (o) => !o.delivery ? "—" : o.delivery.method === "courier" ? `Courier${o.delivery.pincode ? ` · ${o.delivery.pincode}` : ""}` : o.delivery.method === "hand" ? "Hand delivery" : "Pickup" },
            { key: "bl", label: "Blocked", level: 2, render: (o) => o.blocked || "—" },
          ]} />
        </Card>
      )}
    </WorkShell>
  );
}

function BatchCard({ b, onOpen }: { b: import("../../data").Batch; onOpen: () => void }) {
  return (
    <button onClick={onOpen} class="w-full text-left rounded-2xl px-2.5 py-2 cursor-pointer bg-c0 text-[13px] border border-dashed border-c2">
      <div class="flex justify-between gap-2"><span class="font-mono text-[11px] font-bold">{b.orderNo}</span><span class="t-meta">Batch</span></div>
      <div class="font-medium truncate mt-0.5">{b.name}</div>
      <div class="t-meta num">{b.customer} · {b.done}/{b.units}</div>
    </button>
  );
}

export const PURPOSES = sortAbc(["Jig / tool", "Sample", "R&D", "Display", "Own use"]);
function NewOrder({ onDone }: { onDone: (o: Order | null) => void }) {
  const [t, setT] = useState<OrderType>("client");
  const [d, setD] = useState({ customer: "", item: "", qty: 1, price: 0, medium: "Instagram", due: "", purpose: "Jig / tool", size: "small" as OrderSize, b2b: B2B_TYPES[0], pay: "alpha" as "alpha" | "beta" });
  const f = (k: keyof typeof d) => ({ value: d[k], class: inputCls, onInput: (e: Event) => { const v = (e.target as HTMLInputElement).value; setD({ ...d, [k]: typeof d[k] === "number" ? Number(v) || 0 : v }); } });
  return (
    <div>
      <DetailHead title="New order" onClose={() => onDone(null)} />
      <div class="grid grid-cols-3 gap-2 mb-2">
        {(["inhouse", "client", "bulk"] as OrderType[]).map((k) => (
          <button key={k} onClick={() => setT(k)} class={`h-9 rounded-full text-sm cursor-pointer ${t === k ? "bg-c4 text-c0" : "bg-c1"}`}>{TYPE_LABEL[k]}</button>
        ))}
      </div>
      <div class="grid grid-cols-2 gap-2.5">
        {t !== "inhouse" && <div class="col-span-2"><Field label={t === "bulk" ? "Business" : "Customer"}><input {...f("customer")} onInput={(e) => { const v = (e.target as HTMLInputElement).value; setD({ ...d, customer: v, ...(b2bFor(v) ?? {}) }); }} /></Field></div>}
        <div class="col-span-2"><Field label={t === "inhouse" ? "What are we making (jig, tool, sample)" : "Item"}><input {...f("item")} /></Field></div>
        <Field label="Quantity"><input type="number" {...f("qty")} /></Field>
        {t !== "inhouse" ? <Field label="Unit price (₹)"><input type="number" {...f("price")} /></Field> : <Field label="Purpose"><select class={inputCls} value={d.purpose} onChange={(e) => setD({ ...d, purpose: (e.target as HTMLSelectElement).value })}>{PURPOSES.map((x) => <option key={x}>{x}</option>)}</select></Field>}
        {t !== "inhouse" && <Field label="Order type"><select class={inputCls} value={d.size} onChange={(e) => setD({ ...d, size: (e.target as HTMLSelectElement).value as OrderSize })}>{Object.entries(SIZE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>}
        {t !== "inhouse" && canSwitchMode() && <Field label="Payment mode"><select class={inputCls} value={d.pay} onChange={(e) => setD({ ...d, pay: (e.target as HTMLSelectElement).value as "alpha" | "beta" })}><option value="alpha">{PAY_LABEL.alpha}</option><option value="beta">{PAY_LABEL.beta}</option></select></Field>}
        {t !== "inhouse" && d.size === "b2b" && <Field label="B2B type"><select class={inputCls} value={d.b2b} onChange={(e) => setD({ ...d, b2b: (e.target as HTMLSelectElement).value })}>{B2B_TYPES.map((x) => <option key={x}>{x}</option>)}</select></Field>}
        {t !== "inhouse" && <Field label="Came via"><select class={inputCls} value={d.medium} onChange={(e) => setD({ ...d, medium: (e.target as HTMLSelectElement).value })}>{sortAbc(["Instagram", "WhatsApp", "Website", "Referral", "Word of mouth", "Exhibition", "Phone", "Email"]).map((m) => <option key={m}>{m}</option>)}</select></Field>}
        {t === "bulk" && <Field label="GSTIN"><input class={inputCls} placeholder="24…" /></Field>}
        {t !== "inhouse" && <Field label="Due"><input type="date" {...f("due")} /></Field>}
      </div>
      <Button class="mt-3" onClick={() => onDone(createOrder({ type: t, ...d }))}>{t === "inhouse" ? "Start in Production" : "Create quotation"}</Button>
    </div>
  );
}
