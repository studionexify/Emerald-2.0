import { useState } from "preact/hooks";
import { Button, Card, CardTitle, Fact, Progress, Section } from "../../ui";
import { BATCH_LABEL, BATCH_STAGES, batchesSig, inr, orderTotal, orderUnits, ordersSig, shortDate, STAGE_LABEL, type Order } from "../../data";
import { BatchRow, OrderDetail, WorkShell } from "./shared";

export default function Bulk() {
  const [open, setOpen] = useState<Order | null>(null);
  const orders = ordersSig.value.filter((o) => o.type === "bulk" && o.stage !== "archived");
  const batches = batchesSig.value.filter((b) => orders.some((o) => o.no === b.orderNo));
  return (
    <WorkShell title="Bulk orders" sub="PO → batches, each with its own QC, packing, invoice and dispatch" actions={<Button icon="plus">New bulk order</Button>}
      detail={open && <OrderDetail order={ordersSig.value.find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />}>
      <Section title="Orders" note={String(orders.length)}>
        <div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {orders.map((o) => {
            const bs = batchesSig.value.filter((b) => b.orderNo === o.no);
            const units = orderUnits(o), shipped = bs.filter((b) => b.stage === "done").reduce((s, b) => s + b.units, 0);
            return (
              <button key={o.id} onClick={() => setOpen(o)} class="text-left bg-c0 rounded-xl p-3 cursor-pointer">
                <div class="flex justify-between text-xs text-c3"><span>{o.no}</span><span>{STAGE_LABEL[o.stage]}</span></div>
                <div class="font-semibold">{o.customer}</div>
                <div class="grid grid-cols-4 gap-2 my-2 text-sm">
                  <Fact label="Value" value={inr(orderTotal(o))} /><Fact label="PO" value={o.po ?? "—"} /><Fact label="Shipped" value={`${shipped}/${units}`} /><Fact label="Due" value={shortDate(o.due)} />
                </div>
                <Progress value={(shipped / units) * 100} />
              </button>
            );
          })}
        </div>
      </Section>
      <Section title="Batch board" note={`${batches.length} batches`}>
        <div class="grid gap-2 grid-cols-1 md:grid-cols-3 2xl:grid-cols-6">
          {BATCH_STAGES.map((st) => {
            const col = batches.filter((b) => b.stage === st);
            return (
              <Card key={st}>
                <CardTitle action={<span class="num text-xs text-c3">{col.length}</span>}>{BATCH_LABEL[st]}</CardTitle>
                <ul class="flex flex-col gap-1.5">
                  {col.map((b) => <div key={b.id}><div class="text-[11px] text-c3 px-1">{b.orderNo} · {b.customer}</div><BatchRow b={b} /></div>)}
                  {!col.length && <li class="text-xs text-c3">None</li>}
                </ul>
              </Card>
            );
          })}
        </div>
      </Section>
    </WorkShell>
  );
}
