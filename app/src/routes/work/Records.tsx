import { sortAbc } from "../../mock/types";
import { canSwitchMode, PAY_LABEL } from "../../data/mode";
import { ordersSig } from "../../data";
import { vOrders, vQuotes } from "../../data";
import { useEffect, useState } from "preact/hooks";
import { ask, Pick, Button, Card, CardTitle, Chip, DetailHead, Empty, Field, inputCls, Section, Stat, Status, SubTabs, Table } from "../../ui";
import {
  accountsSig, batchesSig, cancelInvoice, creditNote, inr, invoicesSig, invTax, markPaid, markUnpaid, monthLocked, nextNo, photosSig, quotesSig,
  rate, shipmentsSig, shortDate, today, uid, log, patchOrder, nowS, consume,
  type InvLine, type Invoice, type Order, type Quote, type Shipment,
  blankParty, canInvoice, COPIES, deleteDraft, draftOutdated, draftsSig, fixKnownInvoices, hsnSig, invoiceBiz, issueDraft, lookupParty, me, newDraft, problems,
  sellerNow, seriesPrefix, STATES, stateLabel, stateOfGstin, updateDraft, type Party,
} from "../../data";
import { bizSig, type Biz } from "../../data/biz";
import { PaneSection, useRecord, Inspect, type FDef } from "../../ui/record";
import { MediaImg } from "../../ui/media";
import { clientsSig, shrinkImage, storeMedia, type Client } from "../../data";
import { DocSheet, fromInvoice, fromQuote, type DocData } from "./Doc";
import { WorkShell } from "./shared";

const linesOf = (o: Order): InvLine[] => o.items.map((i) => ({ desc: `${i.name} (${i.material} ${i.colour})`, hsn: "491199", qty: i.qty, rate: i.price }));

/** Editable line items for invoices and quotations. */
function LinesEditor({ lines, on, locked }: { lines: InvLine[]; on: (l: InvLine[]) => void; locked?: boolean }) {
  const set = (k: number, p: Partial<InvLine>) => on(lines.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const c = "h-8 px-2 rounded-lg border border-c3 bg-c0 text-xs min-w-0";
  return (
    <div class="flex flex-col gap-2">
      {lines.map((l, k) => (
        <div key={k} class="grid grid-cols-[1fr_56px_44px_72px_24px] gap-1">
          <input class={c} disabled={locked} value={l.desc} onInput={(e) => set(k, { desc: (e.target as HTMLInputElement).value })} aria-label="Description" />
          <button class="text-xs cursor-pointer" aria-label="Remove item" onClick={() => on(lines.filter((_, i) => i !== k))}>✕</button>
          <input class={c} disabled={locked} value={l.hsn} onInput={(e) => set(k, { hsn: (e.target as HTMLInputElement).value })} aria-label="HSN" />
          <input class={c} disabled={locked} type="number" value={l.qty} onInput={(e) => set(k, { qty: Number((e.target as HTMLInputElement).value) || 0 })} aria-label="Qty" />
          <input class={c} disabled={locked} type="number" value={l.rate} onInput={(e) => set(k, { rate: Number((e.target as HTMLInputElement).value) || 0 })} aria-label="Rate" />
          {!locked && <button class="text-xs cursor-pointer" aria-label="Remove line" onClick={() => on(lines.filter((_, i) => i !== k))}>✕</button>}
        </div>
      ))}
      {!locked && <button class="text-xs underline self-start cursor-pointer" onClick={() => on([...lines, { desc: "", hsn: "491199", qty: 1, rate: 0 }])}>+ Line</button>}
    </div>
  );
}

/* ======================================================= Invoice (stage + register) */
const num = (e: Event) => Number((e.target as HTMLInputElement).value) || 0;
const val = (e: Event) => (e.target as HTMLInputElement).value;

/** Bill-to / Ship-to form. Choosing a known name or GSTIN fills in everything known about that party. */
function PartyForm({ p, on, title }: { p: Party; on: (p: Party) => void; title: string }) {
  const fill = (q: { name?: string; gstin?: string }, base: Party) => { const f = lookupParty(q); on(f ? { ...base, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) } : base); };
  const id = "parties-" + title.replace(/\W/g, "");
  return (
    <fieldset class="rounded-xl border border-line p-2.5 grid grid-cols-2 gap-2">
      <legend class="px-1 text-[12px] font-semibold">{title}</legend>
      <div class="col-span-2"><Field label="Name (pick a saved client to fill everything)">
        <input class={inputCls} list={id} value={p.name} onInput={(e) => on({ ...p, name: val(e) })} onChange={(e) => fill({ name: val(e) }, { ...p, name: val(e) })} />
        <datalist id={id}>{sortAbc([...new Set([...clientsSig.value.map((c) => c.name), ...invoicesSig.value.map((i) => i.billTo?.name ?? "")].filter(Boolean))]).map((n) => <option key={n} value={n} />)}</datalist>
      </Field></div>
      <div class="col-span-2"><Field label="Address"><textarea class={inputCls} rows={3} value={p.address} onInput={(e) => on({ ...p, address: (e.target as HTMLTextAreaElement).value })} /></Field></div>
      <Field label="State (sets the tax)"><select class={inputCls} value={p.state} onChange={(e) => on({ ...p, state: (e.target as HTMLSelectElement).value })}><option value="">Choose…</option>{STATES.map(([n, c]) => <option key={c} value={n}>{n} ({c})</option>)}</select></Field>
      <Field label="GSTIN (blank if none)"><input class={inputCls} value={p.gstin} onInput={(e) => on({ ...p, gstin: val(e).toUpperCase() })} onChange={(e) => { const g = val(e).trim().toUpperCase(); fill({ gstin: g }, { ...p, gstin: g, state: stateOfGstin(g) || p.state }); }} /></Field>
      <Field label="Contact"><input class={inputCls} value={p.contact} onInput={(e) => on({ ...p, contact: val(e) })} /></Field>
      <Field label="Email"><input class={inputCls} type="email" value={p.email} onInput={(e) => on({ ...p, email: val(e) })} /></Field>
    </fieldset>
  );
}

/** Line items with the HSN / SAC chosen from the saved list. */
function ItemsForm({ lines, on }: { lines: InvLine[]; on: (l: InvLine[]) => void }) {
  const set = (k: number, p: Partial<InvLine>) => on(lines.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const c = "h-9 px-2 rounded-lg border border-c3 bg-c0 text-[13px] min-w-0 w-full";
  return (
    <div class="flex flex-col gap-2">
      <div class="text-[13px] font-semibold">Items</div>
      {lines.map((l, k) => (
        <div key={k} class="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_20px] gap-1.5 items-center rounded-xl border border-line p-2">
          <input class={`${c} col-span-3`} placeholder={`Item ${k + 1} description`} value={l.desc} onInput={(e) => set(k, { desc: val(e) })} aria-label="Description" />
          <select class={`${c} col-span-4`} value={l.hsn} onChange={(e) => set(k, { hsn: (e.target as HTMLSelectElement).value })} aria-label="HSN / SAC" title={hsnSig.value.find((h) => h.code === l.hsn)?.desc}>
            <option value="">HSN…</option>{hsnSig.value.map((h) => <option key={h.id} value={h.code}>{h.code} — {h.desc.slice(0, 60)}</option>)}
          </select>
          <input class={c} type="number" min="0" step="any" placeholder="Qty" value={l.qty || ""} onInput={(e) => set(k, { qty: num(e) })} aria-label="Qty" />
          <input class={c} type="number" min="0" step="0.01" placeholder="Unit ₹" value={l.rate || ""} onInput={(e) => set(k, { rate: num(e) })} aria-label="Unit price" />
          <span class="num text-right text-[13px] font-semibold col-span-2">{inr(l.qty * l.rate)}</span>
        </div>
      ))}
      <button class="text-xs underline self-start cursor-pointer" onClick={() => on([...lines, { desc: "", hsn: hsnSig.value[0]?.code ?? "", qty: 1, rate: 0 }])}>+ Add item</button>
    </div>
  );
}

function Totals({ i }: { i: Invoice }) {
  const t = invTax({ ...i, status: "issued", kind: "invoice" });
  const row = (k: string, v: number, b = false) => <div class={`flex justify-between ${b ? "font-semibold border-t border-line pt-1" : ""}`}><span>{k}</span><span class="num">{inr2(v)}</span></div>;
  return (
    <div class="rounded-xl bg-c1 p-3 text-[13px] flex flex-col gap-0.5">
      <div class="t-meta mb-1">{i.billTo?.state ? (i.interstate ? `${i.billTo.state} is outside ${i.seller?.biz.state ?? "Gujarat"} → IGST ${i.gstRate}%` : `${i.billTo.state} party → CGST ${i.gstRate / 2}% + SGST ${i.gstRate / 2}%`) : "Choose the Bill-to state to set the tax"}</div>
      {row("Sub total", t.taxable)}
      {i.interstate ? row(`IGST (${i.gstRate}%)`, t.igst) : <>{row(`CGST (${i.gstRate / 2}%)`, t.cgst)}{row(`SGST (${i.gstRate / 2}%)`, t.sgst)}</>}
      {t.shipping ? row("Shipping cost", t.shipping) : null}
      {row("Round-off", t.roundOff)}{row("Total", t.total, true)}
    </div>
  );
}
const inr2 = (n: number) => (n < 0 ? "-" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Draft editor: everything is editable until it is issued. */
function DraftEditor({ d, onIssued }: { d: Invoice; onIssued: (i: Invoice) => void }) {
  const allowed = canInvoice(me.value?.role);
  const up = (p: Partial<Invoice>) => updateDraft(d, p);
  const errs = problems(d);
  const issue = async () => {
    let keepOld = true;
    if (draftOutdated(d)) keepOld = !(await ask("Invoice settings (company details, terms, bank…) changed after this draft was started. Use the NEW details on this invoice? Cancel keeps the details it was started with.", { ok: "Use new details" }));
    const no = nextNo("invoice", d.date);
    if (!(await ask(`Issue this invoice as ${no}? Once issued it cannot be edited — only cancelled (number kept) or corrected with a credit note.`, { ok: `Issue ${no}` }))) return;
    let inv: Invoice; try { inv = issueDraft(d, keepOld); } catch (e) { alert((e as Error).message); return; }
    if (inv.batch) batchesSig.value = batchesSig.value.map((b) => (b.orderNo === inv.orderNo && b.name === inv.batch ? { ...b, invoiceNo: inv.no } : b));
    else if (inv.orderNo) { const o = ordersSig.value.find((x) => x.no === inv.orderNo); if (o) patchOrder(o, { invoiced: true }); }
    onIssued(inv);
  };
  return (
    <div class="flex flex-col gap-3">
      {draftOutdated(d) && <div class="rounded-xl bg-warn/15 p-2.5 text-[12px] flex flex-wrap items-center gap-2"><span class="flex-1 min-w-[180px]">Invoice settings changed since this draft was started.</span>
        <Button variant="outline" class="!h-7" onClick={() => up({ seller: sellerNow() })}>Use new details</Button><span class="t-meta">or keep the old ones (chosen when you issue)</span></div>}
      <div class="grid grid-cols-2 gap-2">
        <Field label="Invoice date"><input class={inputCls} type="date" max={today()} value={d.date} onInput={(e) => up({ date: val(e) })} /></Field>
        <Field label="Number"><input class={inputCls} disabled value={`${nextNo("invoice", d.date)} (taken when issued)`} /></Field>
      </div>
      <PartyForm title="Bill to" p={d.billTo ?? blankParty()} on={(billTo) => up({ billTo })} />
      <label class="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!d.sameShip} onChange={() => up({ sameShip: !d.sameShip, shipToParty: d.shipToParty?.name ? d.shipToParty : { ...(d.billTo ?? blankParty()) } })} /> Ship to the same party &amp; address</label>
      {!d.sameShip && <PartyForm title="Ship to" p={d.shipToParty ?? blankParty()} on={(shipToParty) => up({ shipToParty })} />}
      <ItemsForm lines={d.lines} on={(lines) => up({ lines })} />
      <Field label="Shipping ₹ (leave blank if none — the line is then left off the invoice)"><input class={inputCls} type="number" min="0" step="0.01" value={d.shipping || ""} onInput={(e) => up({ shipping: num(e) || undefined })} /></Field>
      <Totals i={d} />
      {errs.length > 0 && <ul class="rounded-xl border border-red/40 p-2.5 text-[12px] text-red list-disc pl-6">{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
      <div class="flex flex-wrap gap-2">
        {allowed ? <Button disabled={errs.length > 0} onClick={issue}>Issue invoice</Button> : <span class="t-meta">Only the Owner or a Partner can issue invoices.</span>}
        <Button variant="ghost" onClick={() => ask("Delete this draft? No number has been used.", { ok: "Delete draft", danger: true }).then((ok) => ok && deleteDraft(d))}>Delete draft</Button>
      </div>
    </div>
  );
}

/** Pick an order and the lines to bill. */
function FromOrder({ pre, onMade }: { pre?: Order; onMade: (d: Invoice) => void }) {
  const open = vOrders().filter((o) => o.type !== "inhouse" && !o.invoiced);
  const [no, setNo] = useState(pre?.no ?? ""), [sel, setSel] = useState<Set<number>>(new Set());
  const o = open.find((x) => x.no === no) ?? (pre && pre.no === no ? pre : undefined);
  const lines = o ? linesOf(o) : [];
  const toggle = (k: number) => { const n = new Set(sel); n.has(k) ? n.delete(k) : n.add(k); setSel(n); };
  const make = (all: boolean) => {
    if (!o) return; const pick = lines.filter((_, k) => all || sel.has(k)); if (!pick.length) return;
    onMade(newDraft({ billTo: lookupParty({ name: o.customer }) ?? { ...blankParty(), name: o.customer }, orderNo: o.no, lines: pick }));
  };
  return (
    <div class="flex flex-col gap-2">
      <Field label="Running order"><select class={inputCls} value={no} onChange={(e) => { setNo((e.target as HTMLSelectElement).value); setSel(new Set()); }}><option value="">Choose an order…</option>{open.map((x) => <option key={x.id} value={x.no}>{x.no} · {x.customer} · {x.items.length} item{x.items.length === 1 ? "" : "s"}</option>)}</select></Field>
      {o && <>
        <div class="listbox">{lines.map((l, k) => <label key={k} class="flex items-center gap-2 px-3 py-2 text-[13px] cursor-pointer"><input type="checkbox" checked={sel.has(k)} onChange={() => toggle(k)} /><span class="flex-1 min-w-0 truncate">{l.desc}</span><span class="num t-meta">{l.qty} × {inr(l.rate)}</span></label>)}</div>
        <div class="flex flex-wrap gap-2"><Button onClick={() => make(true)}>Add all line items</Button><Button variant="outline" disabled={!sel.size} onClick={() => make(false)}>Add selected ({sel.size})</Button></div>
        <p class="t-meta">Quantities and prices can be changed in the draft (e.g. part billing).</p>
      </>}
    </div>
  );
}

/** Invoice settings: used by invoices issued from now on. Issued invoices keep the details they were issued with. */
function InvoiceSettings() {
  const b = invoiceBiz.value;
  const set = (p: Partial<Biz>) => (bizSig.value = { ...bizSig.value, ...p });
  const f = (k: keyof Biz, l: string, wide = false) => <div class={wide ? "col-span-2" : ""}><Field label={l}><input class={inputCls} value={(b[k] as string) ?? ""} onInput={(e) => set({ [k]: val(e) } as Partial<Biz>)} /></Field></div>;
  const prefix = seriesPrefix("invoice");
  const [h, setH] = useState({ code: "", desc: "" });
  return (
    <div class="flex flex-col gap-3">
      <p class="rounded-xl bg-c1 p-2.5 text-[12px]">Changes here apply to invoices issued from now on. Invoices already issued never change. Drafts started earlier ask which details to use.</p>
      <div class="grid grid-cols-2 gap-2">
        {f("name", "Company name")}{f("gstin", "GSTIN")}
        {f("address", "Address (header)", true)}{f("addressShort", "Address (footer)", true)}
        <Field label="Company state"><select class={inputCls} value={b.state} onChange={(e) => set({ state: (e.target as HTMLSelectElement).value })}>{STATES.map(([n, c]) => <option key={c} value={n}>{n} ({c})</option>)}</select></Field>
        {f("phone", "Phone")}{f("email", "Email")}{f("website", "Website")}
        {f("upi", "UPI ID")}{f("upiNumber", "UPI number")}{f("bankName", "Bank")}{f("accName", "A/C name")}{f("accNo", "A/C number")}{f("ifsc", "IFSC")}
        {f("signName", "Signature name (printed in blue cursive)")}{f("thanks", "Thank-you line")}
      </div>
      <Field label="Terms and conditions (one per line)"><textarea class={inputCls} rows={5} value={b.invTerms} onInput={(e) => set({ invTerms: (e.target as HTMLTextAreaElement).value })} /></Field>
      <Field label={`Last invoice number already used in ${prefix} (issued outside Emerald)`}><input class={inputCls} type="number" min="0" value={b.seriesFloor?.[prefix] ?? 0} onInput={(e) => set({ seriesFloor: { ...(b.seriesFloor ?? {}), [prefix]: num(e) } })} /></Field>
      <p class="t-meta -mt-2">Next invoice will be <b>{nextNo("invoice")}</b>.</p>
      <div>
        <div class="text-[13px] font-semibold mb-1">HSN / SAC codes</div>
        <div class="listbox">{hsnSig.value.map((x) => <div key={x.id} class="flex items-center gap-2 px-3 py-2 text-[13px]"><b class="font-mono w-16">{x.code}</b><span class="flex-1 min-w-0">{x.desc}</span><button class="text-xs cursor-pointer" aria-label={`Remove ${x.code}`} onClick={() => ask(`Remove HSN ${x.code} from the list? Existing invoices keep it.`).then((ok) => ok && (hsnSig.value = hsnSig.value.filter((y) => y.id !== x.id)))}>✕</button></div>)}</div>
        <div class="grid grid-cols-[110px_1fr_auto] gap-2 mt-2 items-end">
          <Field label="Code"><input class={inputCls} value={h.code} onInput={(e) => setH({ ...h, code: val(e).replace(/\D/g, "") })} /></Field>
          <Field label="Description"><input class={inputCls} value={h.desc} onInput={(e) => setH({ ...h, desc: val(e) })} /></Field>
          <Button variant="outline" disabled={!/^\d{4,8}$/.test(h.code) || !h.desc.trim() || hsnSig.value.some((x) => x.code === h.code)} onClick={() => { hsnSig.value = [...hsnSig.value, { id: uid(), code: h.code, desc: h.desc.trim() }]; setH({ code: "", desc: "" }); }}>Add</Button>
        </div>
      </div>
    </div>
  );
}

/** An issued invoice: read-only, printable in one or more copies. */
function IssuedView({ cur, onCredit }: { cur: Invoice; onCredit: (i: Invoice) => void }) {
  const [copies, setCopies] = useState<string[]>([COPIES[0]]);
  const [cn, setCn] = useState(0);
  const allowed = canInvoice(me.value?.role);
  const d = fromInvoice(cur);
  const toggle = (c: string) => setCopies(copies.includes(c) ? copies.filter((x) => x !== c) : COPIES.filter((x) => x === c || copies.includes(x)));
  return (
    <div class="flex flex-col gap-3">
      <div class="rounded-xl bg-c1 p-2 text-xs">{cur.status === "cancelled" ? "Cancelled — the number stays used in the series." : "Issued — locked. Correct mistakes by cancelling or with a credit note."}</div>
      <div class="flex flex-wrap items-center gap-2 no-print"><span class="text-[12px] text-c3">Copies to print</span>{COPIES.map((c) => <Chip key={c} active={copies.includes(c)} onClick={() => toggle(c)}>{c}</Chip>)}
        <Button onClick={() => window.print()} disabled={!copies.length}>Print / save PDF</Button></div>
      <div class="doc-scroll"><div class="print-area flex flex-col gap-4">{(copies.length ? copies : [undefined]).map((c, k) => <DocSheet key={k} d={d} copy={cur.billTo ? c : undefined} />)}</div></div>
      {cur.kind === "invoice" && cur.status === "issued" && (cur.paidOn
        ? <div class="flex items-center justify-between text-sm"><Status tone="done">Paid {shortDate(cur.paidOn)}</Status><Button variant="ghost" onClick={() => markUnpaid(cur)}>Mark unpaid</Button></div>
        : <div class="flex flex-wrap items-center gap-2">{accountsSig.value.map((a) => <Button key={a.id} variant="outline" onClick={() => markPaid(cur, a.id)}>Paid → {a.name.split(" ")[0]}</Button>)}</div>)}
      {allowed && cur.kind === "invoice" && cur.status === "issued" && (
        <div class="flex flex-wrap items-end gap-2 border-t border-line pt-2">
          <Field label="Credit note ₹ (taxable)"><input class={inputCls} type="number" value={cn || ""} onInput={(e) => setCn(num(e))} /></Field>
          <Button variant="outline" onClick={() => { if (cn) { onCredit(creditNote(cur, cn, prompt("Reason") ?? "")); setCn(0); } }}>Issue credit note</Button>
          {!monthLocked(cur.date) && <Button variant="ghost" onClick={() => ask(`Cancel ${cur.no}? The number stays used.`).then((ok) => ok && cancelInvoice(cur))}>Cancel invoice</Button>}
        </div>
      )}
    </div>
  );
}

export function Invoice() {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState<{ id: string; pane: "draft" | "issued" } | { pane: "new" | "settings"; order?: Order } | null>(null);
  useEffect(() => { fixKnownInvoices(); }, []);
  const allowed = canInvoice(me.value?.role);
  const cur = open && "id" in open ? (open.pane === "draft" ? draftsSig.value.find((x) => x.id === open.id) : invoicesSig.value.find((x) => x.id === open.id)) : undefined;
  const drafted = (o: string, b?: string) => draftsSig.value.some((d) => d.orderNo === o && d.batch === b);
  const waiting = vOrders().filter((o) => o.stage === "invoice" && !o.invoiced && !invoicesSig.value.some((i) => i.orderNo === o.no && i.status === "issued" && !i.batch) && !drafted(o.no));
  const bw = batchesSig.value.filter((b) => b.stage === "invoice" && !b.invoiceNo && !drafted(b.orderNo, b.name));
  const reg = [...invoicesSig.value].filter((i) => f === "all" || (f === "paid" ? !!i.paidOn : f === "credit" ? i.kind === "credit" : f === "cancelled" ? i.status === "cancelled" : !i.paidOn && i.kind === "invoice" && i.status === "issued")).sort((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true }));
  const dup = new Set(invoicesSig.value.map((i) => i.no).filter((n, k, a) => a.indexOf(n) !== k));
  const draftFor = (o: Order, b?: { name: string; units: number }) => {
    const lines = b ? [{ desc: `${o.items[0]?.name ?? "Item"} — ${b.name}`, hsn: "491199", qty: b.units, rate: o.items[0]?.price ?? 0 }] : linesOf(o);
    const d = newDraft({ billTo: lookupParty({ name: o.customer }) ?? { ...blankParty(), name: o.customer }, orderNo: o.no, batch: b?.name, lines });
    setOpen({ id: d.id, pane: "draft" });
  };
  const title = !open ? "" : open.pane === "settings" ? "Invoice settings" : open.pane === "new" ? "New invoice" : cur ? `${cur.no} · ${cur.customer || "new"}` : "";
  return (
    <WorkShell stage="invoice" title="Invoice" sub={`Tax invoices · gapless series per FY · next ${nextNo("invoice")}`}
      actions={allowed && <><Button variant="outline" onClick={() => setOpen({ pane: "settings" })}>Invoice settings</Button><Button icon="plus" onClick={() => setOpen({ pane: "new" })}>New invoice</Button></>}
      toolbar={<div class="flex flex-wrap gap-2"><Pick value={f} on={setF} items={["all", "unpaid", "paid", "credit", "cancelled"]} label={(s) => s[0].toUpperCase() + s.slice(1)} /></div>}
      detail={open && (
        <div>
          <DetailHead title={title} onClose={() => setOpen(null)} />
          {open.pane === "settings" && <InvoiceSettings />}
          {open.pane === "new" && <div class="flex flex-col gap-4">
            <Card><CardTitle>From scratch</CardTitle><p class="t-meta mb-2">Fill in the client, items and tax state yourself.</p><Button onClick={() => setOpen({ id: newDraft().id, pane: "draft" })}>Start blank invoice</Button></Card>
            <Card><CardTitle>From a running order</CardTitle><FromOrder pre={open.order} onMade={(d) => setOpen({ id: d.id, pane: "draft" })} /></Card>
          </div>}
          {"id" in open && !cur && <p class="text-sm text-c3">This draft was issued or deleted.</p>}
          {"id" in open && cur && open.pane === "draft" && <><DraftEditor d={cur} onIssued={(i) => setOpen({ id: i.id, pane: "issued" })} /><details class="mt-4"><summary class="text-[13px] cursor-pointer">Preview</summary><div class="doc-scroll mt-2"><DocSheet d={fromInvoice(cur)} /></div></details></>}
          {"id" in open && cur && open.pane === "issued" && <IssuedView cur={cur} onCredit={(i) => setOpen({ id: i.id, pane: "issued" })} />}
        </div>
      )}>
      {draftsSig.value.length > 0 && <Section title="Drafts" note={`${draftsSig.value.length} · not numbered yet`}>
        <div class="listbox">{draftsSig.value.map((d) => <button key={d.id} class="w-full flex items-center justify-between gap-3 px-3 h-10 text-[13px] text-left cursor-pointer" onClick={() => setOpen({ id: d.id, pane: "draft" })}>
          <span class="min-w-0 truncate"><b>{d.customer || "New invoice"}</b>{d.orderNo && <span class="t-meta"> · {d.orderNo}{d.batch ? " · " + d.batch : ""}</span>}</span><span class="num">{inr(invTax({ ...d, status: "issued" }).total)}</span></button>)}</div>
      </Section>}
      <Section title="Awaiting invoice" note={`${waiting.length + bw.length} · orders + batch dispatches`}>
        {waiting.length + bw.length === 0 ? <p class="text-sm text-c3">Nothing waiting.</p> : (
          <div class="listbox">
            {waiting.map((o) => (
              <div key={o.id} class="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_100px_auto] gap-x-3 items-center px-3 py-2 md:py-0 md:h-10 text-[13px]">
                <span class="min-w-0 truncate"><span class="font-mono text-[12px] font-bold mr-2">{o.no}</span><span class="font-medium">{o.customer}</span></span>
                <span class="hidden md:block t-meta truncate">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</span>
                <span class="hidden md:block num text-right">{inr(o.items.reduce((s, i) => s + i.qty * i.price, 0))}</span>
                {allowed ? <Button variant="outline" class="!h-7" onClick={() => setOpen({ pane: "new", order: o })}>Draft invoice</Button> : <span />}
              </div>
            ))}
            {bw.map((b) => { const o = vOrders().find((x) => x.no === b.orderNo); return o && (
              <div key={b.id} class="w-full grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1.6fr)_100px_auto] gap-x-3 items-center px-3 py-2 md:py-0 md:h-10 text-[13px]">
                <span class="min-w-0 truncate"><span class="font-mono text-[12px] font-bold mr-2">{b.orderNo}</span><span class="font-medium">{b.name}</span></span>
                <span class="hidden md:block t-meta truncate">Batch dispatch · {b.customer} · {b.units} units</span>
                <span class="hidden md:block" />
                {allowed ? <Button variant="outline" class="!h-7" onClick={() => draftFor(o, b)}>Draft dispatch invoice</Button> : <span />}
              </div>); })}
          </div>
        )}
      </Section>
      <Section title="Register" note={`${reg.length}`}>
        {dup.size > 0 && <div class="rounded-xl border border-red/40 p-2.5 text-[12px] text-red mb-2">Duplicate invoice number{dup.size > 1 ? "s" : ""}: {[...dup].join(", ")} — two devices issued at the same moment. Cancel one and re-issue it.</div>}
        <Card class="!py-1">
          <Table rows={reg} rowKey={(i) => i.id} onRow={(i) => setOpen({ id: i.id, pane: "issued" })} cols={[
            { key: "n", label: "No.", render: (i) => <b>{i.no}</b> },
            { key: "d", label: "Date", render: (i) => shortDate(i.date) },
            { key: "c", label: "Customer", render: (i) => i.customer },
            { key: "o", label: "Order", render: (i) => (i.orderNo ? `${i.orderNo}${i.batch ? " · " + i.batch : ""}` : "—"), hideTablet: true },
            { key: "t", label: "Taxable", align: "right", render: (i) => inr(invTax(i).taxable), hideTablet: true },
            { key: "v", label: "Total", align: "right", render: (i) => inr(invTax(i).total) },
            { key: "p", label: "Status", card: "status", render: (i) => <Status tone={i.status === "cancelled" ? "idle" : i.kind === "credit" ? "active" : i.paidOn ? "done" : "waiting"}>{i.status === "cancelled" ? "Cancelled" : i.kind === "credit" ? "Credit note" : i.paidOn ? "Paid" : "Unpaid"}</Status> },
          ]} />
        </Card>
      </Section>
    </WorkShell>
  );
}

/* ======================================================= Quotation register */
export function Quotes() {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState<Quote | null>(null);
  const [view, setView] = useState<"edit" | "doc">("edit");
  const cur = open && (vQuotes().find((q) => q.id === open.id) ?? open);
  const upd = (q: Quote, p: Partial<Quote>) => { quotesSig.value = quotesSig.value.map((x) => (x.id === q.id ? { ...x, ...p } : x)); if (p.outcome) log(`Quote ${p.outcome}`, q.no); };
  const rows = [...vQuotes()].filter((q) => f === "all" || q.outcome === f).sort((a, b) => b.no.localeCompare(a.no));
  const make = (o?: Order) => { const valid = new Date(Date.now() + rate("quoteValid") * 864e5).toISOString().slice(0, 10);
    const q: Quote = { id: uid(), no: nextNo("quote"), date: today(), customer: o?.customer ?? "", orderNo: o?.no, lines: o ? linesOf(o) : [{ desc: "", hsn: "491199", qty: 1, rate: 0 }], gstRate: rate("gst"), valid, outcome: "open", pay: o?.pay };
    quotesSig.value = [...quotesSig.value, q]; log("Created quotation", q.no); setOpen(q); setView("edit"); };
  const pending = vOrders().filter((o) => o.stage === "quotation" && !vQuotes().some((q) => q.orderNo === o.no));
  const cnt = (s: string) => vQuotes().filter((q) => q.outcome === s);
  return (
    <WorkShell title="Quotation register" sub="Every quote and its outcome — unknown is never folded into lost" actions={<Button icon="plus" onClick={() => make()}>New quotation</Button>}
      toolbar={<div class="flex flex-wrap gap-2"><Pick value={f} on={setF} items={["all", "open", "approved", "lost", "unrecorded"]} label={(s) => s[0].toUpperCase() + s.slice(1)} /></div>}
      detail={cur && (
        <div>
          <DetailHead title={`${cur.no} · ${cur.customer || "new"}`} onClose={() => setOpen(null)} />
          <div class="mb-2"><SubTabs value={view} onChange={setView} items={[["edit", "Details"], ["doc", "Document"]]} /></div>
          {view === "doc" ? <><div class="doc-scroll"><div class="print-area"><DocSheet d={fromQuote(cur)} /></div></div><Button class="mt-3" onClick={() => window.print()}>Print / save PDF</Button></> : (
            <div class="flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-2">
                <Field label="Customer"><input class={inputCls} list="mem-qcust" value={cur.customer} onInput={(e) => { const v = (e.target as HTMLInputElement).value; const p = lookupParty({ name: v }); upd(cur, { customer: v, ...(p && !cur.address ? { address: [p.address, stateLabel(p.state)].filter(Boolean).join(", ") } : {}) }); }} /><datalist id="mem-qcust">{[...new Set([...clientsSig.value.map((c) => c.name), ...quotesSig.value.map((q) => q.customer)].filter(Boolean))].sort().map((n) => <option key={n} value={n} />)}</datalist></Field>
                <Field label="Valid until"><input class={inputCls} type="date" value={cur.valid} onInput={(e) => upd(cur, { valid: (e.target as HTMLInputElement).value })} /></Field>
                <Field label="Address"><input class={inputCls} value={cur.address ?? ""} onInput={(e) => upd(cur, { address: (e.target as HTMLInputElement).value || undefined })} /></Field>
              </div>
              <Field label="Technical data (one per line — print time, weight, finish, delivery)"><textarea class={inputCls} rows={3} value={cur.tech ?? ""} onInput={(e) => upd(cur, { tech: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
              <LinesEditor lines={cur.lines} on={(l) => upd(cur, { lines: l })} />
              <div class="flex justify-between text-sm font-semibold border-t border-line pt-2"><span>Total incl. GST</span><span class="num">{inr(cur.lines.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + cur.gstRate / 100))}</span></div>
              {canSwitchMode() && <div class="flex flex-wrap items-center gap-2 mb-2"><span class="text-[12px] text-c3">Client will pay</span>{(["alpha", "beta"] as const).map((m) => <Chip key={m} active={(cur.pay ?? "alpha") === m} onClick={() => { upd(cur, { pay: m }); if (cur.orderNo) ordersSig.value = ordersSig.value.map((x) => (x.no === cur.orderNo ? { ...x, pay: m } : x)); }}>{PAY_LABEL[m]}</Chip>)}</div>}
              <div class="flex flex-wrap gap-2">{(["open", "approved", "lost", "unrecorded"] as const).map((o) => <Chip key={o} active={cur.outcome === o} onClick={() => { upd(cur, { outcome: o }); const ord = vOrders().find((x) => x.no === cur.orderNo); if (ord && o === "approved" && !ord.approved) patchOrder(ord, { approved: true }); }}>{o}</Chip>)}</div>
              
            </div>
          )}
        </div>
      )}>
      <div class="strip grid grid-cols-4">
        <Stat value={cnt("open").length} label="Open" /><Stat value={cnt("approved").length} label="Approved" /><Stat value={cnt("lost").length} label="Lost" /><Stat value={cnt("unrecorded").length} label="Unrecorded" />
      </div>
      {pending.length > 0 && <Card><CardTitle>Orders at Quotation without a quote</CardTitle><div class="flex flex-wrap gap-2">{pending.map((o) => <Button key={o.id} variant="outline" onClick={() => make(o)}>Quote {o.no} · {o.customer}</Button>)}</div></Card>}
      <Card class="!py-1">
        <Table rows={rows} rowKey={(q) => q.id} onRow={(q) => { setOpen(q); setView("edit"); }} cols={[
          { key: "n", label: "Quote", render: (q) => <b>{q.no}</b> },
          { key: "d", label: "Date", render: (q) => shortDate(q.date) },
          { key: "c", label: "Customer", render: (q) => q.customer },
          { key: "v", label: "Valid till", render: (q) => shortDate(q.valid) },
          { key: "o", label: "Outcome", card: "status", render: (q) => <Status tone={q.outcome === "approved" ? "done" : q.outcome === "lost" ? "blocked" : q.outcome === "open" ? "waiting" : "idle"}>{q.outcome}</Status> },
          { key: "a", label: "Value", align: "right", render: (q) => inr(q.lines.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + q.gstRate / 100)) },
        ]} />
      </Card>
    </WorkShell>
  );
}

/* ======================================================= Documents */
export function Documents() {
  const [sel, setSel] = useState<DocData | null>(null);
  const [kind, setKind] = useState("all");
  const docs = [
    ...vQuotes().map((q) => ({ id: q.id, kind: "Quotation", no: q.no, party: q.customer, date: q.date, d: () => fromQuote(q) })),
    ...invoicesSig.value.map((i) => ({ id: i.id, kind: i.kind === "credit" ? "Credit note" : "Tax invoice", no: i.no, party: i.customer, date: i.date, d: () => fromInvoice(i) })),
    ...shipmentsSig.value.map((s) => ({ id: s.id, kind: "Delivery challan", no: `DC-${s.id.slice(0, 4).toUpperCase()}`, party: vOrders().find((o) => o.no === s.orderNo)?.customer ?? s.orderNo, date: s.date,
      d: (): DocData => ({ kind: "challan", title: "Delivery challan", no: `DC-${s.id.slice(0, 4).toUpperCase()}`, date: s.date, party: vOrders().find((o) => o.no === s.orderNo)?.customer ?? "", lines: s.lines.map((l) => ({ desc: l.name, hsn: "491199", qty: l.qty, rate: 0 })), gstRate: 0, interstate: false, extra: [["Order", s.orderNo], ["Courier", `${s.courier} ${s.tracking}`]], note: "Not a tax invoice — goods sent for delivery." }) })),
  ].filter((d) => kind === "all" || d.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <WorkShell title="Documents" sub="The generator — every quotation, invoice, credit note and challan, printable"
      toolbar={<div class="flex flex-wrap gap-2"><Pick value={kind} on={setKind} items={["all", "Quotation", "Tax invoice", "Credit note", "Delivery challan"]} label={(k) => k === "all" ? "All" : k} /></div>}
      detail={sel && <div><DetailHead title={`${sel.title} · ${sel.no}`} onClose={() => setSel(null)} /><div class="doc-scroll"><div class="print-area"><DocSheet d={sel} /></div></div><Button class="mt-3" onClick={() => window.print()}>Print / save PDF</Button></div>}>
      <Card class="!py-1">
        {docs.length ? <Table rows={docs} rowKey={(d) => d.id} onRow={(d) => setSel(d.d())} cols={[
          { key: "n", label: "Number", render: (d) => <b>{d.no}</b> }, { key: "k", label: "Kind", render: (d) => d.kind },
          { key: "p", label: "Party", render: (d) => d.party }, { key: "d", label: "Date", render: (d) => shortDate(d.date) },
        ]} /> : <Empty title="No documents" />}
      </Card>
    </WorkShell>
  );
}

/* ======================================================= Shipping · partial dispatch */
export function Shipping() {
  const [sel, setSel] = useState<Shipment | null>(null);
  const ships = vOrders().filter((o) => o.stage === "shipping" || o.stage === "invoice" || o.stage === "packing");
  const [orderNo, setOrderNo] = useState(ships[0]?.no ?? "");
  const o = vOrders().find((x) => x.no === orderNo);
  const sent = (name: string) => shipmentsSig.value.filter((s) => s.orderNo === orderNo).reduce((a, s) => a + (s.lines.find((l) => l.name === name)?.qty ?? 0), 0);
  const [d, setD] = useState({ courier: "Delhivery", service: "Surface", tracking: "", paid: rate("freight"), rec: 0, qty: {} as Record<string, number>, photo: "" });
  const save = () => {
    if (!o) return;
    const lines = o.items.map((i) => ({ name: i.name, qty: d.qty[i.name] ?? Math.max(0, i.qty - sent(i.name)) })).filter((l) => l.qty > 0);
    const s: Shipment = { id: uid(), orderNo: o.no, date: today(), courier: d.courier, service: d.service, tracking: d.tracking, lines, freightPaid: d.paid, freightRecovered: d.rec, eta: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10) };
    shipmentsSig.value = [s, ...shipmentsSig.value];
    if (d.photo) photosSig.value = [...photosSig.value, { id: uid(), ref: o.no, stage: "courier handover", name: "handover", data: storeMedia(d.photo, "handover " + o.no), at: nowS() }];
    if (d.paid) consume({ kind: "freight", item: `${d.courier} ${d.service}`, qty: d.paid, orderNo: o.no });
    patchOrder(o, { tracking: d.tracking || o.tracking });
    log(`Dispatched ${lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`, o.no);
    setD({ ...d, tracking: "", qty: {}, photo: "" });
  };
  return (
    <WorkShell stage="shipping" title="Shipping" sub="Courier, tracking, freight paid vs recovered · many dispatches per order, part quantities allowed"
      detail={sel && <Inspect title={`${sel.orderNo} · ${sel.courier}`} row={{ order: sel.orderNo, sent: shortDate(sel.date), eta: shortDate(sel.eta), courier: sel.courier, service: sel.service, tracking: sel.tracking || "Missing", contents: sel.lines.map((l) => `${l.qty}× ${l.name}`).join(", "), freightPaid: inr(sel.freightPaid), recovered: inr(sel.freightRecovered), net: inr(sel.freightPaid - sel.freightRecovered) }} onClose={() => setSel(null)}>
        <div class="flex flex-wrap items-end gap-2"><input class={`${inputCls} flex-1 min-w-0`} placeholder="Tracking no." defaultValue={sel.tracking} id="trk" /><Button onClick={() => { const v = (document.getElementById("trk") as HTMLInputElement).value; shipmentsSig.value = shipmentsSig.value.map((x) => (x.id === sel.id ? { ...x, tracking: v } : x)); setSel({ ...sel, tracking: v }); log("Updated tracking", sel.orderNo); }}>Save tracking</Button></div>
        {(() => { const ph = sel.photo || photosSig.value.find((p) => p.ref === sel.orderNo && p.stage === "courier handover")?.data; return ph && <MediaImg v={ph} alt="Handover" class="mt-3 rounded-xl max-h-48" />; })()}</Inspect>}>
      <div class="strip grid grid-cols-3">
        <Stat value={shipmentsSig.value.length} label="dispatches" />
        <Stat value={inr(shipmentsSig.value.reduce((s, x) => s + x.freightPaid, 0))} label="freight paid" />
        <Stat value={inr(shipmentsSig.value.reduce((s, x) => s + x.freightRecovered, 0))} label="recovered" />
      </div>
      <Section title="New dispatch">
        <Card class="flex flex-col gap-2">
          <div class="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end">
            <Field label="Order"><select class={inputCls} value={orderNo} onChange={(e) => setOrderNo((e.target as HTMLSelectElement).value)}>{vOrders().filter((x) => x.stage !== "archived").map((x) => <option key={x.id} value={x.no}>{x.no} · {x.customer}</option>)}</select></Field>
            <Field label="Courier"><select class={inputCls} value={d.courier} onChange={(e) => setD({ ...d, courier: (e.target as HTMLSelectElement).value })}>{sortAbc(["Delhivery", "DTDC", "Blue Dart", "India Post", "Shiprocket", "Hand delivery"]).map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Service"><input class={inputCls} value={d.service} onInput={(e) => setD({ ...d, service: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Tracking no."><input class={inputCls} value={d.tracking} onInput={(e) => setD({ ...d, tracking: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Freight paid ₹"><input class={inputCls} type="number" value={d.paid} onInput={(e) => setD({ ...d, paid: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
            <Field label="Recovered ₹"><input class={inputCls} type="number" value={d.rec} onInput={(e) => setD({ ...d, rec: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
          </div>
          {o && <ul class="text-sm">{o.items.map((i) => { const left = i.qty - sent(i.name); return (
            <li key={i.name} class="flex items-center justify-between gap-2 py-1 border-t border-line"><span>{i.name} <span class="text-xs text-c3">{sent(i.name)}/{i.qty} shipped</span></span>
              <input class="h-8 w-20 px-2 rounded-lg border border-c3 bg-c0 text-xs" type="number" aria-label={`Qty of ${i.name} in this dispatch`} value={d.qty[i.name] ?? Math.max(0, left)} onInput={(e) => setD({ ...d, qty: { ...d.qty, [i.name]: Number((e.target as HTMLInputElement).value) || 0 } })} /></li>); })}</ul>}
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs underline cursor-pointer">{d.photo ? "Photo attached ✓" : "Handover photo"}<input type="file" accept="image/*" capture="environment" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { shrinkImage(f).then((photo) => setD({ ...d, photo })); } }} /></label>
            <Button onClick={save}>Save dispatch</Button>
          </div>
        </Card>
      </Section>
      <Section title="Dispatches" note={String(shipmentsSig.value.length)}>
        <Card class="!py-1">
          <Table rows={shipmentsSig.value} rowKey={(s) => s.id} onRow={setSel} cols={[
            { key: "o", label: "Order", render: (s) => <b>{s.orderNo}</b> },
            { key: "l", label: "Contents", render: (s) => s.lines.map((l) => `${l.qty}× ${l.name}`).join(", ") },
            { key: "c", label: "Courier", render: (s) => `${s.courier} · ${s.service}` },
            { key: "t", label: "Tracking", render: (s) => s.tracking || <Status tone="blocked">Missing</Status> },
            { key: "e", label: "Sent / ETA", render: (s) => `${shortDate(s.date)} → ${shortDate(s.eta)}`, hideTablet: true },
            { key: "f", label: "Paid / rec.", align: "right", render: (s) => `${inr(s.freightPaid)} / ${inr(s.freightRecovered)}` },
          ]} />
        </Card>
      </Section>
    </WorkShell>
  );
}

/* ======================================================= Clients (records + figures derived from orders) */
const cFields: FDef<Client>[] = [
  { k: "name", label: "Name", wide: true }, { k: "kind", label: "Kind", type: "select", options: ["Individual", "Business", "Reseller"] },
  { k: "medium", label: "Came via", type: "select", options: ["Instagram", "WhatsApp", "Website", "Referral", "Phone", "Email", "Walk-in", "Shopify"] },
  { k: "phone", label: "Phone" }, { k: "email", label: "Email" }, { k: "city", label: "City" }, { k: "gstin", label: "GSTIN" },
  { k: "address", label: "Billing address", type: "textarea" }, { k: "notes", label: "Notes", type: "textarea" },
];
export function Clients() {
  const [q, setQ] = useState("");
  const known = new Set(clientsSig.value.map((c) => c.name));
  const extra: Client[] = [...new Set(vOrders().filter((o) => o.type !== "inhouse" && !known.has(o.customer)).map((o) => o.customer))].map((n) => ({ id: `o:${n}`, name: n, kind: "Individual", phone: "", city: "", gstin: "", medium: vOrders().find((o) => o.customer === n)?.medium ?? "", active: true }));
  const stats = (n: string) => { const os = vOrders().filter((o) => o.customer === n); const inv = invoicesSig.value.filter((i) => i.customer === n && i.status === "issued");
    return { os, orders: os.length, value: os.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty * i.price, 0), 0), owed: inv.filter((i) => !i.paidOn && i.kind === "invoice").reduce((s, i) => s + invTax(i).total, 0), inv }; };
  const r = useRecord<Client>({ sig: clientsSig, kind: "Client", title: (c) => c.name, fields: cFields, logKind: "order",
    blank: () => ({ id: uid(), name: "", kind: "Individual", phone: "", email: "", city: "", gstin: "", medium: "Instagram", address: "", notes: "", active: true }),
    facts: (c) => { const x = stats(c.name); return [["Orders", x.orders], ["Lifetime value", inr(x.value)], ["Owes", x.owed ? inr(x.owed) : "Nothing"], ["Invoices", x.inv.length]]; },
    extra: (c) => { const x = stats(c.name); return <PaneSection title="Orders">{x.os.length ? x.os.map((o) => <div key={o.id} class="flex justify-between gap-2 text-sm py-1 border-t border-line first:border-0"><span class="min-w-0"><b>{o.no}</b> · {o.items.map((i) => i.name).join(", ")}</span><span class="text-c3 whitespace-nowrap">{o.stage}</span></div>) : <p class="text-sm text-c3">No orders yet.</p>}</PaneSection>; } });
  const rows = [...clientsSig.value.filter((c) => c.active !== false), ...extra].filter((c) => !q || `${c.name} ${c.city} ${c.phone} ${c.gstin}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <WorkShell title="Clients" sub="Every customer — contact, GSTIN, orders, value and what they owe" detail={r.detail} actions={<Button icon="plus" onClick={() => r.add()}>Add client</Button>}
      toolbar={<input class="h-7 2xl:h-8 px-3 rounded-full bg-c0 text-xs w-full sm:w-56" placeholder="Search name, city, phone, GSTIN" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search clients" />}>
      <Card class="!py-1">
        <Table rows={rows} rowKey={(c) => c.id} onRow={(c) => { if (c.id.startsWith("o:")) { const n = { ...c, id: uid() }; clientsSig.value = [n, ...clientsSig.value]; r.open(n); } else r.open(c); }} cols={[
          { key: "n", label: "Client", render: (c) => c.name },
          { key: "k", label: "Kind", render: (c) => c.kind },
          { key: "p", label: "Phone", render: (c) => c.phone || "—" },
          { key: "c", label: "City", render: (c) => c.city || "—", hideTablet: true },
          { key: "g", label: "GSTIN", render: (c) => c.gstin || "—", hideTablet: true },
          { key: "m", label: "Came via", render: (c) => c.medium || "—" },
          { key: "o", label: "Orders", align: "right", render: (c) => stats(c.name).orders },
          { key: "v", label: "Lifetime", align: "right", render: (c) => inr(stats(c.name).value) },
          { key: "w", label: "Owes", align: "right", render: (c) => { const o = stats(c.name).owed; return o ? inr(o) : "—"; } },
        ]} />
      </Card>
    </WorkShell>
  );
}
