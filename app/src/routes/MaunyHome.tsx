import { useEffect, useState } from "preact/hooks";
import { Icon, Page } from "../ui";
import { inspectSig, peek, Peeked } from "../ui/record";
import { MAUNY_TABS } from "../nav";
import { accountsSig, addMoney, balanceOf, can, inr, isExternal, moduleOf, moneySig, parseStatementCsv, statementSig, today, transfer, type MoneyKind } from "../data";

/* Mauny entry: a money-tracker home. Log an entry in seconds (type → amount → category → wallet),
   see wallets, the month's in/out, where money went, and every transaction grouped by day. */

type Cat = { k: string; label: string; icon: string; hue: string; kind: MoneyKind };
const OUT: Cat[] = [
  ["Filament & resin", "box", "#d97706"], ["Packaging", "box", "#a16207"], ["Shipping", "truck", "#0891b2"], ["Parts & tools", "wrench", "#475569"],
  ["Rent", "home", "#7c3aed"], ["Electricity", "alert", "#ca8a04"], ["Salaries", "user", "#2563eb"], ["Marketing", "trend", "#db2777"],
  ["Software", "grid", "#0d9488"], ["Food & travel", "calendar", "#ea580c"], ["Machine", "printer", "#4f46e5"], ["GST / tax", "receipt", "#dc2626"], ["Drawings", "wallet", "#64748b"], ["Other", "more", "#78716c"],
].map(([label, icon, hue]) => ({ k: label, label, icon, hue, kind: label === "Machine" ? "asset_purchase" : label === "GST / tax" ? "tax_payment" : label === "Drawings" ? "drawings" : "expense" }));
const IN: Cat[] = [
  ["Customer payment", "cash", "#16a34a", "receipt"], ["Advance", "stamp", "#0d9488", "advance"], ["Other income", "trend", "#65a30d", "other_income"],
  ["Capital", "wallet", "#2563eb", "capital_in"], ["Loan", "money", "#7c3aed", "loan_taken"],
].map(([label, icon, hue, kind]) => ({ k: label, label, icon, hue, kind: kind as MoneyKind }));
const ALL = [...OUT, ...IN];
const KIND_CAT: Partial<Record<MoneyKind, string>> = { receipt: "Customer payment", advance: "Advance", other_income: "Other income", capital_in: "Capital", loan_taken: "Loan", expense: "Other", drawings: "Drawings", tax_payment: "GST / tax", asset_purchase: "Machine", loan_repayment: "Other" };
const catOf = (m: { cat?: string; kind: MoneyKind }) => ALL.find((c) => c.k === (m.cat ?? KIND_CAT[m.kind])) ?? (m.kind.startsWith("transfer") ? { k: "Transfer", label: "Transfer", icon: "rows", hue: "#64748b", kind: m.kind } : OUT[OUT.length - 1]);
const GREEN = "#16a34a", RED = "#dc2626";
const ym = (d: string) => d.slice(0, 7);
const monthName = (m: string) => new Date(m + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export function MaunyHome() {
  useEffect(() => () => { inspectSig.value = null; }, []);
  const accs = accountsSig.value;
  const [type, setType] = useState<"out" | "in" | "transfer">("out");
  const [amt, setAmt] = useState("");
  const [cat, setCat] = useState(OUT[0].k);
  const [acc, setAcc] = useState(accs[0]?.id ?? "");
  const [to, setTo] = useState(accs[1]?.id ?? "");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [month, setMonth] = useState(ym(today()));
  const [wallet, setWallet] = useState("all");
  const full = can("mauny", "full");
  const cats = type === "in" ? IN : OUT;
  const save = () => {
    const a = Number(amt); if (!a || !acc) { setMsg("Enter an amount"); return; }
    if (type === "transfer") { if (!to || to === acc) { setMsg("Pick two different wallets"); return; } transfer(acc, to, a, date); }
    else { const c = cats.find((x) => x.k === cat) ?? cats[0]; addMoney({ date, account: acc, kind: c.kind, amount: type === "in" ? a : -a, note: note || c.label, cat: c.k, source: "mauny_entry" }); }
    setMsg(`Saved ${inr(a)} · ${type === "transfer" ? "transfer" : cat}`); setAmt(""); setNote(""); setMonth(ym(date));
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
  const total = accs.reduce((s, a) => s + balanceOf(a.id), 0);
  const review = statementSig.value.filter((l) => l.state === "review").length;
  const seg = (k: typeof type, l: string, hue: string) => <button key={k} onClick={() => { setType(k); setCat((k === "in" ? IN : OUT)[0].k); }} aria-pressed={type === k} class={`flex-1 h-9 rounded-lg text-[13px] font-bold cursor-pointer !min-h-0 ${type === k ? "bg-c0 shadow-sm" : "text-c3"}`} style={type === k ? { color: hue } : undefined}>{l}</button>;
  const hue = type === "in" ? GREEN : type === "out" ? RED : "#2563eb";
  const inp = "h-10 px-3 rounded-lg border border-line bg-c1 text-[14px] w-full min-w-0 outline-none focus:border-c3";
  return (
    <Page title="Mauny" sub="Log money in and out — everything else lives in the tabs" tabs={isExternal() ? undefined : MAUNY_TABS.filter((t) => can(moduleOf(t.href)))} detail={inspectSig.value ? <Peeked /> : null}>
      <div class="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <button onClick={() => setWallet("all")} aria-pressed={wallet === "all"} class={`shrink-0 min-w-[200px] text-left rounded-[var(--radius-card)] p-4 cursor-pointer ${wallet === "all" ? "bg-c4 text-c0" : "bg-c0 border border-line"}`}>
          <div class="text-[12px] font-semibold opacity-70 flex items-center gap-1.5"><Icon name="wallet" size={13} />Total · {accs.length} wallets</div>
          <div class="num text-[24px] font-bold leading-tight mt-1">{inr(total)}</div>
        </button>
        {accs.map((a) => (
          <button key={a.id} onClick={() => { setWallet(a.id); setAcc(a.id); }} aria-pressed={wallet === a.id} class={`shrink-0 min-w-[180px] text-left rounded-[var(--radius-card)] p-4 cursor-pointer border ${wallet === a.id ? "bg-c0 border-c4 ring-1 ring-c4" : "bg-c0 border-line hover:bg-c1/40"}`}>
            <div class="text-[12px] font-semibold text-c3 flex items-center justify-between gap-2"><span class="truncate">{a.name}</span>{statementSig.value.some((l) => l.account === a.id && l.state === "review") && <span class="text-[10px] font-bold rounded-full px-1.5 bg-[#fde68a] text-black">review</span>}</div>
            <div class="num text-[20px] font-bold leading-tight mt-1">{inr(balanceOf(a.id))}</div>
          </button>
        ))}
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-start">
        {full && <div class="rounded-[var(--radius-card)] bg-c0 border border-line p-4 flex flex-col gap-3 lg:sticky lg:top-0">
          <div class="text-[15px] font-bold">New entry</div>
          <div class="flex gap-1 p-1 rounded-xl bg-c1">{seg("out", "Expense", RED)}{seg("in", "Income", GREEN)}{seg("transfer", "Transfer", "#2563eb")}</div>
          <label class="flex items-center gap-2 h-16 px-4 rounded-xl border-2" style={{ borderColor: hue }}>
            <span class="text-[26px] font-bold" style={{ color: hue }}>₹</span>
            <input id="mauny-amount" type="number" inputMode="decimal" min={0} placeholder="0" value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && save()}
              class="flex-1 min-w-0 bg-transparent outline-none num text-[30px] font-bold" style={{ color: hue }} aria-label="Amount" />
          </label>
          {type !== "transfer" ? (
            <div>
              <div class="text-[12px] font-semibold text-c3 mb-1.5">Category</div>
              <div class="grid grid-cols-4 gap-1.5">
                {cats.map((c) => (
                  <button key={c.k} onClick={() => setCat(c.k)} aria-pressed={cat === c.k} title={c.label}
                    class={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl cursor-pointer !min-h-0 border ${cat === c.k ? "border-current" : "border-transparent hover:bg-c1"}`} style={cat === c.k ? { color: c.hue, background: `color-mix(in srgb, ${c.hue} 10%, transparent)` } : undefined}>
                    <span class="w-9 h-9 rounded-full grid place-items-center text-white" style={{ background: c.hue }}><Icon name={c.icon} size={16} /></span>
                    <span class={`text-[11px] leading-tight text-center ${cat === c.k ? "font-bold" : "text-c4"}`}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
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
