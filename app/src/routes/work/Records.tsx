import { useState } from "preact/hooks";
import { Button, Card, Chip, Status, Table } from "../../ui";
import { inr, shortDate, X } from "../../data";
import { WorkShell } from "./shared";

export function Clients() {
  return (
    <WorkShell title="Clients" sub="Client records — individuals and businesses" actions={<Button icon="plus">New client</Button>}>
      <Card>
        <Table rows={X.clients} rowKey={(c) => c.id} cols={[
          { key: "n", label: "Client", render: (c) => <b>{c.name}</b> },
          { key: "k", label: "Kind", render: (c) => c.kind },
          { key: "p", label: "Phone", render: (c) => c.phone },
          { key: "c", label: "City", render: (c) => c.city, hideTablet: true },
          { key: "g", label: "GSTIN", render: (c) => c.gstin || "—", hideTablet: true },
          { key: "m", label: "Came via", render: (c) => c.medium },
          { key: "o", label: "Orders", align: "right", render: (c) => c.orders },
          { key: "v", label: "Lifetime", align: "right", render: (c) => inr(c.value) },
        ]} />
      </Card>
    </WorkShell>
  );
}

export function Quotes() {
  const [f, setF] = useState("all");
  const rows = X.quotes.filter((q) => f === "all" || q.outcome === f);
  return (
    <WorkShell title="Quotation register" sub="Every quote, with its outcome — unknown is never folded into lost" actions={<Button icon="plus">New quotation</Button>}
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "open", "approved", "lost", "unrecorded"].map((s) => <Chip key={s} active={f === s} onClick={() => setF(s)}>{s[0].toUpperCase() + s.slice(1)}</Chip>)}</div>}>
      <Card>
        <Table rows={rows} rowKey={(q) => q.id} cols={[
          { key: "n", label: "Quote", render: (q) => <b>{q.no}</b> },
          { key: "d", label: "Date", render: (q) => shortDate(q.date) },
          { key: "c", label: "Customer", render: (q) => q.customer },
          { key: "v", label: "Valid till", render: (q) => shortDate(q.valid) },
          { key: "o", label: "Outcome", render: (q) => <Status tone={q.outcome === "approved" ? "done" : q.outcome === "lost" ? "blocked" : q.outcome === "open" ? "waiting" : "idle"}>{q.outcome}</Status> },
          { key: "a", label: "Value", align: "right", render: (q) => inr(q.value) },
        ]} />
      </Card>
    </WorkShell>
  );
}

export function Documents() {
  return (
    <WorkShell title="Documents" sub="Quotation / invoice generator and historical paperwork" actions={<><Button variant="outline">Open generator</Button><Button icon="plus">New document</Button></>}>
      <Card>
        <Table rows={X.documents} rowKey={(d) => d.id} cols={[
          { key: "n", label: "Number", render: (d) => <b>{d.no}</b> },
          { key: "k", label: "Kind", render: (d) => d.kind },
          { key: "p", label: "Party", render: (d) => d.party },
          { key: "d", label: "Date", render: (d) => shortDate(d.date) },
          { key: "a", label: "", render: () => <span class="flex gap-1"><Button variant="ghost">View</Button><Button variant="ghost">Print</Button></span> },
        ]} />
      </Card>
    </WorkShell>
  );
}
