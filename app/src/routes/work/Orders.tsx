import { useState } from "preact/hooks";
import { Button, Card, Icon, Status, Table } from "../../ui";
import { inr, orderTotal, ordersSig, shortDate, STAGES, TYPE_LABEL, type Order, type Stage } from "../../data";
import { OrderCard, OrderDrawer, stageLabel, TypeChips, WorkShell, type TypeFilter } from "./shared";

export default function Orders() {
  const [f, setF] = useState<TypeFilter>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [open, setOpen] = useState<Order | null>(null);
  const [stage, setStage] = useState<Stage>("quotation");
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
        <>
          {/* Phone: pick a stage, see its orders */}
          <div class="md:hidden">
            <div class="grid grid-cols-3 gap-2 mb-3">
              {STAGES.map((s) => {
                const n = list.filter((o) => o.stage === s.key).length;
                return (
                  <button key={s.key} onClick={() => setStage(s.key)} aria-pressed={stage === s.key}
                    class={`rounded-2xl p-2 text-left cursor-pointer ${stage === s.key ? "bg-c4 text-c0" : "bg-c0"}`}>
                    <div class="num text-lg font-semibold leading-none">{n}</div>
                    <div class="text-xs mt-1">{s.label}</div>
                  </button>
                );
              })}
            </div>
            <div class="flex flex-col gap-2">
              {list.filter((o) => o.stage === stage).map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
              {!list.some((o) => o.stage === stage) && <div class="rounded-2xl border-2 border-dashed border-c2 p-6 text-center text-sm text-c3">No orders at this stage</div>}
            </div>
          </div>
          {/* iPad: 3 columns × 2 rows; desktop: all 6 stages side by side */}
          <div class="hidden md:grid grid-cols-3 xl:grid-cols-6 gap-3">
            {STAGES.map((s) => {
              const col = list.filter((o) => o.stage === s.key);
              return (
                <div key={s.key} class="min-w-0">
                  <div class="flex items-center justify-between px-1 mb-2">
                    <span class="font-semibold text-sm">{s.n}. {s.label}</span>
                    <span class="num text-xs text-c3 bg-c0 rounded-full px-2 py-0.5">{col.length}</span>
                  </div>
                  <div class="flex flex-col gap-2">
                    {col.map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
                    {!col.length && <div class="rounded-2xl border-2 border-dashed border-c2 h-16 flex items-center justify-center text-xs text-c3">No orders</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
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
