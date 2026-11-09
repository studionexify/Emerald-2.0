import { vOrders } from "../../data";
import { Button, Card, CardTitle, Meter, Section } from "../../ui";
import { BATCH_LABEL, BATCH_STAGES, batchesSig, inr, orderTotal, orderUnits, shortDate, STAGE_LABEL } from "../../data";
import { BatchRow, OrderDetail, WorkShell , useOpenOrder } from "./shared";

export default function Bulk() {
  const [open, setOpen] = useOpenOrder();
  const orders = vOrders().filter((o) => o.type === "bulk" && o.stage !== "archived");
  const batches = batchesSig.value.filter((b) => orders.some((o) => o.no === b.orderNo));
  return (
    <WorkShell title="Bulk orders" sub="PO → batches, each with its own QC, packing, invoice and dispatch" actions={<Button icon="plus">New bulk order</Button>}
      detail={open && <OrderDetail order={vOrders().find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />}>
      <Section title="Orders" note={String(orders.length)}>
        <div class="listbox">
          {orders.map((o) => {
            const bs = batchesSig.value.filter((b) => b.orderNo === o.no);
            const units = orderUnits(o), shipped = bs.filter((b) => b.stage === "done").reduce((s, b) => s + b.units, 0);
            return (
              <button key={o.id} onClick={() => setOpen(o)} class="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.4fr)_110px_90px_minmax(140px,1fr)_100px] gap-x-3 items-center px-3 py-2 md:py-0 md:h-10 hover:bg-c1/60 cursor-pointer text-[13px]">
                <span class="min-w-0 truncate"><span class="font-mono text-[12px] font-bold mr-2">{o.no}</span><span class="font-medium">{o.customer}</span><span class="t-meta ml-1.5">{o.po ? `PO ${o.po}` : ""}</span></span>
                <span class="t-meta truncate">{STAGE_LABEL[o.stage]}</span>
                <span class="hidden md:block t-meta num">Due {shortDate(o.due)}</span>
                <span class="hidden md:block"><Meter value={(shipped / units) * 100} label={`${shipped}/${units}`} /></span>
                <span class="hidden md:block num text-right">{inr(orderTotal(o))}</span>
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
                <ul class="flex flex-col gap-2">
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
