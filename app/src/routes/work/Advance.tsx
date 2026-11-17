/** Advance money on an order. Filled in at any stage; printing never waits for it. */
import { useState } from "preact/hooks";
import { Button } from "../../ui";
import { inr, today, shortDate, moneySig } from "../../data";
import { advancesOf, recordAdvance, removeAdvance, accountsSig } from "../../data/ledger";
import { modeAccounts } from "../../data/mode";
import type { Order } from "../../mock/types";

const inp = "h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] min-w-0 w-full";

export function AdvanceCard({ order, total }: { order: Order; total: number }) {
  const list = advancesOf(order.no), got = list.reduce((a, m) => a + m.amount, 0);
  const accounts = modeAccounts(), [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(""), [acc, setAcc] = useState(""), [on, setOn] = useState(today()), [note, setNote] = useState("");
  void moneySig.value;
  const name = (id: string) => accountsSig.value.find((a) => a.id === id)?.name ?? "Account";
  const save = () => { const a = Number(amt); if (!(a > 0) || !(acc || accounts[0])) return; recordAdvance(order, { amount: a, account: acc || accounts[0].id, date: on, note }); setAmt(""); setNote(""); setOpen(false); };
  return <div class="grid gap-2 text-[13px]">
    <div class="flex justify-between gap-3"><span class="text-c3">Order total</span><b class="num">{inr(total)}</b></div>
    <div class="flex justify-between gap-3"><span class="text-c3">Advance received</span><b class="num text-grn">{inr(got)}</b></div>
    {total > 0 && <div class="flex justify-between gap-3"><span class="text-c3">Balance</span><b class="num">{inr(Math.max(0, total - got))}</b></div>}
    {list.map((m) => <div key={m.id} class="flex items-center gap-2 rounded-lg bg-c1/60 px-2.5 py-1.5"><span class="min-w-0 flex-1 text-[12px]"><b class="num">{inr(m.amount)}</b> · {name(m.account)} · {shortDate(m.date)}{m.note && m.note !== order.customer ? ` · ${m.note}` : ""}</span>
      <button type="button" onClick={() => removeAdvance(m.id)} class="text-[12px] text-red underline cursor-pointer !min-h-0">Remove</button></div>)}
    {!open ? <div><Button variant="outline" onClick={() => setOpen(true)}>{list.length ? "Record more advance" : "Record advance"}</Button><p class="t-meta mt-1.5">Optional, at any stage. Production never waits for it, and the final invoice counts it as already paid.</p></div>
      : <div class="rounded-xl border border-line p-2.5 grid gap-2">
        <div class="grid grid-cols-2 gap-2">
          <label class="grid gap-1 text-[11px] text-c2">Amount (₹)<input type="number" min={0} class={`${inp} num`} value={amt} onInput={(e) => setAmt((e.target as HTMLInputElement).value)} /></label>
          <label class="grid gap-1 text-[11px] text-c2">Date<input type="date" class={inp} value={on} onInput={(e) => setOn((e.target as HTMLInputElement).value)} /></label>
          <label class="grid gap-1 text-[11px] text-c2 col-span-2">Received into<select class={`${inp} cursor-pointer`} value={acc || accounts[0]?.id || ""} onChange={(e) => setAcc((e.target as HTMLSelectElement).value)}>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label class="grid gap-1 text-[11px] text-c2 col-span-2">Note (optional)<input class={inp} value={note} onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></label></div>
        <div class="flex gap-2"><Button disabled={!(Number(amt) > 0) || !accounts.length} onClick={save}>Save advance</Button><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        {!accounts.length && <p class="t-meta text-amb">Add an account in Mauny first.</p>}
      </div>}
  </div>;
}
