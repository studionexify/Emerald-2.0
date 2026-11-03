import { useState } from "preact/hooks";
import { SETTINGS_TABS } from "../nav";
import { Button, Card, Chip, Field, inputCls, PageHead, Status, Table, Tabs } from "../ui";
import { db, shortDate } from "../data";

export function Todo() {
  const [tasks, setTasks] = useState(db.tasks);
  const [f, setF] = useState<"open" | "done">("open");
  const list = tasks.filter((t) => (f === "open" ? !t.done : t.done));
  return (
    <>
      <PageHead title="To-do" sub="Master list — every task can link to an order, job, printer, bill…" actions={<Button icon="plus">New task</Button>} />
      <div class="flex gap-2 mb-4"><Chip active={f === "open"} onClick={() => setF("open")}>Open</Chip><Chip active={f === "done"} onClick={() => setF("done")}>Done</Chip></div>
      <Card>
        <ul>
          {list.map((t) => (
            <li key={t.id} class="flex items-center gap-3 py-3 border-t border-c1 first:border-0">
              <button aria-label={t.done ? "Mark open" : "Mark done"} onClick={() => setTasks(tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)))}
                class={`w-6 h-6 rounded-md border-2 border-c4 shrink-0 cursor-pointer ${t.done ? "bg-c4" : ""}`} />
              <div class="flex-1 min-w-0">
                <div class={`font-medium ${t.done ? "line-through text-c3" : ""}`}>{t.title}</div>
                <div class="text-xs text-c3">{t.who} · due {shortDate(t.due)}{t.repeat ? ` · repeats ${t.repeat}` : ""}</div>
              </div>
              {t.link && <span class="text-xs bg-c1 rounded-full px-3 py-1 whitespace-nowrap">{t.link.kind} · {t.link.ref}</span>}
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function Logs() {
  return (
    <>
      <PageHead title="Logs" sub="Who changed what, and when" />
      <Card>
        <Table rows={db.logs} rowKey={(l) => l.id} cols={[
          { key: "a", label: "When", render: (l) => l.at },
          { key: "w", label: "Who", render: (l) => <b>{l.who}</b> },
          { key: "x", label: "Action", render: (l) => l.action },
          { key: "t", label: "Record", render: (l) => l.target },
        ]} />
      </Card>
    </>
  );
}

export function Bin() {
  return (
    <>
      <PageHead title="Bin" sub="Deleted records — restore any time" />
      <Card>
        <Table rows={db.bin} rowKey={(b) => b.id} cols={[
          { key: "k", label: "Kind", render: (b) => <Status tone="idle">{b.kind}</Status> },
          { key: "l", label: "Record", render: (b) => <b>{b.label}</b> },
          { key: "d", label: "Deleted", render: (b) => `${shortDate(b.deletedAt)} by ${b.by}` },
          { key: "r", label: "", render: () => <Button variant="outline">Restore</Button> },
        ]} />
      </Card>
    </>
  );
}

function SettingsShell({ children }: { children: preact.ComponentChildren }) {
  return (
    <>
      <PageHead title="Settings" />
      <div class="mb-5"><Tabs tabs={SETTINGS_TABS} /></div>
      <div class="max-w-2xl">{children}</div>
    </>
  );
}

export function Profile() {
  return (
    <SettingsShell>
      <Card class="flex flex-col gap-4">
        <Field label="Name"><input class={inputCls} value="You" /></Field>
        <Field label="Email"><input class={inputCls} value="owner@studionexify.com" /></Field>
        <div class="flex gap-2"><Button>Save</Button><Button variant="outline">Change password</Button></div>
      </Card>
    </SettingsShell>
  );
}

export function Users() {
  return (
    <SettingsShell>
      <Card>
        <Table rows={db.team} rowKey={(m) => m.id} cols={[
          { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
          { key: "r", label: "Role", render: (m) => m.role },
          { key: "e", label: "Email", render: (m) => m.email },
        ]} />
      </Card>
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
        <div class="sm:col-span-2"><Field label="Address"><input class={inputCls} placeholder="Vadodara, Gujarat" /></Field></div>
        <div><Button>Save</Button></div>
      </Card>
    </SettingsShell>
  );
}
