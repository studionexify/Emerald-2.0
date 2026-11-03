import { Button, Card, CardTitle, Fact, Progress, Status } from "../../ui";
import { db, inr, orderTotal, orderUnits, ordersSig, shortDate } from "../../data";
import { WorkShell } from "./shared";

export default function Bulk() {
  const orders = ordersSig.value.filter((o) => o.type === "bulk" && o.stage !== "archived");
  return (
    <WorkShell title="Bulk orders" sub="Stationery stores, gift shops and other large orders" actions={<Button icon="plus">New bulk order</Button>}>
      <div class="grid gap-4 lg:grid-cols-2">
        {orders.map((o) => {
          const bs = db.batches.filter((b) => b.orderNo === o.no);
          const units = orderUnits(o), done = bs.reduce((s, b) => s + b.done, 0);
          return (
            <Card key={o.id}>
              <CardTitle action={<span class="text-xs text-c3">{o.no}</span>}>{o.customer}</CardTitle>
              <div class="grid grid-cols-3 gap-3 mb-4">
                <Fact label="Value" value={inr(orderTotal(o))} />
                <Fact label="Units" value={`${done}/${units}`} />
                <Fact label="Due" value={shortDate(o.due)} />
              </div>
              <Progress value={(done / units) * 100} />
              <h3 class="font-semibold text-sm mt-5 mb-2">Batches</h3>
              {bs.length ? (
                <ul class="flex flex-col gap-2">
                  {bs.map((b) => (
                    <li key={b.id} class="bg-c1 rounded-2xl p-3 text-sm flex justify-between items-center">
                      <span><span class="font-medium block">{b.name}</span><span class="text-c3">{b.done}/{b.units} units</span></span>
                      <Status tone={b.status === "shipped" || b.status === "packed" ? "done" : b.status === "planned" ? "waiting" : "active"}>{b.status}</Status>
                    </li>
                  ))}
                </ul>
              ) : <p class="text-sm text-c3">No batches yet — still at {o.stage}.</p>}
              <div class="flex gap-2 mt-4"><Button variant="outline" icon="plus">Add batch</Button><Button variant="ghost">Photos</Button></div>
            </Card>
          );
        })}
      </div>
    </WorkShell>
  );
}
