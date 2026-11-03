import { useState } from "preact/hooks";
import { SETTINGS_TABS } from "../nav";
import { Button, Card, CardTitle, Chip, Empty, Field, inputCls, Page, Section, Status, Table } from "../ui";
import { attention, batchesSig, can, changePassword, db, logsSig, MATRIX, me, packSig, resetAll, resetPassword, ROLE_LABEL, saveUser, shortDate, spoolsSig, usersSig, X, type Role, type User } from "../data";

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
      <Section title="Users" action={owner && <Button variant="outline" icon="plus" onClick={() => setEdit({ id: crypto.randomUUID(), name: "", email: "", role: "operator", pass: "", active: true })}>Add user</Button>}>
        {edit && (
          <Card class="grid gap-3 sm:grid-cols-4 items-end">
            <Field label="Name"><input class={inputCls} value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Email"><input class={inputCls} value={edit.email} onInput={(e) => setEdit({ ...edit, email: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Role"><select class={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: (e.target as HTMLSelectElement).value as Role })}>{Object.keys(MATRIX).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}</select></Field>
            <div class="flex gap-2"><Button onClick={() => { saveUser(edit); setEdit(null); }}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
          </Card>
        )}
        <Card>
          <Table rows={usersSig.value} rowKey={(m) => m.id} cols={[
            { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
            { key: "r", label: "Role", render: (m) => ROLE_LABEL[m.role] },
            { key: "e", label: "Email", render: (m) => m.email },
            { key: "s", label: "Status", render: (m) => <Status tone={m.active ? "done" : "idle"}>{m.active ? "Active" : "Retired"}</Status> },
            { key: "x", label: "", render: (m) => owner && <span class="flex flex-wrap gap-1"><Button variant="ghost" onClick={() => setEdit(m)}>Edit</Button><Button variant="ghost" onClick={() => { resetPassword(m.id); alert("Password reset to the default; ask them to change it."); }}>Reset password</Button><Button variant="ghost" onClick={() => saveUser({ ...m, active: !m.active })}>{m.active ? "Retire" : "Restore"}</Button></span> },
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
          { key: "a", label: "", render: (r) => <Button variant="outline">{r.a}</Button> }]} />
      </Card>
    </SettingsShell>
  );
}

import { RatesEditor } from "./Calculator";
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
