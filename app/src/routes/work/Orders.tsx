import { useState } from "preact/hooks";
import { Button, Card, Icon, Status, Table } from "../../ui";
import { inr, orderTotal, ordersSig, shortDate, STAGES, TYPE_LABEL, type Order, type Stage } from "../../data";
import { OrderCard, OrderDetail, stageLabel, TypeChips, WorkShell, type TypeFilter } from "./shared";

export default function Orders() {
  const [f, setF] = useState<TypeFilter>("all");
  const [view, setView] = useState<"board" | "list">("board");
  const [open, setOpen] = useState<Order | null>(null);
  const [stage, setStage] = useState<Stage>("quotation");
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const count = (k: Stage) => list.filter((o) => o.stage === k).length;
  return (
    <WorkShell title="Orders" sub="Quotation to archive, every order type" actions={<><Button variant="outline" icon="copy">From template</Button><Button icon="plus">New order</Button></>}
      detail={open && <OrderDetail order={open} onClose={() => setOpen(null)} onOpen={setOpen} />}
      toolbar={<div class="flex flex-wrap gap-2 items-center">
        <TypeChips value={f} onChange={setF} />
        {view === "board" && (
          <select aria-label="Stage" value={stage} onChange={(e) => setStage((e.target as HTMLSelectElement).value as Stage)}
            class="md:hidden h-7 px-2 rounded-full bg-c0 text-xs font-medium flex-1 min-w-0">
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.n}. {s.label} ({count(s.key)})</option>)}
          </select>
        )}
        <div class="flex bg-c0 rounded-full p-0.5 ml-auto">
          {(["board", "list"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} aria-label={v} aria-pressed={view === v}
              class={`w-7 h-7 md:w-8 md:h-8 rounded-full flex items-center justify-center cursor-pointer ${view === v ? "bg-c4 text-c0" : "text-c3"}`}>
              <Icon name={v === "board" ? "grid" : "rows"} size={14} />
            </button>
          ))}
        </div>
      </div>}>
      {view === "board" ? (
        <>
          <div class="md:hidden flex flex-col gap-2">
            {list.filter((o) => o.stage === stage).map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
            {!count(stage) && <div class="rounded-xl border-2 border-dashed border-c2 p-5 text-center text-sm text-c3">No orders at this stage</div>}
          </div>
          <div class={`hidden md:grid gap-2.5 ${open ? "grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" : "grid-cols-4 2xl:grid-cols-7"}`}>
            {STAGES.map((s) => {
              const col = list.filter((o) => o.stage === s.key);
              return (
                <div key={s.key} class="min-w-0">
                  <div class="flex items-center justify-between px-1 mb-1.5">
                    <span class="font-semibold text-xs xl:text-sm">{s.n}. {s.label}</span>
                    <span class="num text-xs text-c3 bg-c0 rounded-full px-2 py-0.5">{col.length}</span>
                  </div>
                  <div class="flex flex-col gap-2">
                    {col.map((o) => <OrderCard key={o.id} o={o} onOpen={setOpen} />)}
                    {!col.length && <div class="rounded-xl border-2 border-dashed border-c2 h-12 flex items-center justify-center text-xs text-c3">No orders</div>}
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
            { key: "m", label: "Medium", render: (o) => o.medium, hideTablet: true },
            { key: "d", label: "Due", render: (o) => shortDate(o.due) },
            { key: "v", label: "Value", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
          ]} />
        </Card>
      )}
    </WorkShell>
  );
}
