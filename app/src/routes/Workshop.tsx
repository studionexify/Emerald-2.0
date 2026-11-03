import { WORKSHOP_TABS } from "../nav";
import { Button, Card, CardTitle, Page, Progress, Section, Status, Table } from "../ui";
import { consSig, db, inr, packSig, shortDate, spoolsSig, X, type ConKind } from "../data";
import { useState } from "preact/hooks";
import { ConsumeForm } from "./work/shared";
import { Chip, Stat } from "../ui";

function Shell({ sub, actions, children }: { sub: string; actions?: preact.ComponentChildren; children: preact.ComponentChildren }) {
  return <Page title="Store" sub={sub} actions={actions ?? <Button icon="plus">Add</Button>} tabs={WORKSHOP_TABS}>{children}</Page>;
}
const RetireNote = () => <p class="text-xs text-c3">Retire — off every picker, old records keep the name. Delete — only for a row typed in by mistake.</p>;

export function Printers() {
  return (
    <Shell sub="Machines · utilisation, uptime, hours lost to blocks" actions={<Button icon="plus">Add printer</Button>}>
      <Card>
        <Table rows={db.printers} rowKey={(p) => p.id} cols={[
          { key: "n", label: "Printer", render: (p) => <b>{p.name}</b> },
          { key: "m", label: "Model", render: (p) => p.model },
          { key: "s", label: "Status", render: (p) => <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status> },
          { key: "u", label: "Util.", align: "right", render: (p) => `${X.machineLog.find((m) => m.printer === p.name)!.util}%` },
          { key: "f", label: "Fail rate", align: "right", render: (p) => `${X.machineLog.find((m) => m.printer === p.name)!.fail}%` },
          { key: "h", label: "Hours", align: "right", render: (p) => p.hours },
          { key: "a", label: "", render: () => <span class="flex gap-1"><Button variant="outline">Retire</Button><Button variant="ghost">Delete</Button></span> },
        ]} />
      </Card>
      <RetireNote />
    </Shell>
  );
}

export function Team() {
  return (
    <Shell sub="Who is on the floor — fills every 'who did this?' picker" actions={<Button icon="plus">Add member</Button>}>
      <Card>
        <Table rows={db.team} rowKey={(m) => m.id} cols={[
          { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
          { key: "r", label: "Role", render: (m) => m.role },
          { key: "e", label: "Email", render: (m) => m.email },
          { key: "s", label: "Active", render: () => <Status tone="done">Active</Status> },
          { key: "a", label: "", render: () => <span class="flex gap-1"><Button variant="outline">Retire</Button><Button variant="ghost">Delete</Button></span> },
        ]} />
      </Card>
      <RetireNote />
    </Shell>
  );
}

export function Filament() {
  const mats = [...new Set(spoolsSig.value.map((s) => s.material))];
  return (
    <Shell sub="Spools by material · batch, size, spool number · reorder at 1,000 g" actions={<Button icon="plus">Log movement</Button>}>
      <div class="grid gap-2 lg:grid-cols-2">
        {mats.map((m) => {
          const sp = spoolsSig.value.filter((s) => s.material === m), g = sp.reduce((s, x) => s + x.grams, 0);
          return (
            <Card key={m}>
              <CardTitle action={<span class="num text-sm">{g.toLocaleString("en-IN")} g · {inr((g / 1000) * 1250)}</span>}>{m}</CardTitle>
              <Progress value={Math.min(100, (g / 5000) * 100)} />
              <div class="text-xs text-c3 mt-1 mb-2">reorder at 1,000 g</div>
              <ul class="text-sm">
                {sp.map((s) => (
                  <li key={s.id} class="flex justify-between gap-2 py-1.5 border-t border-c1">
                    <span class="min-w-0">{s.colour} · {s.brand} <span class="text-c3 text-xs">{s.spoolNo}</span></span>
                    <span class="num whitespace-nowrap">{s.grams} g {s.grams < 1000 && <Status tone={s.grams === 0 ? "blocked" : "waiting"}>{s.grams === 0 ? "out" : "low"}</Status>}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
    </Shell>
  );
}

const stockCols = <T extends { name: string; unit: string; qty: number; reorderAt: number; cost: number }>() => [
  { key: "n", label: "Item", render: (p: T) => <b>{p.name}</b> },
  { key: "q", label: "Stock", align: "right" as const, render: (p: T) => `${p.qty} ${p.unit}` },
  { key: "r", label: "Reorder at", align: "right" as const, render: (p: T) => p.reorderAt },
  { key: "c", label: "Unit cost", align: "right" as const, render: (p: T) => inr(p.cost) },
  { key: "v", label: "Value", align: "right" as const, render: (p: T) => inr(p.cost * p.qty) },
  { key: "s", label: "", render: (p: T) => (p.qty <= p.reorderAt ? <Status tone="blocked">Reorder</Status> : <Status tone="done">OK</Status>) },
];

export function Parts() {
  return (
    <Shell sub="Magnets, NFC tags, inserts and machine spares" actions={<Button icon="plus">Log movement</Button>}>
      <Section title="Accessories"><Card><Table rows={X.accessories.filter((a) => a.cat === "Accessory")} rowKey={(a) => a.id} cols={stockCols()} /></Card></Section>
      <Section title="Parts & spares"><Card><Table rows={X.accessories.filter((a) => a.cat === "Part")} rowKey={(a) => a.id} cols={stockCols()} /></Card></Section>
    </Shell>
  );
}

export function PackStock() {
  return (
    <Shell sub="Boxes, wrap, tape — consumed at packing" actions={<Button icon="plus">Log movement</Button>}>
      <Card><Table rows={packSig.value} rowKey={(p) => p.id} cols={stockCols()} /></Card>
    </Shell>
  );
}

export function Movements() {
  return (
    <Shell sub="Receiving and consumption — every movement in and out" actions={<Button icon="plus">Receive stock</Button>}>
      <Card>
        <Table rows={X.movements} rowKey={(m) => m.id} cols={[
          { key: "i", label: "Item", render: (m) => <b>{m.item}</b> },
          { key: "d", label: "Date", render: (m) => shortDate(m.date) },
          { key: "x", label: "Direction", render: (m) => <Status tone={m.dir === "in" ? "done" : "active"}>{m.dir}</Status> },
          { key: "q", label: "Qty", align: "right", render: (m) => m.qty },
          { key: "c", label: "Cost", align: "right", render: (m) => (m.cost ? inr(m.cost) : "—") },
          { key: "v", label: "Vendor / use", render: (m) => m.vendor },
          { key: "b", label: "By", render: (m) => m.by },
        ]} />
      </Card>
    </Shell>
  );
}

export function ConsumptionLog() {
  const [k, setK] = useState<"all" | ConKind>("all");
  const rows = consSig.value.filter((c) => k === "all" || c.kind === k);
  const kinds = ["all", ...new Set(consSig.value.map((c) => c.kind))] as ("all" | ConKind)[];
  const by = (kk: string) => consSig.value.filter((c) => c.kind === kk).reduce((s, c) => s + c.cost, 0);
  return (
    <Shell sub="Everything used — filament, machine hours, power, labour, packing, parts, freight, scrap" actions={<span />}>
      <div class="grid grid-cols-3 md:grid-cols-6 gap-2">
        <Stat value={inr(consSig.value.reduce((s, c) => s + c.cost, 0))} label="Total" />
        {["filament", "machine", "packing", "labour", "scrap"].map((x) => <Stat key={x} value={inr(by(x))} label={x} />)}
      </div>
      <Card><div class="text-sm font-semibold mb-2">Log consumption (no order = store use)</div><ConsumeForm /></Card>
      <div class="flex flex-wrap gap-1.5">{kinds.map((x) => <Chip key={x} active={k === x} onClick={() => setK(x)}>{x === "all" ? "All" : x}</Chip>)}</div>
      <Card>
        <Table rows={rows} rowKey={(c) => c.id} cols={[
          { key: "i", label: "Item", render: (c) => <b>{c.item}</b> },
          { key: "k", label: "Kind", render: (c) => <span class="capitalize">{c.kind}</span> },
          { key: "q", label: "Qty", align: "right", render: (c) => `${c.qty} ${c.unit}` },
          { key: "c", label: "Cost", align: "right", render: (c) => inr(c.cost) },
          { key: "o", label: "Order · batch", render: (c) => (c.orderNo ? `${c.orderNo}${c.batch ? " · " + c.batch : ""}` : "Store") },
          { key: "p", label: "Printer", render: (c) => c.printer ?? "—", hideTablet: true },
          { key: "a", label: "When · who", render: (c) => `${c.at} · ${c.who}` },
        ]} />
      </Card>
    </Shell>
  );
}
