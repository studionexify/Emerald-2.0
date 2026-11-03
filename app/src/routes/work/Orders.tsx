import { useState } from "preact/hooks";
import { Button, Card, Icon, Status, Table } from "../../ui";
import { inr, orderTotal, ordersSig, shortDate, STAGES, TYPE_LABEL, type Order } from "../../data";
import { OrderCard, OrderDrawer, stageLabel, TypeChips, WorkShell, type TypeFilter } from "./shared";

export default function Orders() {
  const [f, setF] = useState<TypeFilter>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [open, setOpen] = useState<Order | null>(null);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  return (
    <WorkShell title="Orders" sub="Quotations to archive, every order type" actions={<Button icon="plus">New order</Button>}>
      <div class="flex flex-wrap gap-3 items-center justify-between mb-4">
        <TypeChips value={f} onChange={setF} />
        <div class="flex bg-c0 rounded-full p-1">
          {(["board", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-label={v} aria-pressed={view === v}
              class={`w-9 h-9 rounded-full flex items-center justify-center cursor-pointer ${view === v ? "bg-c4 text-c0" : "text-c3"}`}>
              <Icon name={v === "board" ? "grid" : "rows"} size={16} />
            </button>
          ))}
        </div>
      </div>
      {view === "board" ? (
        <div class="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {STAGES.map((s) => {
            const col = list.filter((o) => o.stage === s.key);
            return (
              <div key={s.key} class="w-72 shrink-0">
                <div class="flex items-center justify-between px-1 mb-2">
                  <span class="font-semibold text-sm">{s.n}. {s.label}</span>
                  <span class="num text-xs text-c3">{col.length}</span>
                </div>
                <div class="flex flex-col gap-2">
                  {col.map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
                  {!col.length && <div class="rounded-2xl border-2 border-dashed border-c2 h-20 flex items-center justify-center text-xs text-c3">Empty</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table rows={list} rowKey={(o) => o.id} onRow={setOpen} cols={[
            { key: "no", label: "Order", render: (o) => <b>{o.no}</b> },
            { key: "c", label: "Customer", render: (o) => o.customer },
            { key: "t", label: "Type", render: (o) => TYPE_LABEL[o.type] },
            { key: "s", label: "Stage", render: (o) => <Status tone={o.blocked ? "blocked" : o.stage === "archived" ? "done" : "active"}>{stageLabel(o)}</Status> },
            { key: "d", label: "Due", render: (o) => shortDate(o.due) },
            { key: "v", label: "Value", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
          ]} />
        </Card>
      )}
      <OrderDrawer order={open} onClose={() => setOpen(null)} onOpen={setOpen} />
    </WorkShell>
  );
}
