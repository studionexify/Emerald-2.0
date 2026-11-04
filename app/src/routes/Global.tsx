import { useState } from "preact/hooks";
import { SETTINGS_TABS } from "../nav";
import { Pick, Button, Card, CardTitle, Empty, Field, Icon, inputCls, Page, Section, Status, Table } from "../ui";
import { Actions, Inspect, useRecord, type FDef } from "../ui/record";
import { tasksSig, binSig, restoreBin, purgeBin, canRestore, teamNames, today, uid, log, type Task, type Log, type Binned, attention, batchesSig, can, changePassword, logsSig, MATRIX, me, packSig, resetAll, resetPassword, ROLE_LABEL, saveUser, shortDate, spoolsSig, usersSig, X, type Role, type User } from "../data";

const tFields: FDef<Task>[] = [
  { k: "title", label: "Task", wide: true }, { k: "due", label: "Due", type: "date" },
  { k: "who", label: "Assigned to", type: "select", options: () => ["You", ...teamNames()] },
  { k: "priority", label: "Priority", type: "select", options: ["Normal", "High", "Low"] },
  { k: "repeat", label: "Repeats", type: "select", options: ["", "Daily", "Weekly", "Monthly"] },
  { k: "notes", label: "Notes", type: "textarea" },
];
export function Todo() {
  const [f, setF] = useState<"open" | "done" | "repeat" | "mine">("open");
  const tasks = tasksSig.value;
  const r = useRecord<Task>({ sig: tasksSig, kind: "Task", title: (t) => t.title || "Task", fields: tFields, logKind: "order", noDuplicate: true,
    blank: () => ({ id: uid(), title: "", due: today(), done: false, who: me.value?.name ?? "You", priority: "Normal", repeat: "", notes: "" }),
    facts: (t) => [["State", <Status tone={t.done ? "done" : t.due < today() ? "blocked" : "waiting"}>{t.done ? "Done" : t.due < today() ? "Overdue" : "Open"}</Status>], ["Linked to", t.link ? `${t.link.kind} · ${t.link.ref}` : "—"]],
    actions: (t, put) => <Button variant="outline" icon="check" onClick={() => put({ done: !t.done }, t.done ? "Reopened task" : "Completed task")}>{t.done ? "Reopen" : "Mark done"}</Button> });
  const list = tasks.filter((t) => (f === "repeat" ? !!t.repeat : f === "mine" ? t.who === (me.value?.name ?? "You") || t.who === "You" : f === "open" ? !t.done : t.done)).sort((x, y) => x.due.localeCompare(y.due));
  return (
    <Page title="To-do" sub="Master list — every task can link to an order, job, printer, bill…" actions={<Button icon="plus" onClick={() => r.add()}>New task</Button>} detail={r.detail}
      toolbar={<Pick title="Show" value={f} on={setF} items={["open", "mine", "done", "repeat"] as const} label={(k) => ({ open: `Open (${tasks.filter((t) => !t.done).length})`, mine: "Mine", done: "Done", repeat: "Recurring" })[k]} />}>
      <Card>
        {list.length ? <ul>
          {list.map((t) => (
            <li key={t.id} class="flex items-center gap-3 py-2.5 border-t border-c1 first:border-0">
              <button aria-label={t.done ? "Mark open" : "Mark done"} onClick={() => { tasksSig.value = tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)); log(t.done ? "Reopened task" : "Completed task", t.title); }}
                class={`w-6 h-6 rounded-md border-2 border-c4 shrink-0 cursor-pointer flex items-center justify-center ${t.done ? "bg-c4 text-c0" : ""}`}>{t.done && <Icon name="check" size={14} />}</button>
              <button class="flex-1 min-w-0 text-left cursor-pointer" onClick={() => r.open(t)}>
                <div class={`text-sm font-semibold ${t.done ? "line-through text-c3 font-normal" : ""}`}>{t.title}{t.priority === "High" && <span class="ml-2 text-[10px] uppercase tracking-wider font-extrabold">High</span>}</div>
                <div class="text-xs text-c3">{t.who} · due {shortDate(t.due)}{t.repeat ? ` · repeats ${t.repeat}` : ""}</div>
              </button>
              {t.link && <span class="hidden sm:inline text-xs bg-c1 rounded-full px-3 py-1 whitespace-nowrap">{t.link.kind} · {t.link.ref}</span>}
            </li>
          ))}
        </ul> : <Empty title="Nothing here" action={<Button icon="plus" onClick={() => r.add()}>New task</Button>} />}
      </Card>
    </Page>
  );
}

export function Logs() {
  const [who, setWho] = useState("all");
  const [kind, setKind] = useState("all");
  const [open, setOpen] = useState<Log | null>(null);
  const people = ["all", ...new Set(logsSig.value.map((l) => l.who))];
  return (
    <Page title="Logs" sub="Who changed what, and when — stamped from the signed-in account" detail={open && <Inspect title={open.action} row={{ when: open.at, who: open.who, action: open.action, record: open.target, kind: open.kind ?? "order" }} onClose={() => setOpen(null)} />}
      toolbar={<div class="flex flex-wrap items-center gap-2"><Pick title="Kind" value={kind} on={setKind} items={["all", "order", "consumption", "stock", "money"]} label={(x) => x === "all" ? "All kinds" : x[0].toUpperCase() + x.slice(1)} /><Pick title="Who" value={who} on={setWho} items={people} label={(p) => (p === "all" ? "Everyone" : p)} /></div>}>
      <Card>
        <Table rows={logsSig.value.filter((l) => (who === "all" || l.who === who) && (kind === "all" || (l.kind ?? "order") === kind))} rowKey={(l) => l.id} onRow={setOpen} cols={[
          { key: "x", label: "Action", render: (l) => l.action },
          { key: "t", label: "Record", render: (l) => l.target },
          { key: "w", label: "Who", render: (l) => l.who },
          { key: "a", label: "When", render: (l) => <span class="text-c3">{l.at}</span> },
        ]} />
      </Card>
    </Page>
  );
}

export function Bin() {
  const left = (d: string) => Math.max(0, 7 - Math.round((Date.parse(today()) - Date.parse(d)) / 864e5));
  const items = binSig.value;
  const kinds = [...new Set(items.map((b) => b.kind))];
  const [open, setOpen] = useState<Binned | null>(null);
  return (
    <Page title="Bin" sub="Recoverable for 7 days · grouped by kind" detail={open && <Inspect title={open.label} row={{ kind: open.kind, deleted: shortDate(open.deletedAt), by: open.by, daysLeft: left(open.deletedAt), ...(open.data && typeof open.data === "object" ? open.data as Record<string, unknown> : {}) }} onClose={() => setOpen(null)}>
      <Actions>{canRestore(open) && <Button onClick={() => { restoreBin(open); log("Restored from Bin", open.label); setOpen(null); }}>Restore</Button>}<Button variant="ghost" icon="bin" onClick={() => { if (confirm("Delete forever?")) { purgeBin(open); setOpen(null); } }}>Delete forever</Button></Actions></Inspect>}>
      {!items.length && <Card><Empty title="The Bin is empty" hint="Deleted records stay here for 7 days." /></Card>}
      {kinds.map((k) => (
        <Section key={k} title={k} note={String(items.filter((b) => b.kind === k).length)}>
          <Card>
            <Table rows={items.filter((b) => b.kind === k)} rowKey={(b) => b.id} onRow={setOpen} cols={[
              { key: "l", label: "Record", render: (b) => b.label },
              { key: "d", label: "Deleted", render: (b) => `${shortDate(b.deletedAt)} by ${b.by}` },
              { key: "x", label: "Left", render: (b) => <Status tone={left(b.deletedAt) <= 2 ? "blocked" : "waiting"}>{left(b.deletedAt)} days</Status> },
              { key: "r", label: "", align: "right", render: (b) => canRestore(b) ? <Button variant="outline" onClick={(e) => { e.stopPropagation(); restoreBin(b); log("Restored from Bin", b.label); }}>Restore</Button> : <span class="text-xs text-c3">Needs server</span> },
            ]} />
          </Card>
        </Section>
      ))}
    </Page>
  );
}

export function Alerts() {
  const tone = { danger: "blocked", warn: "waiting", info: "idle" } as const;
  const groups = Object.entries(attention(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value));
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
              {!list.length && <li class="text-sm text-c3 py-1">Nothing here — all clear.</li>}
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
  const [cur, setCur] = useState(""), [nx, setNx] = useState(""), [msg, setMsg] = useState("");
  const u = me.value!;
  return (
    <SettingsShell>
      <Card class="flex flex-col gap-3">
        <div class="text-sm"><b>{u.name}</b> · {u.email} · {ROLE_LABEL[u.role]}</div>
        <p class="text-xs text-c3">Every audit field (approved by, checked by, packed by, logged by) is stamped with this account.</p>
        <div class="grid sm:grid-cols-2 gap-3">
          <Field label="Current password"><input class={inputCls} type="password" value={cur} onInput={(e) => setCur((e.target as HTMLInputElement).value)} /></Field>
          <Field label="New password (8+ characters)"><input class={inputCls} type="password" value={nx} onInput={(e) => setNx((e.target as HTMLInputElement).value)} /></Field>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button onClick={() => { const e = changePassword(cur, nx); setMsg(e ?? "Password changed"); if (!e) { setCur(""); setNx(""); } }}>Change password</Button>
          <Button variant="outline" onClick={() => setMsg("Passkey quick-unlock needs the server (WebAuthn) — arrives with the backend.")}>Set up passkey</Button>
        </div>
        {msg && <p class="text-sm font-medium" role="status">{msg}</p>}
      </Card>
      {can("settings", "full") && <Card class="flex flex-wrap items-center justify-between gap-2"><span class="text-sm">Prototype data is saved on this device.</span><Button variant="outline" onClick={() => confirm("Erase all local data and reload the sample data?") && resetAll()}>Reset sample data</Button></Card>}
    </SettingsShell>
  );
}

export function Users() {
  const [edit, setEdit] = useState<User | null>(null);
  const mods = ["work", "workshop", "mauny", "books", "gst", "settings"] as const;
  const owner = can("settings", "full");
  return (
    <SettingsShell>
      <Section title="Role matrix">
        <Card>
          <Table rows={Object.keys(MATRIX).map((r) => ({ r: r as Role }))} rowKey={(x) => x.r} cols={[
            { key: "r", label: "Role", render: (x) => <b>{ROLE_LABEL[x.r]}</b> },
            ...mods.map((m) => ({ key: m, label: m, render: (x: { r: Role }) => MATRIX[x.r][m] ?? "none" })),
          ]} />
        </Card>
      </Section>
      <Section title="Team & users" note={`${usersSig.value.filter((u) => u.active).length} active`} action={owner && <Button variant="outline" icon="plus" onClick={() => setEdit({ id: crypto.randomUUID(), name: "", email: "", role: "operator", pass: "", active: true, login: false, job: "" })}>Add person</Button>}>
        <p class="text-xs text-c3">One list: everyone on the floor fills the “who did this?” pickers. Turn on <b>Login</b> for people who use Emerald themselves. Retire — off every picker, old records keep the name.</p>
        {edit && (
          <Card class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6 items-end">
            <Field label="Name"><input class={inputCls} value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Email"><input class={inputCls} value={edit.email} onInput={(e) => setEdit({ ...edit, email: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Job title"><input class={inputCls} value={edit.job} onInput={(e) => setEdit({ ...edit, job: (e.target as HTMLInputElement).value })} /></Field>
            <label class="flex items-center gap-2 text-sm h-10"><input type="checkbox" checked={edit.login} onChange={() => setEdit({ ...edit, login: !edit.login })} /> Can log in</label>
            <Field label="Access role"><select class={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: (e.target as HTMLSelectElement).value as Role })}>{Object.keys(MATRIX).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}</select></Field>
            <div class="flex gap-2"><Button onClick={() => { saveUser(edit); setEdit(null); }}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
          </Card>
        )}
        <Card>
          <Table rows={usersSig.value} rowKey={(m) => m.id} onRow={owner ? setEdit : undefined} cols={[
            { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
            { key: "j", label: "Job", render: (m) => m.job || "—" },
            { key: "r", label: "Access", render: (m) => ROLE_LABEL[m.role] },
            { key: "l", label: "Login", render: (m) => <Status tone={m.login ? "done" : "idle"}>{m.login ? "Yes" : "No"}</Status> },
            { key: "e", label: "Email", render: (m) => m.email || "—", hideTablet: true },
            { key: "s", label: "Status", render: (m) => <Status tone={m.active ? "done" : "idle"}>{m.active ? "Active" : "Retired"}</Status> },
            { key: "x", label: "", align: "right", render: (m) => owner && <span class="inline-flex flex-wrap justify-end gap-1" onClick={(e) => e.stopPropagation()}><Button variant="ghost" onClick={() => setEdit(m)}>Edit</Button><Button variant="ghost" onClick={() => { resetPassword(m.id); alert("Password reset to the default; ask them to change it."); }}>Reset password</Button><Button variant="ghost" onClick={() => saveUser({ ...m, active: !m.active })}>{m.active ? "Retire" : "Restore"}</Button></span> },
          ]} />
        </Card>
      </Section>
    </SettingsShell>
  );
}

export function Business() {
  const b = bizSig.value;
  const f = (k: keyof Biz, l: string, wide = false) => <div class={wide ? "sm:col-span-2" : ""}><Field label={l}><input class={inputCls} value={b[k]} onInput={(e) => (bizSig.value = { ...bizSig.value, [k]: (e.target as HTMLInputElement).value })} /></Field></div>;
  return (
    <SettingsShell>
      <Card class="grid sm:grid-cols-2 gap-3">
        {f("name", "Business name")}{f("gstin", "GSTIN")}{f("pan", "PAN")}{f("udyam", "Udyam (MSME) no.")}{f("phone", "Phone")}{f("email", "Email")}
        {f("address", "Address", true)}{f("bank", "Bank (shown on invoices)", true)}{f("series", "Invoice series")}{f("terms", "Terms printed on documents", true)}
        <p class="sm:col-span-2 text-xs text-c3">Saved as you type · printed on every quotation, invoice and credit note.</p>
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
          { key: "a", label: "", align: "right", render: (r) => <Button variant="outline" onClick={() => r.n === "Tally export" ? navigate("/mauny/books") : r.n === "Bill reader" ? navigate("/mauny/purchases") : alert(`${r.n} connects through the server — it is wired when the database goes live.`)}>{r.a}</Button> }]} />
      </Card>
    </SettingsShell>
  );
}

import { RatesEditor } from "./Calculator";
import { navigate } from "../router";
import { bizSig, type Biz } from "../data/biz";
export function Rates() { return <SettingsShell><RatesEditor /></SettingsShell>; }

import { searchQ } from "../data/search";
import { ordersSig, invoicesSig, quotesSig, expensesSig, billsSig } from "../data";
import { NAV, WORK_TABS, MAUNY_TABS, WORKSHOP_TABS, CALC_TABS } from "../nav";
export function Search() {
  const q = searchQ.value.trim().toLowerCase();
  const hit = (...xs: (string | undefined)[]) => !!q && xs.some((x) => x?.toLowerCase().includes(q));
  const pages = [...NAV, ...WORK_TABS, ...MAUNY_TABS, ...WORKSHOP_TABS, ...CALC_TABS, ...SETTINGS_TABS].filter((p) => hit(p.label));
  const groups: [string, { k: string; t: string; d: string; href: string }[]][] = [
    ["Orders", ordersSig.value.filter((o) => hit(o.no, o.customer, ...o.items.map((i) => i.name))).map((o) => ({ k: o.id, t: `${o.no} · ${o.customer}`, d: o.items.map((i) => i.name).join(", "), href: "/work/orders" }))],
    ["Customers", [...new Set(ordersSig.value.map((o) => o.customer).concat(X.clients.map((c) => c.name)))].filter((c) => hit(c)).map((c) => ({ k: c, t: c, d: "Client", href: "/work/clients" }))],
    ["Invoices", invoicesSig.value.filter((i) => hit(i.no, i.customer, i.orderNo)).map((i) => ({ k: i.id, t: `${i.no} · ${i.customer}`, d: i.kind, href: "/work/invoice" }))],
    ["Quotations", quotesSig.value.filter((x) => hit(x.no, x.customer)).map((x) => ({ k: x.id, t: `${x.no} · ${x.customer}`, d: x.outcome, href: "/work/quotes" }))],
    ["Bills & expenses", [...billsSig.value.filter((b) => hit(b.vendor, b.no)).map((b) => ({ k: b.id, t: `${b.vendor} ${b.no}`, d: "Bill", href: "/mauny/purchases" })), ...expensesSig.value.filter((e) => hit(e.vendor, e.head)).map((e) => ({ k: e.id, t: `${e.vendor} · ${e.head}`, d: "Expense", href: "/mauny/finance" }))]],
    ["Pages", pages.map((p) => ({ k: p.href, t: p.label, d: p.href, href: p.href }))],
  ];
  const any = groups.some(([, l]) => l.length);
  return (
    <Page title="Search" sub="Orders, customers, invoice and quote numbers, bills, every page">
      {!q ? <Empty title="Type in the search bar" hint="Ctrl / ⌘ K focuses it from anywhere." /> : !any ? <Empty title={`Nothing matches “${searchQ.value}”`} /> : (
        <div class="grid gap-2 md:grid-cols-2 2xl:grid-cols-3">
          {groups.filter(([, l]) => l.length).map(([g, l]) => (
            <Card key={g}><CardTitle action={<span class="text-xs text-c3">{l.length}</span>}>{g}</CardTitle>
              <ul>{l.slice(0, 12).map((r) => <li key={r.k} class="border-t border-c1 first:border-0"><a href={r.href} class="block py-1.5 text-sm"><b>{r.t}</b> <span class="text-c3 text-xs">{r.d}</span></a></li>)}</ul>
            </Card>
          ))}
        </div>
      )}
    </Page>
  );
}

