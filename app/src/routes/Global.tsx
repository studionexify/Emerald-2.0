import { sortAbc } from "../mock/types";
import { vOrders } from "../data";
import { useState } from "preact/hooks";
import { clientsSig } from "../data/inventory";
import { adminUsers, cloudEnabled, cloudSignOut, fullSync, cloudUser, syncState, type SyncState } from "../data/sync";
import { SETTINGS_TABS } from "../nav";
import { booksModeSig, canSwitchMode, MODE_LABEL, type BooksMode } from "../data/mode";
import { ask, KV, Pick, Button, Card, Empty, Field, Icon, inputCls, Page, Section, Status, Table, Disclosure, Flow, Waterfall } from "../ui";
import { Actions, Inspect, useRecord, type FDef } from "../ui/record";
import { itemsSig, tasksSig, binSig, restoreBin, purgeBin, canRestore, teamNames, today, uid, log, type Task, type Log, type Binned, attention, batchesSig, can, changePassword, logsSig, MATRIX, me, packSig, resetAll, resetPassword, ROLE_LABEL, saveUser, shortDate, spoolsSig, usersSig, type Role, type User } from "../data";

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
      <Card class="!py-1">
        {list.length ? <ul>
          {list.map((t) => (
            <li key={t.id} class="flex items-center gap-3 min-h-10 py-1.5 border-t border-line first:border-0">
              <button aria-label={t.done ? "Mark open" : "Mark done"} onClick={() => { tasksSig.value = tasks.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)); log(t.done ? "Reopened task" : "Completed task", t.title); }}
                class={`w-4 h-4 rounded-full border-[1.5px] border-c3 shrink-0 cursor-pointer flex items-center justify-center ${t.done ? "bg-c4 text-c0" : ""}`}>{t.done && <Icon name="check" size={10} />}</button>
              <button class="flex-1 min-w-0 text-left cursor-pointer" onClick={() => r.open(t)}>
                <div class={`text-[13px] font-medium truncate ${t.done ? "line-through text-c3 font-normal" : ""}`}>{t.title}{t.priority === "High" && <span class="ml-2 text-[10px] uppercase tracking-wider font-extrabold">High</span>}</div>
                <div class="t-meta">{t.who} · due {shortDate(t.due)}{t.repeat ? ` · repeats ${t.repeat}` : ""}</div>
              </button>
              {t.link && <span class="hidden sm:inline text-[11px] bg-c1 rounded px-1.5 h-5 leading-5 whitespace-nowrap">{t.link.kind} · {t.link.ref}</span>}
            </li>
          ))}
        </ul> : <Empty title="Nothing here" action={<Button icon="plus" onClick={() => r.add()}>New task</Button>} />}
      </Card>
    </Page>
  );
}

const LOG_GROUP: Record<string, [string, string, string]> = { order: ["Orders & production", "work", "#6B8DB5"], stock: ["Stock & store", "box", "#C49A5A"], consumption: ["Consumption", "scale", "#9A86B8"], money: ["Money", "money", "#6E9C7C"] };
const groupOfLog = (l: Log) => (l.kind && l.kind !== "order" ? l.kind : /task/i.test(l.action) ? "task" : /bin|deleted|restored/i.test(l.action) ? "bin" : "order");
const LOG_EXTRA: Record<string, [string, string, string]> = { task: ["Tasks", "check", "#6FA39C"], bin: ["Deletes & restores", "bin", "#B97468"] };

export function Logs() {
  const [who, setWho] = useState("all");
  const [open, setOpen] = useState<Log | null>(null);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const people = ["all", ...new Set(logsSig.value.map((l) => l.who))];
  const rows = logsSig.value.filter((l) => who === "all" || l.who === who);
  const keys = [...new Set(rows.map(groupOfLog))];
  return (
    <Page title="Logs" sub="Who changed what, and when — grouped by type" detail={open && <Inspect title={open.action} row={{ when: open.at, who: open.who, action: open.action, record: open.target, kind: open.kind ?? "order" }} onClose={() => setOpen(null)} />}
      toolbar={<Pick title="Who" value={who} on={setWho} items={people} label={(p) => (p === "all" ? "Everyone" : p)} />}>
      {!rows.length && <Card><Empty title="Nothing logged yet" /></Card>}
      <Waterfall min={340} max={3} items={keys.map((k) => {
        const [label, icon, hue] = LOG_GROUP[k] ?? LOG_EXTRA[k];
        const list = rows.filter((l) => groupOfLog(l) === k), shown = more[k] ? list : list.slice(0, 10);
        return [2 + shown.length * 0.55, (
          <div key={k} class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="flex items-center gap-2.5 px-4 h-12 border-b border-line" style={{ background: `color-mix(in srgb, ${hue} 8%, transparent)` }}>
              <span class="w-7 h-7 rounded-lg grid place-items-center text-white shrink-0" style={{ background: hue }}><Icon name={icon} size={14} /></span>
              <span class="text-[15px] font-bold text-c4 flex-1">{label}</span><span class="num text-[12px] font-semibold text-c3">{list.length}</span>
            </div>
            <ul>{shown.map((l) => (
              <li key={l.id}><button onClick={() => setOpen(l)} class="w-full text-left flex items-start gap-3 px-4 py-2 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0">
                <span class="min-w-0 flex-1"><span class="block text-[13px] font-semibold text-c4 truncate">{l.action}</span><span class="block text-[12px] text-c3 truncate">{l.target}</span></span>
                <span class="text-right shrink-0"><span class="block text-[12px] font-medium">{l.who}</span><span class="block text-[11px] text-c3 num">{l.at}</span></span>
              </button></li>))}
            </ul>
            {list.length > 10 && <button onClick={() => setMore({ ...more, [k]: !more[k] })} class="w-full h-9 border-t border-line text-[12px] font-semibold text-c3 hover:bg-c1/60 cursor-pointer">{more[k] ? "Show less" : `Show all ${list.length}`}</button>}
          </div>)] as [number, preact.ComponentChildren];
      })} />
    </Page>
  );
}

const BIN_ICON: Record<string, [string, string]> = { Order: ["work", "#6B8DB5"], Job: ["printer", "#6FA39C"], Task: ["check", "#6E9C7C"], Client: ["user", "#9A86B8"], Printer: ["printer", "#8A93A3"], Spool: ["box", "#C49A5A"], "Packing item": ["box", "#B39567"], "Accessory / part": ["wrench", "#7D8796"], Movement: ["rows", "#74A7B8"], "QC entry": ["shield", "#C49A5A"], "Packing record": ["box", "#9A86B8"] };
export function Bin() {
  const left = (d: string) => Math.max(0, 7 - Math.round((Date.parse(today()) - Date.parse(d)) / 864e5));
  const items = binSig.value;
  const kinds = [...new Set(items.map((b) => b.kind))].sort();
  const [open, setOpen] = useState<Binned | null>(null);
  const [msg, setMsg] = useState("");
  const restore = (b: Binned) => { restoreBin(b); log("Restored from Bin", b.label); setMsg(`Restored “${b.label}” to ${b.kind === "Task" ? "To-do" : b.kind.toLowerCase() + "s"}.`); if (open?.id === b.id) setOpen(null); };
  const purge = (b: Binned) => ask(`Delete “${b.label}” forever? This can't be undone.`, { ok: "Delete" }).then((ok) => { if (ok) { purgeBin(b); log("Deleted forever", b.label); if (open?.id === b.id) setOpen(null); } });
  return (
    <Page title="Bin" sub="Recoverable for 7 days · grouped by type" actions={items.length ? <Button variant="outline" onClick={() => { const r = items.filter(canRestore); r.forEach(restoreBin); log("Restored from Bin", `${r.length} items`); setMsg(`Restored ${r.length} items.`); }}>Restore all</Button> : undefined}
      detail={open && <Inspect title={open.label} row={{ kind: open.kind, deleted: shortDate(open.deletedAt), by: open.by, daysLeft: left(open.deletedAt), ...(open.data && typeof open.data === "object" ? open.data as Record<string, unknown> : {}) }} onClose={() => setOpen(null)}>
      <Actions>{canRestore(open) && <Button onClick={() => restore(open)}>Restore</Button>}<Button variant="ghost" icon="bin" onClick={() => purge(open)}>Delete forever</Button></Actions></Inspect>}>
      {msg && <p role="status" class="rounded-xl px-4 py-2.5 text-[13px] font-semibold" style={{ color: "#6E9C7C", background: "color-mix(in srgb, #6E9C7C 12%, transparent)" }}>{msg}</p>}
      {!items.length && <Card><Empty title="The Bin is empty" /></Card>}
      <Waterfall min={320} max={4} items={kinds.map((k) => {
        const list = items.filter((b) => b.kind === k), [icon, hue] = BIN_ICON[k] ?? ["bin", "#8A93A3"];
        return [2 + list.length * 0.8, (
          <div key={k} class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="flex items-center gap-2.5 px-4 h-12 border-b border-line" style={{ background: `color-mix(in srgb, ${hue} 8%, transparent)` }}>
              <span class="w-7 h-7 rounded-lg grid place-items-center text-white shrink-0" style={{ background: hue }}><Icon name={icon} size={14} /></span>
              <span class="text-[15px] font-bold text-c4 flex-1">{k === "Accessory / part" ? "Accessories & parts" : k + "s"}</span><span class="num text-[12px] font-semibold text-c3">{list.length}</span>
            </div>
            <ul>{list.map((b) => { const d = left(b.deletedAt); return (
              <li key={b.id} class="flex items-center gap-2 px-4 py-2.5 border-t border-line first:border-0">
                <button onClick={() => setOpen(b)} class="min-w-0 flex-1 text-left cursor-pointer !min-h-0">
                  <span class="block text-[13px] font-semibold text-c4 truncate">{b.label}</span>
                  <span class="block text-[11px] text-c3">{shortDate(b.deletedAt)} · by {b.by} · <b style={{ color: d <= 2 ? "#B97468" : "inherit" }}>{d}d left</b></span>
                </button>
                {canRestore(b) ? <Button variant="outline" onClick={() => restore(b)}>Restore</Button> : <span class="text-xs text-c3">Needs server</span>}
                <button aria-label={`Delete ${b.label} forever`} onClick={() => purge(b)} class="w-8 h-8 !min-h-0 grid place-items-center rounded-lg text-c2 hover:bg-c1 hover:text-warn cursor-pointer"><Icon name="close" size={14} /></button>
              </li>); })}
            </ul>
          </div>)] as [number, preact.ComponentChildren];
      })} />
    </Page>
  );
}

export function Alerts() {
  const tone = { danger: "blocked", warn: "waiting", info: "idle" } as const;
  const groups = Object.entries(attention(vOrders(), spoolsSig.value, packSig.value, batchesSig.value));
  return (
    <Page title="Attention" sub="What needs action — escalates on age, every row links to its record">
      <div class="flex flex-col gap-2">
        {groups.map(([g, list]) => (
          <Disclosure key={g} open={list.length > 0} title={<span class="inline-flex items-center gap-2">{g}{list.some((a) => a.t === "danger") && <span class="w-1.5 h-1.5 rounded-full bg-warn" />}</span>} meta={`${list.length} · ${list.filter((a) => a.t === "danger").length} critical`}>
            <ul class="-mx-3 border-t border-line">
              {[...list].sort((a, b) => ["danger", "warn", "info"].indexOf(a.t) - ["danger", "warn", "info"].indexOf(b.t)).map((a, i) => (
                <li key={i} class="border-t border-line first:border-0"><a href={a.href} class="flex items-center gap-3 min-h-9 py-1.5 px-3 hover:bg-c1/60 min-w-0"><span class={`w-1.5 h-1.5 rounded-full shrink-0 ${a.t === "danger" ? "bg-warn" : a.t === "warn" ? "bg-c4" : "bg-c2"}`} /><span class="text-[13px] min-w-0 truncate flex-1">{a.text}</span><span class="t-meta whitespace-nowrap">{tone[a.t] === "blocked" ? "Critical" : tone[a.t] === "waiting" ? "Action" : "Upcoming"}</span></a></li>
              ))}
              {!list.length && <li class="t-meta px-3 py-2">All clear.</li>}
            </ul>
          </Disclosure>
        ))}
      </div>
    </Page>
  );
}

function SettingsShell({ children, flow }: { children: preact.ComponentChildren; flow?: number }) {
  return (
    <Page title="Settings"  tabs={SETTINGS_TABS}>
      {flow ? <Flow w={flow}>{children}</Flow> : <div class="flex flex-col gap-4">{children}</div>}
    </Page>
  );
}

const SYNC_LABEL: Record<SyncState, string> = { off: "Not configured", checking: "Connecting…", "signed-out": "Signed out", synced: "Synced", sending: "Sending…", offline: "Offline — changes queued", error: "Sync error" };
function CloudCard() {
  const st = syncState.value, u = cloudUser.value;
  if (!cloudEnabled || !u) return null;
  const dot = st === "synced" ? "bg-c4" : st === "sending" ? "bg-c2" : "bg-warn";
  return (
    <Section title="Cloud sync" action={<span class="t-meta inline-flex items-center gap-1.5" role="status"><span class={`w-2 h-2 rounded-full ${dot}`} />{SYNC_LABEL[st]}</span>}>
      <Card class="flex flex-wrap items-center justify-between gap-2"><span class="text-sm">Signed in as <b>{u.username}</b> · changes appear on every device instantly.</span><Button variant="outline" onClick={() => cloudSignOut()}>Sign out</Button></Card>
      <Card class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm">Devices showing different data? Pick the device that is right and make every device match it.</span>
        <span class="flex flex-wrap gap-2">
          {u.role === "owner" && <Button variant="outline" onClick={async () => { if (await ask("Send THIS device's data to every device? The cloud copy and all other devices will be replaced with what you see here.", { ok: "Send this device's data", danger: true })) await fullSync("device"); }}>This device is correct</Button>}
          <Button variant="outline" onClick={async () => { if (await ask("Replace this device's data with the cloud copy? Anything only on this device is removed.", { ok: "Use cloud copy", danger: true })) await fullSync("cloud"); }}>Load from cloud</Button>
        </span>
      </Card>
    </Section>
  );
}

/** Owner-only: create logins, reset passwords, change roles, disable. Runs through the admin-users Edge Function. */
function Accounts() {
  const blank = { name: "", username: "", password: "", role: "operator" as Role };
  const [f, setF] = useState(blank), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, ok: string) => { setBusy(true); const e = await adminUsers(body); setBusy(false); setMsg(e ?? ok); return !e; };
  const set = (k: keyof typeof blank) => (e: Event) => setF({ ...f, [k]: (e.target as HTMLInputElement).value });
  const logins = usersSig.value.filter((x) => x.login && /^[0-9a-f-]{36}$/.test(x.id));
  return (
    <Section title="Logins" note={`${logins.filter((x) => x.active).length} active`}>
      <Card class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 items-end">
        <Field label="Name"><input class={inputCls} value={f.name} onInput={set("name")} /></Field>
        <Field label="Username"><input class={inputCls} autocapitalize="none" value={f.username} onInput={set("username")} /></Field>
        <Field label="Password (8+)"><input class={inputCls} type="password" autocomplete="new-password" value={f.password} onInput={set("password")} /></Field>
        <Field label="Access role"><select class={inputCls} value={f.role} onChange={set("role")}>{Object.keys(MATRIX).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}</select></Field>
        <Button disabled={busy} onClick={async () => { if (await run({ action: "create", ...f }, `Created ${f.username}`)) setF(blank); }}>Create login</Button>
      </Card>
      {msg && <p class="text-[13px] font-medium px-1" role="status">{msg}</p>}
      <Card class="!py-1">
        <Table rows={logins} rowKey={(m) => m.id} cols={[
          { key: "n", label: "Name", render: (m) => <b>{m.name}</b> },
          { key: "u", label: "Username", render: (m) => m.email },
          { key: "r", label: "Access", render: (m) => <select class={inputCls} value={m.role} disabled={busy || m.id === me.value?.id} onChange={(e) => run({ action: "update", user_id: m.id, role: (e.target as HTMLSelectElement).value }, `Role updated for ${m.email}`)}>{Object.keys(MATRIX).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}</select> },
          { key: "a", label: "", render: (m) => <div class="flex gap-2 justify-end">
            <Button variant="ghost" disabled={busy} onClick={() => { const p = prompt(`New password for ${m.email} (8+ characters)`); if (p) run({ action: "reset_password", user_id: m.id, password: p }, `Password reset for ${m.email}`); }}>Reset password</Button>
            {m.id !== me.value?.id && <Button variant="ghost" disabled={busy} onClick={() => run({ action: "update", user_id: m.id, active: !m.active }, `${m.email} ${m.active ? "disabled" : "enabled"}`)}>{m.active ? "Disable" : "Enable"}</Button>}
          </div> },
        ]} />
      </Card>
    </Section>
  );
}

/** Alpha / Beta switch — owner and partner only. Decides which orders, quotes, money entries and expenses Emerald shows. */
function BooksModeCard() {
  if (!canSwitchMode()) return null;
  const m = booksModeSig.value;
  const opts: [BooksMode, string, string][] = [["alpha", "Alpha", "Bank and UPI — everything in the books"], ["beta", "Beta", "Cash transactions"], ["both", "Alpha + Beta", "Everything together"]];
  return (
    <Section title="Books view">
      <Card>
        <div class="flex flex-col gap-2" role="radiogroup" aria-label="Books view">
          {opts.map(([k, l, d]) => (
            <button key={k} role="radio" aria-checked={m === k} onClick={() => { booksModeSig.value = k; log("Switched books view", MODE_LABEL[k]); }}
              class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer border ${m === k ? "border-c4 bg-c1" : "border-line hover:bg-c1/50"}`}>
              <span class={`w-4 h-4 rounded-full border-2 grid place-items-center ${m === k ? "border-c4" : "border-c2"}`}>{m === k && <span class="w-2 h-2 rounded-full bg-c4" />}</span>
              <span><span class="block text-[14px] font-bold">{l}</span><span class="block text-[12px] text-c3">{d}</span></span>
            </button>
          ))}
        </div>
      </Card>
    </Section>
  );
}

export function Profile() {
  const [cur, setCur] = useState(""), [nx, setNx] = useState(""), [msg, setMsg] = useState("");
  const u = me.value!;
  return (
    <SettingsShell flow={420}>
      <BooksModeCard />
      <Section title="Account">
        <Card class="!py-1"><KV label="Name" value={u.name} /><KV label="Email" value={u.email} /><KV label="Access role" value={ROLE_LABEL[u.role]} /></Card>
      </Section>
      <Disclosure title="Password & passkey">
        <div class="grid sm:grid-cols-2 gap-3">
          <Field label="Current password"><input class={inputCls} type="password" value={cur} onInput={(e) => setCur((e.target as HTMLInputElement).value)} /></Field>
          <Field label="New password (8+ characters)"><input class={inputCls} type="password" value={nx} onInput={(e) => setNx((e.target as HTMLInputElement).value)} /></Field>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button onClick={() => { const e = changePassword(cur, nx); setMsg(e ?? "Password changed"); if (!e) { setCur(""); setNx(""); } }}>Change password</Button>
          <Button variant="outline" onClick={() => setMsg("Passkey quick-unlock needs the server (WebAuthn) — arrives with the backend.")}>Set up passkey</Button>
        </div>
        <div class="h-3" />
        {msg && <p class="text-[13px] font-medium mt-2" role="status">{msg}</p>}
      </Disclosure>
      <CloudCard />
      {can("settings", "full") && <Card class="flex flex-wrap items-center justify-between gap-2"><span class="text-sm">Prototype data is saved on this device.</span><Button variant="outline" onClick={() => ask("Erase all local data and reload the sample data?").then((ok) => ok && resetAll())}>Reset sample data</Button></Card>}
    </SettingsShell>
  );
}

export function Users() {
  const [edit, setEdit] = useState<User | null>(null);
  const mods = ["work", "workshop", "mauny", "books", "gst", "settings"] as const;
  const owner = can("settings", "full");
  return (
    <SettingsShell>
      <Disclosure title="Role matrix" meta={`${Object.keys(MATRIX).length} roles`}>
        <div>
          <Table rows={Object.keys(MATRIX).map((r) => ({ r: r as Role }))} rowKey={(x) => x.r} cols={[
            { key: "r", label: "Role", render: (x) => <b>{ROLE_LABEL[x.r]}</b> },
            ...mods.map((m) => ({ key: m, label: m, render: (x: { r: Role }) => MATRIX[x.r][m] ?? "none" })),
          ]} />
        </div>
      </Disclosure>
      {cloudEnabled && owner && <Accounts />}
      <Section title="Team & users" note={`${usersSig.value.filter((u) => u.active).length} active`} action={owner && <Button variant="outline" icon="plus" onClick={() => setEdit({ id: crypto.randomUUID(), name: "", email: "", role: "operator", pass: "", active: true, login: false, job: "" })}>Add person</Button>}>
        {edit && (
          <Card class="grid gap-3 sm:grid-cols-3 xl:grid-cols-6 items-end">
            <Field label="Name"><input class={inputCls} value={edit.name} onInput={(e) => setEdit({ ...edit, name: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Email"><input class={inputCls} value={edit.email} onInput={(e) => setEdit({ ...edit, email: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Job title"><input class={inputCls} value={edit.job} onInput={(e) => setEdit({ ...edit, job: (e.target as HTMLInputElement).value })} /></Field>
            <label class="flex items-center gap-2 text-[13px] h-8"><input type="checkbox" checked={edit.login} onChange={() => setEdit({ ...edit, login: !edit.login })} /> Can log in</label>
            <Field label="Access role"><select class={inputCls} value={edit.role} onChange={(e) => setEdit({ ...edit, role: (e.target as HTMLSelectElement).value as Role })}>{Object.keys(MATRIX).map((r) => <option key={r} value={r}>{ROLE_LABEL[r as Role]}</option>)}</select></Field>
            <div class="flex gap-2"><Button onClick={() => { saveUser(edit); setEdit(null); }}>Save</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button></div>
          </Card>
        )}
        <Card class="!py-1">
          <Table rows={sortAbc(usersSig.value, (u) => u.name)} rowKey={(m) => m.id} onRow={owner ? setEdit : undefined} cols={[
            { key: "n", label: "Name", render: (m) => <b class="whitespace-nowrap">{m.name}</b> },
            { key: "j", label: "Job", render: (m) => m.job || "—" },
            { key: "r", label: "Access", render: (m) => ROLE_LABEL[m.role] },
            { key: "l", label: "Login", render: (m) => <Status tone={m.login ? "done" : "idle"}>{m.login ? "Yes" : "No"}</Status> },
            { key: "e", label: "Email", render: (m) => m.email || "—", hideTablet: true },
            { key: "s", label: "Status", render: (m) => <Status tone={m.active ? "done" : "idle"}>{m.active ? "Active" : "Retired"}</Status> },
            { key: "x", label: "", align: "right", render: (m) => owner && <span class="inline-flex justify-end gap-1 whitespace-nowrap" onClick={(e) => e.stopPropagation()}><Button variant="ghost" onClick={() => setEdit(m)}>Edit</Button><Button variant="ghost" onClick={() => { resetPassword(m.id); alert("Password reset to the default; ask them to change it."); }}>Reset password</Button><Button variant="ghost" onClick={() => saveUser({ ...m, active: !m.active })}>{m.active ? "Retire" : "Restore"}</Button></span> },
          ]} />
        </Card>
      </Section>
    </SettingsShell>
  );
}

export function Business() {
  const b = bizSig.value;
  const f = (k: keyof Biz, l: string, wide = false) => <div class={wide ? "sm:col-span-2" : ""}><Field label={l}><input class={inputCls} value={b[k] ?? ""} onInput={(e) => (bizSig.value = { ...bizSig.value, [k]: (e.target as HTMLInputElement).value })} /></Field></div>;
  return (
    <SettingsShell>
      <Card class="grid sm:grid-cols-2 gap-3">
        {f("name", "Business name")}{f("gstin", "GSTIN")}{f("pan", "PAN")}{f("udyam", "Udyam (MSME) no.")}{f("phone", "Phone")}{f("email", "Email")}
        {f("address", "Address", true)}{f("addressShort", "Short address (footer)")}{f("website", "Website")}
        {f("upi", "UPI ID")}{f("upiNumber", "UPI number")}{f("bankName", "Bank & branch")}{f("accName", "Account name")}{f("accNo", "Account no.")}{f("ifsc", "IFSC")}{f("jurisdiction", "Jurisdiction (terms)")}
        {f("bank", "Bank (one line, if fields above are blank)", true)}{f("series", "Invoice series")}{f("terms", "Terms printed on documents", true)}
      </Card>
    </SettingsShell>
  );
}

function ImportE1() {
  const [state, setState] = useState<{ busy?: boolean; m?: Migrated; err?: string; done?: string }>({});
  const pick = async (e: Event) => {
    const files = [...((e.target as HTMLInputElement).files ?? [])];
    if (!files.length) return;
    setState({ busy: true });
    try { const m = mapEmerald1(await readExport(files)); setState(m.invoices.length || m.orders.length || m.spools.length ? { m } : { err: "No Emerald 1 tables found in those files." }); }
    catch (x) { setState({ err: String(x) }); }
  };
  const go = () => { if (!state.m) return; applyEmerald1(state.m); log("Imported Emerald 1 data", `${state.m.invoices.length} invoices · ${state.m.orders.length} orders`); setState({ done: "Replaced. Every list now shows the export's records." }); };
  const merge = () => { if (!state.m) return; const a = mergeEmerald1(state.m); const n = Object.entries(a).filter(([, v]) => v).map(([k, v]) => `${v} ${k}`).join(" · ");
    log("Merged Emerald 1 data", n || "print counts only"); setState({ done: `Merged. Your 2.0 edits were kept. Added: ${n || "nothing new"}; print counts filled in where missing.` }); };
  return (
    <Card class="space-y-3">
      <div><b>Import from Emerald 1</b></div>
      <input type="file" multiple accept=".md,text/markdown,text/plain" onChange={pick} />
      {state.busy && <p class="t-meta">Reading…</p>}
      {state.err && <p class="text-[var(--danger,red)]">{state.err}</p>}
      {state.m && <>
        <p class="t-meta">{summarise(state.m).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(" · ")}</p>
        <div class="flex flex-wrap gap-2">
          <Button onClick={merge}>Merge — keep my edits</Button>
          <Button variant="outline" onClick={async () => { if (await ask("Replace ALL data with the export? Edits, photos and new records made in 2.0 will be lost.", { ok: "Replace everything", danger: true })) go(); }}>Replace everything</Button>
        </div>
        <p class="t-meta">Merge adds only records that are new in the export and fills in printed / wasted counts; anything you edited, added or deleted here stays as it is.</p>
      </>}
      {state.done && <p>{state.done}</p>}
    </Card>
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
    <SettingsShell flow={600}>
      <ImportE1 />
      <Card class="!py-1">
        <Table rows={rows} rowKey={(r) => r.id} cols={[
          { key: "n", label: "Service", render: (r) => <b>{r.n}</b> }, { key: "d", label: "What it does", render: (r) => r.d },
          { key: "s", label: "Status", render: (r) => <Status tone={r.s ? "done" : "waiting"}>{r.s ? "Connected" : "Not set"}</Status> },
          { key: "a", label: "", align: "right", render: (r) => <Button variant="outline" onClick={() => r.n === "Tally export" ? navigate("/mauny/books") : r.n === "Bill reader" ? navigate("/mauny/purchases") : alert(`${r.n} connects through the server — it is wired when the database goes live.`)}>{r.a}</Button> }]} />
      </Card>
    </SettingsShell>
  );
}

import { RatesEditor } from "./Calculator";
import { mapEmerald1, readExport, summarise, type Migrated } from "../data/e1-import";
import { applyEmerald1, mergeEmerald1 } from "../data/e1-apply";
import { navigate } from "../router";
import { bizSig, type Biz } from "../data/biz";
export function Rates() { return <SettingsShell><RatesEditor /></SettingsShell>; }

import { searchQ } from "../data/search";
import { invoicesSig, quotesSig, expensesSig, billsSig } from "../data";
import { NAV, WORK_TABS, MAUNY_TABS, WORKSHOP_TABS, CALC_TABS } from "../nav";
export function Search() {
  const q = searchQ.value.trim().toLowerCase();
  const hit = (...xs: (string | undefined)[]) => !!q && xs.some((x) => x?.toLowerCase().includes(q));
  const pages = [...NAV, ...WORK_TABS, ...MAUNY_TABS, ...WORKSHOP_TABS, ...CALC_TABS, ...SETTINGS_TABS].filter((p) => hit(p.label));
  const groups: [string, { k: string; t: string; d: string; href: string }[]][] = [
    ["Orders", vOrders().filter((o) => hit(o.no, o.customer, ...o.items.map((i) => i.name))).map((o) => ({ k: o.id, t: `${o.no} · ${o.customer}`, d: o.items.map((i) => i.name).join(", "), href: "/work/orders" }))],
    ["Customers", [...new Set(vOrders().map((o) => o.customer).concat(clientsSig.value.map((c) => c.name)))].filter((c) => hit(c)).map((c) => ({ k: c, t: c, d: "Client", href: "/work/clients" }))],
    ["Invoices", invoicesSig.value.filter((i) => hit(i.no, i.customer, i.orderNo)).map((i) => ({ k: i.id, t: `${i.no} · ${i.customer}`, d: i.kind, href: "/work/invoice" }))],
    ["Quotations", quotesSig.value.filter((x) => hit(x.no, x.customer)).map((x) => ({ k: x.id, t: `${x.no} · ${x.customer}`, d: x.outcome, href: "/work/quotes" }))],
    ["Bills & expenses", [...billsSig.value.filter((b) => hit(b.vendor, b.no)).map((b) => ({ k: b.id, t: `${b.vendor} ${b.no}`, d: "Bill", href: "/mauny/purchases" })), ...expensesSig.value.filter((e) => hit(e.vendor, e.head)).map((e) => ({ k: e.id, t: `${e.vendor} · ${e.head}`, d: "Expense", href: "/mauny/finance" }))]],
    ["Filament", Object.values(spoolsSig.value.filter((x) => x.active !== false && hit(x.material, x.colour, x.brand, x.spoolNo)).reduce<Record<string, { k: string; t: string; d: string; href: string; n: number; g: number }>>((o, x) => { const k = `${x.material}|${x.colour}|${x.brand}`; const r = (o[k] ??= { k, t: `${x.material} ${x.colour} · ${x.brand}`, d: "", href: "/workshop", n: 0, g: 0 }); r.n++; r.g += x.grams; r.d = `${r.n} spools · ${(r.g / 1000).toFixed(1)} kg`; return o; }, {})).slice(0, 30)],
    ["Store items", [...packSig.value, ...itemsSig.value].filter((x) => hit(x.name, x.vendor)).map((x) => ({ k: x.id, t: x.name, d: `${x.qty} ${x.unit}`, href: x.cat ? "/workshop/parts" : "/workshop/packing" }))],
    ["Pages", pages.map((p) => ({ k: p.href, t: p.label, d: p.href, href: p.href }))],
  ];
  const any = groups.some(([, l]) => l.length);
  return (
    <Page title="Search" sub="Orders, customers, invoice and quote numbers, bills, every page">
      {!q ? <Empty title="Type in the search bar" /> : !any ? <Empty title={`Nothing matches “${searchQ.value}”`} /> : (
        <div class="flex flex-col gap-2">
          {groups.filter(([, l]) => l.length).map(([g, l]) => (
            <Disclosure key={g} open title={g} meta={String(l.length)}>
              <ul class="-mx-3 border-t border-line">{l.slice(0, 12).map((r) => <li key={r.k} class="border-t border-line first:border-0"><a href={r.href} class="flex items-center gap-3 min-h-9 py-1.5 px-3 hover:bg-c1/60 min-w-0"><span class="text-[13px] font-medium truncate">{r.t}</span><span class="t-meta ml-auto whitespace-nowrap capitalize">{r.d}</span></a></li>)}</ul>
            </Disclosure>
          ))}
        </div>
      )}
    </Page>
  );
}

