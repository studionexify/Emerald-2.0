import { Button, Card, CardTitle, Fact, Progress, Status, Table } from "../../ui";
import { db, inr, orderCost, orderTotal, orderUnits, ordersSig, shortDate, TYPE_LABEL } from "../../data";
import { WorkShell } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";

export function Production() {
  return (
    <WorkShell title="Production" sub="One job per line item; machine picked at print time" actions={<Button icon="plus">Quick print</Button>}>
      <div class="grid gap-3 md:grid-cols-3 mb-3">
        {db.printers.map((p) => (
          <Card key={p.id} dark={p.status === "printing"}>
            <div class="flex justify-between items-start">
              <div><div class="font-semibold text-lg">{p.name}</div><div class="text-sm opacity-80">{p.model}</div></div>
              <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>
            </div>
            <div class="num text-4xl font-semibold mt-6">{p.hours}h</div>
            <div class="text-sm opacity-80">{p.job ? `Printing: ${p.job}` : "lifetime hours"}</div>
          </Card>
        ))}
      </div>
      <Card>
        <CardTitle>Job queue</CardTitle>
        <Table rows={db.jobs} rowKey={(j) => j.id} cols={[
          { key: "o", label: "Order", render: (j) => <b>{j.orderNo}</b> },
          { key: "i", label: "Item", render: (j) => j.item },
          { key: "p", label: "Printer", render: (j) => j.printer },
          { key: "op", label: "Operator", render: (j) => j.operator },
          { key: "s", label: "Status", render: (j) => <Status tone={jobTone(j.status)}>{j.status}</Status> },
          { key: "h", label: "Est. hours", align: "right", render: (j) => j.hours },
          { key: "g", label: "Grams", align: "right", render: (j) => j.grams },
        ]} />
      </Card>
    </WorkShell>
  );
}

export function QC() {
  const pass = db.qc.filter((q) => q.result === "pass").length;
  return (
    <WorkShell title="QC & Logging" sub="Pass, rework or scrap — with the reason kept" actions={<Button icon="plus">Log QC</Button>}>
      <div class="grid gap-3 grid-cols-3 mb-3">
        <Card dark><div class="num text-2xl md:text-4xl font-semibold">{pass}</div><div class="text-sm opacity-80">passed</div></Card>
        <Card><div class="num text-2xl md:text-4xl font-semibold">{db.qc.filter((q) => q.result === "rework").length}</div><div class="text-sm text-c3">rework</div></Card>
        <Card><div class="num text-2xl md:text-4xl font-semibold">{db.qc.reduce((s, q) => s + q.grams, 0)}g</div><div class="text-sm text-c3">wasted</div></Card>
      </div>
      <Card>
        <Table rows={db.qc} rowKey={(q) => q.id} cols={[
          { key: "d", label: "Date", render: (q) => shortDate(q.date) },
          { key: "o", label: "Order", render: (q) => <b>{q.orderNo}</b> },
          { key: "i", label: "Item", render: (q) => q.item },
          { key: "r", label: "Result", render: (q) => <Status tone={q.result === "pass" ? "done" : q.result === "scrap" ? "blocked" : "waiting"}>{q.result}</Status> },
          { key: "x", label: "Defect", render: (q) => q.defect ?? "—" },
          { key: "b", label: "By", render: (q) => q.by },
          { key: "g", label: "Grams lost", align: "right", render: (q) => q.grams },
        ]} />
      </Card>
    </WorkShell>
  );
}

export function Packing() {
  const list = ordersSig.value.filter((o) => o.stage === "packing");
  return (
    <WorkShell title="Packing" sub="Materials used, weight, box size, handling notes">
      <div class="grid gap-3 md:grid-cols-2">
        {list.map((o) => (
          <Card key={o.id}>
            <CardTitle action={<span class="text-xs text-c3">{TYPE_LABEL[o.type]}</span>}>{o.no} · {o.customer}</CardTitle>
            <div class="grid grid-cols-3 gap-3 mb-3">
              <Fact label="Units" value={orderUnits(o)} />
              <Fact label="Box" value="—" />
              <Fact label="Weight" value="—" />
            </div>
            <Button>Record packing</Button>
          </Card>
        ))}
        <Card>
          <CardTitle action={<a href="/workshop/packing" class="text-sm text-c3">Stock →</a>}>Packing stock</CardTitle>
          <ul class="flex flex-col gap-3 text-sm">
            {db.packStock.map((p) => (
              <li key={p.id}>
                <div class="flex justify-between mb-1"><span>{p.name}</span><span class="num">{p.qty} {p.unit}</span></div>
                <Progress value={(p.qty / (p.reorderAt * 3)) * 100} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </WorkShell>
  );
}

export function Shipping() {
  const list = ordersSig.value.filter((o) => o.stage === "shipping");
  return (
    <WorkShell title="Shipping" sub="Courier, tracking, freight paid vs recovered; partial dispatch">
      <Card>
        <Table rows={list} rowKey={(o) => o.id} cols={[
          { key: "o", label: "Order", render: (o) => <b>{o.no}</b> },
          { key: "c", label: "Customer", render: (o) => o.customer },
          { key: "i", label: "Invoice", render: (o) => <Status tone={o.invoiced ? "done" : "waiting"}>{o.invoiced ? "Raised" : "Pending"}</Status> },
          { key: "t", label: "Tracking", render: (o) => (o.blocked ? <Status tone="blocked">Missing</Status> : "—") },
          { key: "a", label: "", render: () => <Button variant="outline">Add tracking</Button> },
        ]} />
      </Card>
    </WorkShell>
  );
}

export function Archive() {
  const list = ordersSig.value.filter((o) => o.stage === "archived");
  return (
    <WorkShell title="Archive" sub="Final cost rollup; records are read-only">
      <Card>
        <Table rows={list} rowKey={(o) => o.id} cols={[
          { key: "o", label: "Order", render: (o) => <b>{o.no}</b> },
          { key: "c", label: "Customer", render: (o) => o.customer },
          { key: "t", label: "Type", render: (o) => TYPE_LABEL[o.type] },
          { key: "r", label: "Revenue", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
          { key: "k", label: "Cost", align: "right", render: (o) => inr(orderCost(o)) },
          { key: "m", label: "Margin", align: "right", render: (o) => (o.type === "inhouse" ? "—" : `${Math.round((1 - orderCost(o) / orderTotal(o)) * 100)}%`) },
        ]} />
      </Card>
    </WorkShell>
  );
}
