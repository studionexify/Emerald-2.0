import { useState } from "preact/hooks";
import { Button, Card, CardTitle, Chip, Fact, Field, inputCls, Progress, Section, Stat, Status, Table } from "../../ui";
import { db, inr, orderCost, orderTotal, orderUnits, ordersSig, shortDate, TYPE_LABEL, X } from "../../data";
import { ConsumeForm, WorkShell } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";
const sel = (opts: string[]) => <select class={inputCls}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;

export function Production() {
  const [f, setF] = useState("all");
  const jobs = db.jobs.filter((j) => f === "all" || j.status === f);
  return (
    <WorkShell title="Production" sub="Build sheet at approval · one job per line item" actions={<><Button variant="outline">Log block</Button><Button icon="plus">Quick print</Button></>}
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "queued", "printing", "done", "failed"].map((s) => <Chip key={s} active={f === s} onClick={() => setF(s)}>{s === "all" ? "All jobs" : s}</Chip>)}</div>}>
      <Card><div class="text-sm font-semibold mb-2">Log consumption</div><ConsumeForm /></Card>
      <Section title="Machines" note={`${db.printers.length} printers`}>
        <div class="grid gap-2 grid-cols-1 sm:grid-cols-3">
          {db.printers.map((p) => {
            const m = X.machineLog.find((x) => x.printer === p.name)!;
            return (
              <Card key={p.id} dark={p.status === "printing"}>
                <div class="flex justify-between items-start gap-2">
                  <div class="min-w-0"><div class="font-semibold">{p.name}</div><div class="text-xs opacity-80">{p.model}</div></div>
                  <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>
                </div>
                <div class="grid grid-cols-4 gap-2 mt-3 text-xs">
                  <div><div class="num text-base font-semibold">{m.util}%</div>util</div>
                  <div><div class="num text-base font-semibold">{m.uptime}%</div>uptime</div>
                  <div><div class="num text-base font-semibold">{m.lost}h</div>blocked</div>
                  <div><div class="num text-base font-semibold">{m.fail}%</div>fail</div>
                </div>
                <div class="text-xs opacity-80 mt-2">{p.job ? `Printing: ${p.job}` : `${p.hours} lifetime hours`}</div>
              </Card>
            );
          })}
        </div>
      </Section>
      <Section title="Job queue" note={`${jobs.length} jobs`}>
        <Card>
          <Table rows={jobs} rowKey={(j) => j.id} cols={[
            { key: "o", label: "Order", render: (j) => <b>{j.orderNo}</b> },
            { key: "i", label: "Item · run", render: (j) => j.item },
            { key: "p", label: "Printer", render: (j) => j.printer },
            { key: "op", label: "Operator", render: (j) => j.operator },
            { key: "s", label: "Status", render: (j) => <Status tone={jobTone(j.status)}>{j.status}</Status> },
            { key: "h", label: "Est. h", align: "right", render: (j) => j.hours },
            { key: "g", label: "Grams", align: "right", render: (j) => j.grams },
          ]} />
        </Card>
      </Section>
      <Section title="Build sheet" note="filled at approval">
        <Card class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Raw material">{sel(["PLA", "PETG", "TPU", "ABS", "Resin"])}</Field>
          <Field label="Colour">{sel(["Black", "White", "Grey", "Gold"])}</Field>
          <Field label="Accessories">{sel(["None", "Magnets", "NFC tag", "Brass inserts"])}</Field>
          <Field label="Machine">{sel(db.printers.map((p) => p.name))}</Field>
          <Field label="Operator">{sel(db.team.map((m) => m.name))}</Field>
          <Field label="Layer / infill"><input class={inputCls} value="0.2 mm · 15%" /></Field>
          <Field label="Estimate (g · h)"><input class={inputCls} value="410 g · 4 h" /></Field>
          <Field label="Finishing notes"><input class={inputCls} placeholder="Sand seams, prime" /></Field>
        </Card>
      </Section>
    </WorkShell>
  );
}

export function QC() {
  const [res, setRes] = useState("pass");
  const done = db.jobs.filter((j) => j.status === "done");
  return (
    <WorkShell title="QC & Logging" sub="A work queue, not a form — pass, rework or scrap, reason kept">
      <div class="grid grid-cols-4 gap-2">
        <Stat value={db.qc.filter((q) => q.result === "pass").length} label="passed" />
        <Stat value={db.qc.filter((q) => q.result === "rework").length} label="rework" />
        <Stat value={db.qc.filter((q) => q.result === "scrap").length} label="scrap" />
        <Stat value={`${db.qc.reduce((s, q) => s + q.grams, 0)}g`} label="wasted" />
      </div>
      <Card><div class="text-sm font-semibold mb-2">Log consumption</div><ConsumeForm /></Card>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section title="Waiting for QC" note={String(done.length)}>
          <Card>
            <CardTitle>{done[0] ? `${done[0].orderNo} · ${done[0].item} (${done[0].printer})` : "Nothing waiting"}</CardTitle>
            <div class="flex gap-1.5 mb-3">{["pass", "rework", "scrap"].map((r) => <Chip key={r} active={res === r} onClick={() => setRes(r)}>{r[0].toUpperCase() + r.slice(1)}</Chip>)}</div>
            <div class="grid grid-cols-2 gap-3">
              <Field label="Units reworked"><input class={inputCls} type="number" value="0" /></Field>
              <Field label="Wasted (g)"><input class={inputCls} type="number" value="0" /></Field>
              <Field label="Defect">{sel(["—", "Stringing", "Layer shift", "Warping", "Under-extrusion", "Dimensions"])}</Field>
              <Field label="Root cause">{sel(["—", "Material", "Slicer profile", "Machine", "Post-processing", "Design"])}</Field>
              <div class="col-span-2"><Field label="What should we do differently next time?"><input class={inputCls} /></Field></div>
              <Field label="Checked by">{sel(db.team.map((m) => m.name))}</Field>
              <Field label="Photo"><input class={inputCls} type="file" accept="image/*" /></Field>
            </div>
            <Button class="mt-3">Log check</Button>
          </Card>
        </Section>
        <Section title="Log" note="newest first">
          <Card>
            <Table rows={db.qc} rowKey={(q) => q.id} cols={[
              { key: "o", label: "Order", render: (q) => <b>{q.orderNo}</b> },
              { key: "d", label: "Date", render: (q) => shortDate(q.date) },
              { key: "i", label: "Item", render: (q) => q.item },
              { key: "r", label: "Result", render: (q) => <Status tone={q.result === "pass" ? "done" : q.result === "scrap" ? "blocked" : "waiting"}>{q.result}</Status> },
              { key: "x", label: "Defect", render: (q) => q.defect ?? "—" },
              { key: "b", label: "By", render: (q) => q.by },
              { key: "g", label: "Lost g", align: "right", render: (q) => q.grams },
            ]} />
          </Card>
        </Section>
      </div>
    </WorkShell>
  );
}

export function Packing() {
  const list = ordersSig.value.filter((o) => o.stage === "packing");
  return (
    <WorkShell title="Packing" sub="Materials used and their cost, weight, box size, handling notes">
      <Card><div class="text-sm font-semibold mb-2">Log consumption</div><ConsumeForm /></Card>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section title="To pack" note={String(list.length)}>
          {list.map((o) => (
            <Card key={o.id}>
              <CardTitle action={<span class="text-xs text-c3">{TYPE_LABEL[o.type]} · {orderUnits(o)} units</span>}>{o.no} · {o.customer}</CardTitle>
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Box size"><input class={inputCls} placeholder="30×20×15" /></Field>
                <Field label="Gross weight"><input class={inputCls} placeholder="kg" /></Field>
                <Field label="Material">{sel(db.packStock.map((p) => p.name))}</Field>
                <Field label="Qty used"><input class={inputCls} type="number" /></Field>
                <div class="col-span-2 sm:col-span-3"><Field label="Special handling"><input class={inputCls} placeholder="Fragile, keep flat" /></Field></div>
                <Field label="Packed by">{sel(db.team.map((m) => m.name))}</Field>
              </div>
              <div class="flex gap-2 mt-3"><Button>Record packing</Button><Button variant="outline" icon="plus">Material line</Button></div>
            </Card>
          ))}
        </Section>
        <Section title="Recorded" note={String(X.packRecords.length)}>
          <Card>
            <Table rows={X.packRecords} rowKey={(r) => r.id} cols={[
              { key: "o", label: "Order", render: (r) => <b>{r.order}</b> },
              { key: "b", label: "Box", render: (r) => r.box },
              { key: "w", label: "Weight", render: (r) => r.weight },
              { key: "m", label: "Materials", render: (r) => r.materials },
              { key: "c", label: "Cost", align: "right", render: (r) => inr(r.cost) },
            ]} />
          </Card>
          <Card>
            <CardTitle action={<a href="/workshop/packing" class="text-xs text-c3">Stock →</a>}>Packing stock</CardTitle>
            <ul class="flex flex-col gap-2 text-sm">
              {db.packStock.map((p) => (
                <li key={p.id}><div class="flex justify-between mb-1"><span>{p.name}</span><span class="num">{p.qty} {p.unit}</span></div><Progress value={(p.qty / (p.reorderAt * 3)) * 100} /></li>
              ))}
            </ul>
          </Card>
        </Section>
      </div>
    </WorkShell>
  );
}

export function Archive() {
  const list = ordersSig.value.filter((o) => o.stage === "archived");
  return (
    <WorkShell title="Archive" sub="Final cost rollup · records read-only · revenue never double-counted">
      <Card>
        <Table rows={list} rowKey={(o) => o.id} cols={[
          { key: "o", label: "Order", render: (o) => <b>{o.no} · {o.customer}</b> },
          { key: "t", label: "Type", render: (o) => TYPE_LABEL[o.type] },
          { key: "r", label: "Revenue", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
          { key: "m1", label: "Material", align: "right", render: (o) => inr(orderCost(o) * 0.45), hideTablet: true },
          { key: "m2", label: "Machine", align: "right", render: (o) => inr(orderCost(o) * 0.3), hideTablet: true },
          { key: "m3", label: "Pack + freight", align: "right", render: (o) => inr(orderCost(o) * 0.25), hideTablet: true },
          { key: "k", label: "Cost", align: "right", render: (o) => inr(orderCost(o)) },
          { key: "m", label: "Margin", align: "right", render: (o) => (o.type === "inhouse" ? "—" : `${Math.round((1 - orderCost(o) / orderTotal(o)) * 100)}%`) },
        ]} />
      </Card>
      <Card><div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><Fact label="Estimated cost" value={inr(3400)} /><Fact label="Actual cost" value={inr(4120)} /><Fact label="Drift" value="+21%" /><Fact label="Median cycle" value="8 days" /></div></Card>
    </WorkShell>
  );
}
