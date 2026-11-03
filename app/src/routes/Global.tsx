import { useState } from "preact/hooks";
import { SETTINGS_TABS } from "../nav";
import { Button, Card, CardTitle, Chip, Field, inputCls, Page, Section, Status, Table } from "../ui";
import { db, logsSig, shortDate, X } from "../data";

export function Todo() {
  const [tasks, setTasks] = useState(db.tasks);
  const [f, setF] = useState<"open" | "done" | "repeat">("open");
  const list = tasks.filter((t) => (f === "repeat" ? !!t.repeat : f === "open" ? !t.done : t.done));
  return (
    <Page title="To-do" sub="Master list — every task can link to an order, job, printer, bill…" actions={<Button icon="plus">New task</Button>}
      toolbar={<div class="flex flex-wrap gap-1.5"><Chip active={f === "open"} onClick={() => setF("open")}>Open ({tasks.filter((t) => !t.done).length})</Chip><Chip active={f === "done"} onClick={() => setF("done")}>Done</Chip><Chip active={f === "repeat"} onClick={() => setF("repeat")}>Recurring</Chip></div>}>
      <Card>
        <ul>
          {list.map((t) => (
            <li key={t.id} class="flex items-center gap-3 py-2 border-t border-c1 first:border-0">
              <button aria-label={t.done ? "Mark open" : "Mark done"} onClick={() => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                class={`w-6 h-6 rounded-md border-2 border-c4 shrink-0 cursor-pointer ${t.done ? "bg-c4" : ""}`} />
              <div class="flex-1 min-w-0">
                <div class={`text-sm font-medium ${t.done ? "line-through text-c3" : ""}`}>{t.title}</div>
                <div class="text-xs text-c3">{t.who} · due {shortDate(t.due)}{t.repeat ? ` · repeats ${t.repeat}` : ""}</div>
              </div>
              {t.link && <span class="text-xs bg-c1 rounded-full px-3 py-1 whitespace-nowrap">{t.link.kind} · {t.link.ref}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}

export function Logs() {
  const [who, setWho] = useState("all");
  const [kind, setKind] = useState("all");
  const people = ["all", ...new Set(logsSig.value.map((l) => l.who))];
  return (
    <Page title="Logs" sub="Who changed what, and when — stamped from the signed-in account"
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "order", "consumption", "stock", "money"].map((x) => <Chip key={x} active={kind === x} onClick={() => setKind(x)}>{x === "all" ? "All kinds" : x}</Chip>)}<span class="w-px bg-c2 mx-1" />{people.map((p) => <Chip key={p} active={who === p} onClick={() => setWho(p)}>{p === "all" ? "Everyone" : p}</Chip>)}</div>}>
      <Card>
        <Table rows={logsSig.value.filter((l) => (who === "all" || l.who === who) && (kind === "all" || (l.kind ?? "order") === kind))} rowKey={(l) => l.id} cols={[
          { key: "a", label: "When", render: (l) => l.at },
          { key: "w", label: "Who", render: (l) => <b>{l.who}</b> },
          { key: "x", label: "Action", render: (l) => l.action },
          { key: "t", label: "Record", render: (l) => l.target },
        ]} />
      </Card>
    </Page>
  );
}

export function Bin() {
  const left = (d: string) => Math.max(0, 7 - Math.round((Date.parse("2026-11-03") - Date.parse(d)) / 864e5));
  const kinds = [...new Set(db.bin.map((b) => b.kind))];
  return (
    <Page title="Bin" sub="Recoverable for 7 days · grouped by kind">
      {kinds.map((k) => (
        <Section key={k} title={k} note={String(db.bin.filter((b) => b.kind === k).length)}>
          <Card>
            <Table rows={db.bin.filter((b) => b.kind === k)} rowKey={(b) => b.id} cols={[
              { key: "l", label: "Record", render: (b) => <b>{b.label}</b> },
              { key: "d", label: "Deleted", render: (b) => `${shortDate(b.deletedAt)} by ${b.by}` },
              { key: "x", label: "Left", render: (b) => <Status tone={left(b.deletedAt) <= 2 ? "blocked" : "waiting"}>{left(b.deletedAt)} days left</Status> },
              { key: "r", label: "", render: () => <Button variant="outline">Restore</Button> },
            ]} />
          </Card>
        </Section>
      ))}
    </Page>
  );
}

export function Alerts() {
  const tone = { danger: "blocked", warn: "waiting", info: "idle" } as const;
  const groups = Object.entries(X.alerts);
  return (
    <Page title="Attention" sub="What needs action — escalates on age, every row links to its record">
      <div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-4">
        {groups.map(([g, list]) => (
          <Card key={g}>
            <CardTitle action={<span class="num text-xs text-c3">{list.length}</span>}>{g}</CardTitle>
            <ul class="flex flex-col">
              {[...list].sort((a, b) => ["danger", "warn", "info"].indexOf(a.t) - ["danger", "warn", "info"].indexOf(b.t)).map((a, i) => (
                <li key={i} class="border-t border-c1 first:border-0"><a href={a.href} class="flex items-start gap-2 py-2 text-sm"><Status tone={tone[a.t]}>{""}</Status><span class="min-w-0">{a.text}</span></a></li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </Page>
  );
}

function SettingsShell({ children }: { children: preact.ComponentChildren }) {
  return (
    <Page title="Settings"  tabs={SETTINGS_TABS}>
      <div class="max-w-5xl flex flex-col gap-4">{children}</div>
    </Page>
  );
}

export function Profile() {
  return (
    <SettingsShell>
      <Card class="flex flex-col gap-3">
        <Field label="Name"><input class={inputCls} value="You" /></Field>
        <Field label="Email"><input class={inputCls} value="owner@studionexify.com" /></Field>
        <Field label="Display name (greeting only — audit uses your account)"><input class={inputCls} value="Ankit" /></Field>
        <div class="grid sm:grid-cols-2 gap-3"><Field label="Current password"><input class={inputCls} type="password" /></Field><Field label="New password"><input class={inputCls} type="password" /></Field></div>
        <div class="flex flex-wrap gap-2"><Button>Save</Button><Button variant="outline">Change password</Button><Button variant="outline">Set up passkey quick-unlock</Button><Button variant="ghost">Email reset link</Button></div>
      </Card>
    </SettingsShell>
  );
}

export function Users() {
  return (
    <SettingsShell>
      <Section title="Role matrix">
        <Card>
          <Table rows={X.roles} rowKey={(r) => r.id} cols={[
            { key: "r", label: "Role", render: (r) => <b>{r.role}</b> }, { key: "o", label: "Orders", render: (r) => r.orders }, { key: "p", label: "Production", render: (r) => r.production },
            { key: "f", label: "Finance", render: (r) => r.finance }, { key: "b", label: "Books", render: (r) => r.books }, { key: "s", label: "Settings", render: (r) => r.settings }]} />
        </Card>
      </Section>
      <Section title="Users" action={<Button variant="outline" icon="plus">Add user</Button>}>
      <Card>
        <Table rows={db.team} rowKey={(m) => m.id} cols={[
          { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
          { key: "r", label: "Role", render: (m) => m.role },
          { key: "e", label: "Email", render: (m) => m.email },
          { key: "x", label: "", render: () => <Button variant="ghost">Reset password</Button> },
        ]} />
      </Card>
      </Section>
    </SettingsShell>
  );
}

export function Business() {
  return (
    <SettingsShell>
      <Card class="grid sm:grid-cols-2 gap-4">
        <Field label="Business name"><input class={inputCls} value="Studio Nexify" /></Field>
        <Field label="GSTIN"><input class={inputCls} placeholder="24XXXXX0000X1Z5" /></Field>
        <Field label="Phone"><input class={inputCls} placeholder="+91" /></Field>
        <Field label="Email"><input class={inputCls} value="connect@studionexify.com" /></Field>
        <Field label="PAN"><input class={inputCls} /></Field>
        <Field label="Udyam (MSME) no."><input class={inputCls} /></Field>
        <div class="sm:col-span-2"><Field label="Address"><input class={inputCls} placeholder="Vadodara, Gujarat" /></Field></div>
        <Field label="Bank (shown on invoices)"><input class={inputCls} placeholder="HDFC ··4421 · IFSC" /></Field>
        <Field label="Invoice series"><input class={inputCls} value="B/26-27/####" /></Field>
        <Field label="Payment terms (days)"><input class={inputCls} value="30" /></Field>
        <Field label="Logo"><input class={inputCls} type="file" accept="image/*" /></Field>
        <div><Button>Save</Button></div>
      </Card>
    </SettingsShell>
  );
}

export function Integrations() {
  const rows = [
    { id: "1", n: "Google Drive", d: "Bills filed to “Emerald — Purchase Documents / FY”", s: true, a: "Reconnect" },
    { id: "2", n: "Bill reader", d: "Claude or Gemini — picks per upload, remembers the last", s: true, a: "Choose model" },
    { id: "3", n: "Tally export", d: "Vouchers as Tally XML", s: true, a: "Export" },
    { id: "4", n: "Email (password reset)", d: "Reset links go to the studio mailbox only", s: false, a: "Set up" },
  ];
  return (
    <SettingsShell>
      <Card>
        <Table rows={rows} rowKey={(r) => r.id} cols={[
          { key: "n", label: "Service", render: (r) => <b>{r.n}</b> }, { key: "d", label: "What it does", render: (r) => r.d },
          { key: "s", label: "Status", render: (r) => <Status tone={r.s ? "done" : "waiting"}>{r.s ? "Connected" : "Not set"}</Status> },
          { key: "a", label: "", render: (r) => <Button variant="outline">{r.a}</Button> }]} />
      </Card>
    </SettingsShell>
  );
}

import { RatesEditor } from "./Calculator";
export function Rates() { return <SettingsShell><RatesEditor /></SettingsShell>; }
