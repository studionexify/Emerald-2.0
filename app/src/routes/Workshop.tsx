import { WORKSHOP_TABS } from "../nav";
import { Button, Card, PageHead, Progress, Status, Table, Tabs } from "../ui";
import { db, inr } from "../data";

function Shell({ children }: { children: preact.ComponentChildren }) {
  return (
    <>
      <PageHead title="Workshop & Inventory" sub="Printers, team, filament and packing stock" actions={<Button icon="plus">Add</Button>} />
      <div class="mb-5"><Tabs tabs={WORKSHOP_TABS} /></div>
      {children}
    </>
  );
}

export function Printers() {
  return (
    <Shell>
      <Card>
        <Table rows={db.printers} rowKey={(p) => p.id} cols={[
          { key: "n", label: "Printer", render: (p) => <b>{p.name}</b> },
          { key: "m", label: "Model", render: (p) => p.model },
          { key: "s", label: "Status", render: (p) => <Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status> },
          { key: "h", label: "Hours", align: "right", render: (p) => p.hours },
          { key: "a", label: "", render: () => <Button variant="ghost">Retire</Button> },
        ]} />
      </Card>
    </Shell>
  );
}

export function Team() {
  return (
    <Shell>
      <Card>
        <Table rows={db.team} rowKey={(m) => m.id} cols={[
          { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
          { key: "r", label: "Role", render: (m) => m.role },
          { key: "e", label: "Email", render: (m) => m.email },
        ]} />
      </Card>
    </Shell>
  );
}

export function Filament() {
  return (
    <Shell>
      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {db.spools.map((s) => (
          <Card key={s.id} dark={s.grams === 0}>
            <div class="flex justify-between text-sm opacity-80"><span>{s.spoolNo}</span><span>{s.brand}</span></div>
            <div class="font-semibold text-lg mt-1">{s.material} · {s.colour}</div>
            <div class="num text-4xl font-semibold mt-4">{(s.grams / 1000).toFixed(1)}kg</div>
            <div class="text-sm opacity-80 mb-3">{s.grams === 0 ? "Out of stock" : `${Math.round(s.grams / s.size)} spools left`}</div>
            {s.grams > 0 && <Progress value={Math.min(100, (s.grams / 3000) * 100)} />}
          </Card>
        ))}
      </div>
    </Shell>
  );
}

export function PackStock() {
  return (
    <Shell>
      <Card>
        <Table rows={db.packStock} rowKey={(p) => p.id} cols={[
          { key: "n", label: "Item", render: (p) => <b>{p.name}</b> },
          { key: "q", label: "In stock", align: "right", render: (p) => `${p.qty} ${p.unit}` },
          { key: "r", label: "Reorder at", align: "right", render: (p) => p.reorderAt },
          { key: "c", label: "Unit cost", align: "right", render: (p) => inr(p.cost) },
          { key: "s", label: "", render: (p) => (p.qty <= p.reorderAt ? <Status tone="blocked">Reorder</Status> : <Status tone="done">OK</Status>) },
        ]} />
      </Card>
    </Shell>
  );
}
