import { useEffect, useState } from "preact/hooks";
import { Icon, Page } from "../ui";
import { inspectSig, peek, Peeked } from "../ui/record";
import { MAUNY_TABS } from "../nav";
import { accountsSig, addMoney, can, inr, invoicesSig, invTax, isExternal, log, moduleOf, moneySig, orderTotal, ordersSig, parseStatementCsv, statementSig, today, transfer, updateInvoice, type MoneyKind } from "../data";
import { persisted } from "../data/store";

/* Mauny entry: a money-tracker home. Log an entry in seconds (type → amount → category → wallet),
   see wallets, the month's in/out, where money went, and every transaction grouped by day. */

export type Cat = { k: string; label: string; icon: string; hue: string; kind: MoneyKind; dir: "in" | "out" };
/** Chalk palette — soft, readable tones for categories. */
export const CHALK = ["#C49A5A", "#B39567", "#74A7B8", "#7D8796", "#9B89BF", "#C7A867", "#6B8DB5", "#C08497", "#6FA39C", "#CC9277", "#8A8BBE", "#B97468", "#8A93A3", "#A09890", "#6E9C7C", "#97A773"];
const ICONS = ["box", "truck", "wrench", "home", "alert", "user", "trend", "grid", "calendar", "printer", "receipt", "wallet", "cash", "stamp", "money", "doc", "check", "star", "link", "more"];
const OUT_KINDS: [MoneyKind, string][] = [["expense", "Expense"], ["asset_purchase", "Asset (machine)"], ["tax_payment", "Tax payment"], ["drawings", "Drawings"], ["loan_repayment", "Loan repayment"]];
const IN_KINDS: [MoneyKind, string][] = [["receipt", "Customer payment"], ["advance", "Advance"], ["other_income", "Other income"], ["capital_in", "Capital"], ["loan_taken", "Loan taken"]];
const DEFAULT_CATS: Cat[] = [
  ...([["Filament & resin", "box", 0], ["Packaging", "box", 1], ["Shipping", "truck", 2], ["Parts & tools", "wrench", 3], ["Rent", "home", 4], ["Electricity", "alert", 5],
    ["Salaries", "user", 6], ["Marketing", "trend", 7], ["Software", "grid", 8], ["Food & travel", "calendar", 9], ["Machine", "printer", 10], ["GST / tax", "receipt", 11], ["Drawings", "wallet", 12], ["Other", "more", 13]] as const)
    .map(([label, icon, h]): Cat => ({ k: label, label, icon, hue: CHALK[h], dir: "out", kind: label === "Machine" ? "asset_purchase" : label === "GST / tax" ? "tax_payment" : label === "Drawings" ? "drawings" : "expense" })),
  ...([["Customer payment", "cash", 14, "receipt"], ["Advance", "stamp", 8, "advance"], ["Other income", "trend", 15, "other_income"], ["Capital", "wallet", 6, "capital_in"], ["Loan", "money", 4, "loan_taken"]] as const)
    .map(([label, icon, h, kind]): Cat => ({ k: label, label, icon, hue: CHALK[h], dir: "in", kind })),
];
export const catsSig = persisted<Cat[]>("mauny-cats", DEFAULT_CATS);
const KIND_CAT: Partial<Record<MoneyKind, string>> = { receipt: "Customer payment", advance: "Advance", other_income: "Other income", capital_in: "Capital", loan_taken: "Loan", expense: "Other", drawings: "Drawings", tax_payment: "GST / tax", asset_purchase: "Machine", loan_repayment: "Other" };
const catOf = (m: { cat?: string; kind: MoneyKind }): Cat => catsSig.value.find((c) => c.k === (m.cat ?? KIND_CAT[m.kind])) ?? (m.kind.startsWith("transfer") ? { k: "Transfer", label: "Transfer", icon: "rows", hue: "#8A93A3", kind: m.kind, dir: "out" } : { k: m.cat ?? "Other", label: m.cat ?? "Other", icon: "more", hue: "#A09890", kind: m.kind, dir: m.kind === "receipt" ? "in" : "out" });

/** Inline category editor: name, colour, icon, and how it books. */
function CatEditor({ c, onDone }: { c: Cat; onDone: () => void }) {
  const [v, setV] = useState(c);
  const isNew = !catsSig.value.some((x) => x.k === c.k);
  const save = () => { if (!v.label.trim()) return; const n = { ...v, label: v.label.trim() };
    catsSig.value = isNew ? [...catsSig.value, { ...n, k: n.label }] : catsSig.value.map((x) => (x.k === c.k ? { ...n, k: c.k } : x)); onDone(); };
  const kinds = v.dir === "in" ? IN_KINDS : OUT_KINDS;
  return (
    <div class="rounded-xl border border-line bg-c1/60 p-3 flex flex-col gap-2.5">
      <div class="flex items-center gap-2">
        <span class="w-9 h-9 rounded-full grid place-items-center text-white shrink-0" style={{ background: v.hue }}><Icon name={v.icon} size={16} /></span>
        <input autoFocus class="flex-1 min-w-0 h-9 px-3 rounded-lg border border-line bg-c0 text-[14px] outline-none" placeholder="Category name" value={v.label} onInput={(e) => setV({ ...v, label: (e.target as HTMLInputElement).value })} />
      </div>
      <div class="flex flex-wrap gap-1.5">{CHALK.map((h) => <button key={h} aria-label={`Colour ${h}`} onClick={() => setV({ ...v, hue: h })} class={`w-6 h-6 !min-h-0 rounded-full cursor-pointer ${v.hue === h ? "ring-2 ring-offset-2 ring-c3" : ""}`} style={{ background: h }} />)}</div>
      <div class="flex flex-wrap gap-1">{ICONS.map((i) => <button key={i} aria-label={`Icon ${i}`} onClick={() => setV({ ...v, icon: i })} class={`w-8 h-8 !min-h-0 rounded-lg grid place-items-center cursor-pointer ${v.icon === i ? "bg-c4 text-c0" : "bg-c0 text-c3 hover:bg-c1"}`}><Icon name={i} size={14} /></button>)}</div>
      <label class="text-[12px] font-semibold text-c3">Books as<select class="ml-2 h-8 px-2 rounded-md border border-line bg-c0 text-[13px]" value={v.kind} onChange={(e) => setV({ ...v, kind: (e.target as HTMLSelectElement).value as MoneyKind })}>{kinds.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <div class="flex items-center gap-2">
        <button onClick={save} class="h-8 px-3 rounded-lg bg-c4 text-c0 text-[12px] font-bold cursor-pointer !min-h-0">Save</button>
        <button onClick={onDone} class="h-8 px-3 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-c1 !min-h-0">Cancel</button>
        {!isNew && <button onClick={() => { catsSig.value = catsSig.value.filter((x) => x.k !== c.k); onDone(); }} class="ml-auto h-8 px-3 rounded-lg text-[12px] font-semibold cursor-pointer hover:bg-c1 !min-h-0" style={{ color: "#B97468" }}>Delete</button>}
      </div>
    </div>
  );
}

const GREEN = "#5E8F6C", RED = "#B06A5E";
const ym = (d: string) => d.slice(0, 7);
const monthName = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function MaunyHome() {
  useEffect(() => () => { inspectSig.value = null; }, []);
  const accs = accountsSig.value;
  const [type, setType] = useState<"out" | "in" | "transfer">("out");
  const [amt, setAmt] = useState("");
  const [cat, setCat] = useState(catsSig.value.find((c) => c.dir === "out")?.k ?? "");
  const [acc, setAcc] = useState(accs[0]?.id ?? "");
  const [to, setTo] = useState(accs[1]?.id ?? "");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(ym(today()));
  const [wallet, setWallet] = useState("all");
  const full = can("mauny", "full");
  const [editCats, setEditCats] = useState(false);
  const [editing, setEditing] = useState<Cat | null>(null);
  const [against, setAgainst] = useState("");
  const cats = catsSig.value.filter((c) => c.dir === (type === "in" ? "in" : "out"));
  const curCat = cats.find((x) => x.k === cat) ?? cats[0];
  const linkable = type === "in" && !!curCat && (curCat.kind === "receipt" || curCat.kind === "advance");
  const paidSoFar = (ref: string) => moneySig.value.filter((m) => m.ref === ref && m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const dues = [
    ...invoicesSig.value.filter((i) => i.kind === "invoice" && i.status === "issued" && !i.paidOn).map((i) => ({ ref: i.no, who: i.customer, due: invTax(i).total - paidSoFar(i.no), kind: "Invoice" as const })),
    ...ordersSig.value.filter((o) => o.type !== "inhouse" && !o.paid && o.stage !== "archived" && !invoicesSig.value.some((i) => i.orderNo === o.no)).map((o) => ({ ref: o.no, who: o.customer, due: orderTotal(o) - paidSoFar(o.no), kind: "Order" as const })),
  ].filter((x) => x.due > 0);
  const pick = (ref: string) => { setAgainst(ref); const d = dues.find((x) => x.ref === ref); if (d) { if (!amt) setAmt(String(Math.round(d.due))); if (!note) setNote(d.who); } };
  const save = () => {
    const a = Number(amt); if (!a || !acc) { setMsg("Enter an amount"); return; }
    if (type === "transfer") { if (!to || to === acc) { setMsg("Pick two different wallets"); return; } transfer(acc, to, a, date); }
    else {
      const c = curCat; const d = linkable ? dues.find((x) => x.ref === against) : undefined;
      addMoney({ date, account: acc, kind: c.kind, amount: type === "in" ? a : -a, note: note || d?.who || c.label, cat: c.k, ref: d?.ref, source: "mauny_entry" });
      if (d && a >= d.due - 1) {
        if (d.kind === "Invoice") { const inv = invoicesSig.value.find((i) => i.no === d.ref); if (inv) updateInvoice(inv, { paidOn: date, paidAccount: acc }, "Marked invoice paid"); }
        else { ordersSig.value = ordersSig.value.map((o) => (o.no === d.ref ? { ...o, paid: true } : o)); log("Marked order paid", d.ref); }
      }
      setAgainst("");
    }
    setMsg(`Saved ${inr(a)} · ${type === "transfer" ? "transfer" : curCat?.label}${against ? ` · against ${against}` : ""}`); setAmt(""); setNote(""); setMonth(ym(date));
    setTimeout(() => setMsg(""), 2500);
  };
  const onStatement = (fl: FileList | null) => {
    const f = fl?.[0]; if (!f) return;
    if (!/\.csv$/i.test(f.name)) { setMsg("Upload the statement as CSV (PDF/XLSX are read by the server)."); return; }
    f.text().then((t) => { const r = parseStatementCsv(t, acc); setMsg(`${r.added} lines imported to ${accs.find((x) => x.id === acc)?.name} · ${r.dup} duplicates skipped — review in Accounts`); });
  };
  const shift = (n: number) => { const d = new Date(month + "-01T00:00:00"); d.setMonth(d.getMonth() + n); setMonth(d.toISOString().slice(0, 7)); };
  const rows = moneySig.value.filter((m) => ym(m.date) === month && (wallet === "all" || m.account === wallet));
  const real = rows.filter((m) => !m.kind.startsWith("transfer"));
  const inflow = real.filter((m) => m.amount > 0).reduce((s, m) => s + m.amount, 0), outflow = -real.filter((m) => m.amount < 0).reduce((s, m) => s + m.amount, 0);
  const byCat = Object.entries(real.filter((m) => m.amount < 0).reduce<Record<string, number>>((o, m) => { const c = catOf(m).k; o[c] = (o[c] ?? 0) - m.amount; return o; }, {})).sort((a, b) => b[1] - a[1]);
  const days = [...new Set(rows.map((m) => m.date))].sort().reverse();
  const review = statementSig.value.filter((l) => l.state === "review").length;
  const seg = (k: typeof type, l: string, hue: string) => <button key={k} onClick={() => { setType(k); setCat(catsSig.value.find((c) => c.dir === (k === "in" ? "in" : "out"))?.k ?? ""); setEditCats(false); setEditing(null); }} aria-pressed={type === k} class={`flex-1 h-9 rounded-lg text-[13px] font-bold cursor-pointer !min-h-0 ${type === k ? "bg-c0 shadow-sm" : "text-c3"}`} style={type === k ? { color: hue } : undefined}>{l}</button>;
  const hue = type === "in" ? GREEN : type === "out" ? RED : "#6B8DB5";
  const inp = "h-10 px-3 rounded-lg border border-line bg-c1 text-[14px] w-full min-w-0 outline-none focus:border-c3";
  return (
    <Page title="Mauny" sub="Log money in and out — everything else lives in the tabs" tabs={isExternal() ? undefined : MAUNY_TABS.filter((t) => can(moduleOf(t.href)))} detail={inspectSig.value ? <Peeked /> : null}>
      <div class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <button onClick={() => setWallet("all")} aria-pressed={wallet === "all"} class={`shrink-0 min-w-[170px] text-left rounded-[var(--radius-card)] px-4 py-3 cursor-pointer ${wallet === "all" ? "bg-c4 text-c0" : "bg-c0 border border-line"}`}>
          <div class="text-[14px] font-bold flex items-center gap-2"><Icon name="wallet" size={15} />All wallets</div>
          <div class="text-[12px] opacity-70 mt-0.5">{accs.length} accounts</div>
        </button>
        {accs.map((a) => (
          <button key={a.id} onClick={() => { setWallet(a.id); setAcc(a.id); }} aria-pressed={wallet === a.id} class={`shrink-0 min-w-[170px] text-left rounded-[var(--radius-card)] px-4 py-3 cursor-pointer border ${wallet === a.id ? "bg-c0 border-c4 ring-1 ring-c4" : "bg-c0 border-line hover:bg-c1/40"}`}>
            <div class="text-[14px] font-bold flex items-center justify-between gap-2"><span class="truncate">{a.name}</span>{statementSig.value.some((l) => l.account === a.id && l.state === "review") && <span class="text-[10px] font-bold rounded-full px-1.5 bg-[#fde68a] text-black">review</span>}</div>
            <div class="text-[12px] text-c3 mt-0.5">{moneySig.value.filter((m) => m.account === a.id && ym(m.date) === month).length} entries this month</div>
          </button>
        ))}
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-start">
        {full && <div class="rounded-[var(--radius-card)] bg-c0 border border-line p-4 flex flex-col gap-3 lg:sticky lg:top-0">
          <div class="text-[15px] font-bold">New entry</div>
          <div class="flex gap-1 p-1 rounded-xl bg-c1">{seg("out", "Expense", RED)}{seg("in", "Income", GREEN)}{seg("transfer", "Transfer", "#6B8DB5")}</div>
          <label class="flex items-center gap-2 h-16 px-4 rounded-xl border-2" style={{ borderColor: hue }}>
            <span class="text-[26px] font-bold" style={{ color: hue }}>₹</span>
            <input id="mauny-amount" type="number" inputMode="decimal" min={0} placeholder="0" value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && save()}
              class="flex-1 min-w-0 bg-transparent outline-none num text-[30px] font-bold" style={{ color: hue }} aria-label="Amount" />
          </label>
          {type !== "transfer" ? (
            <div>
              <div class="text-[12px] font-semibold text-c3 mb-1.5 flex items-center justify-between">Category<button onClick={() => { setEditCats(!editCats); setEditing(null); }} class="text-[12px] font-semibold underline cursor-pointer !min-h-0">{editCats ? "Done" : "Edit categories"}</button></div>
              {editing && <div class="mb-2"><CatEditor key={editing.k} c={editing} onDone={() => setEditing(null)} /></div>}
              <div class="grid grid-cols-4 gap-1.5">
                {cats.map((c) => (
                  <button key={c.k} onClick={() => (editCats ? setEditing(c) : setCat(c.k))} aria-pressed={cat === c.k} title={editCats ? `Edit ${c.label}` : c.label}
                    class={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl cursor-pointer !min-h-0 border ${cat === c.k ? "border-current" : "border-transparent hover:bg-c1"}`} style={cat === c.k ? { color: c.hue, background: `color-mix(in srgb, ${c.hue} 10%, transparent)` } : undefined}>
                    <span class="relative w-9 h-9 rounded-full grid place-items-center text-white" style={{ background: c.hue }}><Icon name={c.icon} size={16} />{editCats && <span class="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-c0 text-c4 grid place-items-center shadow"><Icon name="edit" size={9} /></span>}</span>
                    <span class={`text-[11px] leading-tight text-center ${cat === c.k ? "font-bold" : "text-c4"}`}>{c.label}</span>
                  </button>
                ))}
                {editCats && <button onClick={() => setEditing({ k: `new-${Date.now()}`, label: "", icon: "more", hue: CHALK[cats.length % CHALK.length], dir: type === "in" ? "in" : "out", kind: type === "in" ? "other_income" : "expense" })}
                  class="flex flex-col items-center gap-1 py-2 px-1 rounded-xl cursor-pointer !min-h-0 border border-dashed border-line hover:bg-c1"><span class="w-9 h-9 rounded-full grid place-items-center bg-c1 text-c3"><Icon name="plus" size={16} /></span><span class="text-[11px]">Add</span></button>}
              </div>
            </div>
          ) : null}
          {linkable && (
            <label class="text-[12px] font-semibold text-c3">Against invoice / order
              <select class={inp} value={against} onChange={(e) => pick((e.target as HTMLSelectElement).value)}>
                <option value="">Not linked</option>
                {dues.map((x) => <option key={x.ref} value={x.ref}>{x.kind} {x.ref} · {x.who} · {inr(x.due)} due</option>)}
              </select>
              {against && <span class="block mt-1 font-normal">Paying the full due marks it paid; less is recorded as a part payment.</span>}
            </label>
          )}
          <div class="grid grid-cols-2 gap-2">
            <label class="text-[12px] font-semibold text-c3">{type === "transfer" ? "From" : "Wallet"}<select class={inp} value={acc} onChange={(e) => setAcc((e.target as HTMLSelectElement).value)}>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            {type === "transfer"
              ? <label class="text-[12px] font-semibold text-c3">To<select class={inp} value={to} onChange={(e) => setTo((e.target as HTMLSelectElement).value)}>{accs.filter((a) => a.id !== acc).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
              : <label class="text-[12px] font-semibold text-c3">Date<input type="date" class={inp} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>}
          </div>
          {type === "transfer" && <label class="text-[12px] font-semibold text-c3">Date<input type="date" class={inp} value={date} onInput={(e) => setDate((e.target as HTMLInputElement).value)} /></label>}
          <input class={inp} placeholder="Note — party, bill no., what for" value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button onClick={save} class="h-11 rounded-xl text-white text-[14px] font-bold cursor-pointer" style={{ background: hue }}>Save {type === "out" ? "expense" : type === "in" ? "income" : "transfer"}</button>
          {msg && <p role="status" class="text-[13px] font-semibold text-center">{msg}</p>}
          <div class="border-t border-line pt-3 flex flex-col gap-2">
            <div class="text-[13px] font-bold flex items-center justify-between">Bank statement sync {review > 0 && <a href="/mauny/accounts" class="text-[12px] font-semibold underline">{review} lines to review →</a>}</div>
            <label class="flex items-center gap-3 h-12 px-3 rounded-xl border-2 border-dashed border-line hover:bg-c1 cursor-pointer text-[13px]">
              <Icon name="doc" size={18} /><span class="flex-1"><b>Upload statement</b> <span class="text-c3">· CSV into {accs.find((a) => a.id === acc)?.name ?? "wallet"}</span></span>
              <input id="mauny-statement" type="file" accept=".csv,.pdf,.xlsx" class="sr-only" onChange={(e) => onStatement((e.target as HTMLInputElement).files)} />
            </label>
            <p class="text-[11px] text-c3">Lines are matched to invoices and expenses; duplicates never import twice. Confirm them in Accounts.</p>
          </div>
        </div>}

        <div class="flex flex-col gap-3 min-w-0">
          <div class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
            <div class="flex items-center justify-between px-4 h-12 border-b border-line">
              <button aria-label="Previous month" onClick={() => shift(-1)} class="w-8 h-8 !min-h-0 rounded-lg hover:bg-c1 grid place-items-center cursor-pointer rotate-180"><Icon name="right" size={15} /></button>
              <span class="text-[15px] font-bold">{monthName(month)}{wallet !== "all" && <span class="text-c3 font-medium"> · {accs.find((a) => a.id === wallet)?.name}</span>}</span>
              <button aria-label="Next month" onClick={() => shift(1)} class="w-8 h-8 !min-h-0 rounded-lg hover:bg-c1 grid place-items-center cursor-pointer"><Icon name="right" size={15} /></button>
            </div>
            <div class="grid grid-cols-3 divide-x divide-line">
              {([["Inflow", inflow, GREEN], ["Outflow", outflow, RED], ["Net", inflow - outflow, inflow - outflow >= 0 ? GREEN : RED]] as const).map(([l, v, c]) => (
                <div key={l} class="px-4 py-3"><div class="text-[12px] font-semibold text-c3">{l}</div><div class="num text-[20px] font-bold" style={{ color: c }}>{l === "Outflow" || v < 0 ? "−" : l === "Net" ? "+" : ""}{inr(Math.abs(v))}</div></div>))}
            </div>
            {byCat.length > 0 && <div class="px-4 py-3 border-t border-line">
              <div class="flex h-3 rounded-full overflow-hidden mb-2.5">{byCat.map(([k, v]) => <span key={k} title={`${k} ${inr(v)}`} style={{ width: `${(v / outflow) * 100}%`, background: catOf({ cat: k, kind: "expense" }).hue }} />)}</div>
              <div class="flex flex-wrap gap-x-4 gap-y-1">{byCat.slice(0, 8).map(([k, v]) => <span key={k} class="inline-flex items-center gap-1.5 text-[12px]"><span class="w-2.5 h-2.5 rounded-full" style={{ background: catOf({ cat: k, kind: "expense" }).hue }} />{k} <b class="num">{inr(v)}</b><span class="text-c3">{Math.round((v / outflow) * 100)}%</span></span>)}</div>
            </div>}
          </div>

          {!days.length && <div class="rounded-[var(--radius-card)] bg-c0 border border-line p-8 text-center"><div class="text-[15px] font-semibold">No transactions in {monthName(month)}</div><div class="text-[13px] text-c3 mt-1">Add one with New entry.</div></div>}
          {days.map((d) => {
            const list = rows.filter((m) => m.date === d), net = list.filter((m) => !m.kind.startsWith("transfer")).reduce((s, m) => s + m.amount, 0), dt = new Date(d + "T00:00:00");
            return (
              <div key={d} class="rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden">
                <div class="flex items-center gap-3 px-4 h-14 border-b border-line">
                  <span class="num text-[28px] font-bold w-10">{dt.getDate()}</span>
                  <span class="flex-1 leading-tight"><span class="block text-[13px] font-semibold">{d === today() ? "Today" : dt.toLocaleDateString("en-IN", { weekday: "long" })}</span><span class="block text-[12px] text-c3">{dt.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</span></span>
                  <span class="num text-[15px] font-bold" style={{ color: net >= 0 ? GREEN : RED }}>{net >= 0 ? "+" : "−"}{inr(Math.abs(net))}</span>
                </div>
                {list.map((m) => { const c = catOf(m); return (
                  <button key={m.id} onClick={() => peek(m)} class="w-full text-left flex items-center gap-3 px-4 min-h-[52px] py-2 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0">
                    <span class="w-9 h-9 rounded-full grid place-items-center text-white shrink-0" style={{ background: c.hue }}><Icon name={c.icon} size={16} /></span>
                    <span class="min-w-0 flex-1"><span class="block text-[14px] font-semibold truncate">{c.label}</span><span class="block text-[12px] text-c3 truncate">{m.note}{m.ref ? ` · ${m.ref}` : ""} · {accs.find((a) => a.id === m.account)?.name}</span></span>
                    <span class="num text-[14px] font-bold" style={{ color: m.kind.startsWith("transfer") ? "var(--c-3)" : m.amount > 0 ? GREEN : RED }}>{m.amount > 0 ? "+" : "−"}{inr(Math.abs(m.amount))}</span>
                  </button>); })}
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
