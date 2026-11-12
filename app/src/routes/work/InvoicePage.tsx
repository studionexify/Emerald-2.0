import { blankParty, canInvoice, COPIES, deleteDraft, draftOutdated, draftsSig, fixKnownInvoices, hsnSig, invoiceBiz, issueDraft, lookupParty, newDraft, problems, sellerNow, STATES, stateOfGstin, updateDraft , missingAddress, setMissingAddress } from "../../data/invoicing";
import { sortAbc } from "../../mock/types";
import {ordersSig} from "../../data";
import {vOrders} from "../../data";
import { useEffect, useState } from "preact/hooks";
import { ask, Pick, Button, Card, CardTitle, Field, Icon, inputCls, Section, Sheet, Status, Table } from "../../ui";
import { Menu } from "../../ui/disclose";
import { downloadInvoicePdf, FitA4 } from "./pdf";
import { navigate } from "../../router";
import { openOrderSig, segmentOf, SEGMENT_HREF } from "../../data/inventory";
import {accountsSig, batchesSig, cancelInvoice, creditNote, inr, invoicesSig, invTax, markPaid, markUnpaid, monthLocked, nextNo, shortDate, today, uid, patchOrder, type InvLine, type Invoice, type Order, me, seriesPrefix, type Party} from "../../data";
import { bizSig, type Biz } from "../../data/biz";
import {clientsSig} from "../../data";
import { DocSheet, fromInvoice } from "./Doc";
import { WorkShell } from "./shared";

const linesOf = (o: Order): InvLine[] => o.items.map((i) => ({ desc: `${i.name} (${i.material} ${i.colour})`, hsn: "491199", qty: i.qty, rate: i.price }));

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

/** Draft form: everything is editable until it is issued. */
function DraftForm({ d }: { d: Invoice }) {
  const up = (p: Partial<Invoice>) => updateDraft(d, p);
  const errs = problems(d);
  return (
    <div class="flex flex-col gap-3">
      {draftOutdated(d) && <div class="rounded-xl bg-warn/15 p-2.5 text-[12px] flex flex-wrap items-center gap-2"><span class="flex-1 min-w-[180px]">Invoice settings changed since this draft was started.</span>
        <Button variant="outline" class="!h-7" onClick={() => up({ seller: sellerNow() })}>Use new details</Button><span class="t-meta">or keep the old ones (asked when you issue)</span></div>}
      <div class="grid grid-cols-2 gap-2 md:max-w-[520px]">
        <Field label="Invoice date"><input class={inputCls} type="date" max={today()} value={d.date} onInput={(e) => up({ date: val(e) })} /></Field>
        <Field label="Number (given when issued)"><input class={inputCls} disabled value={nextNo("invoice", d.date)} /></Field>
      </div>
      <div class="grid gap-3 md:grid-cols-2 items-start">
        <PartyForm title="Bill to" p={d.billTo ?? blankParty()} on={(billTo) => up({ billTo })} />
        <div class="flex flex-col gap-2">
          <label class="flex items-center gap-2 text-[13px] min-h-10"><input type="checkbox" checked={!!d.sameShip} onChange={() => up({ sameShip: !d.sameShip, shipToParty: d.shipToParty?.name ? d.shipToParty : { ...(d.billTo ?? blankParty()) } })} /> Ship to the same party &amp; address</label>
          {!d.sameShip && <PartyForm title="Ship to" p={d.shipToParty ?? blankParty()} on={(shipToParty) => up({ shipToParty })} />}
        </div>
      </div>
      <ItemsForm lines={d.lines} on={(lines) => up({ lines })} />
      <div class="grid gap-3 md:grid-cols-2 items-start">
        <Field label="Shipping ₹ (blank = no shipping line on the invoice)"><input class={inputCls} type="number" min="0" step="0.01" value={d.shipping || ""} onInput={(e) => up({ shipping: num(e) || undefined })} /></Field>
        <Totals i={d} />
      </div>
      {errs.length > 0 && <ul class="rounded-xl border border-red/40 p-2.5 text-[12px] text-red list-disc pl-6">{errs.map((x) => <li key={x}>{x}</li>)}</ul>}
    </div>
  );
}

const pdfName = (i: Invoice, copy?: string) => `Tax Invoice - ${i.no}${copy?.startsWith("Duplicate") ? " - Transporter copy" : ""}.pdf`;
async function savePdf(i: Invoice, copy?: string) {
  try { await downloadInvoicePdf(fromInvoice(i), [i.billTo ? copy ?? COPIES[0] : undefined], pdfName(i, copy)); }
  catch (e) { alert("Could not create the PDF: " + (e as Error).message); }
}
const goOrder = (no?: string) => { const o = no && vOrders().find((x) => x.no === no); if (!o) return; openOrderSig.value = o.no; navigate(SEGMENT_HREF[segmentOf(o)]); };

/** Floating window for a draft: fill in → review the A4 page → issue, which takes the number and downloads the PDF. */
function DraftWindow({ d, onClose, onIssued }: { d: Invoice; onClose: () => void; onIssued: (i: Invoice) => void }) {
  const [step, setStep] = useState<"edit" | "review">("edit");
  const [busy, setBusy] = useState(false);
  const allowed = canInvoice(me.value?.role);
  const errs = problems(d);
  const next = nextNo("invoice", d.date);
  const issue = async () => {
    let keepOld = true;
    if (draftOutdated(d)) keepOld = !(await ask("Invoice settings (company details, terms, bank…) changed after this draft was started. Use the NEW details on this invoice? Cancel keeps the details it was started with.", { ok: "Use new details" }));
    if (!(await ask(`Issue this invoice as ${next}? Once issued it cannot be edited — only cancelled (number kept) or corrected with a credit note.`, { ok: `Issue ${next}` }))) return;
    let inv: Invoice; try { inv = issueDraft(d, keepOld); } catch (e) { alert((e as Error).message); return; }
    if (inv.batch) batchesSig.value = batchesSig.value.map((b) => (b.orderNo === inv.orderNo && b.name === inv.batch ? { ...b, invoiceNo: inv.no } : b));
    else if (inv.orderNo) { const o = ordersSig.value.find((x) => x.no === inv.orderNo); if (o) patchOrder(o, { invoiced: true }); }
    setBusy(true); await savePdf(inv); setBusy(false);
    onIssued(inv);
  };
  const footer = step === "edit"
    ? <><Button variant="outline" onClick={() => ask("Delete this draft? No number has been used.", { ok: "Delete draft", danger: true }).then((ok) => { if (ok) { deleteDraft(d); onClose(); } })}>Delete draft</Button>
        <Button disabled={errs.length > 0} onClick={() => setStep("review")}>Review →</Button></>
    : <><Button variant="outline" onClick={() => setStep("edit")}>← Edit</Button>
        {allowed ? <Button disabled={busy || errs.length > 0} onClick={issue}>{busy ? "Preparing PDF…" : `Issue ${next} & download PDF`}</Button> : <Button disabled>Only Owner / Partner can issue</Button>}</>;
  return (
    <Sheet huge open onClose={onClose} title={step === "edit" ? (d.customer ? `Invoice · ${d.customer}` : "New invoice") : `Review · ${next}`} footer={footer}>
      <div class="w-full md:w-[min(980px,86vw)]">
        {step === "edit" ? <DraftForm d={d} /> : <>
          <p class="rounded-xl bg-c1 p-2.5 text-[12px] mb-3">Check every detail. Issuing gives it number <b>{next}</b>, locks it and downloads the PDF to this device.</p>
          <FitA4><DocSheet d={{ ...fromInvoice(d), no: next, draft: false }} /></FitA4>
        </>}
      </div>
    </Sheet>
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

/** Fill missing client details on older invoices from the Excel invoice book (one sheet per invoice). */
function BookImport() {
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const pick = async (f?: File | null) => {
    if (!f) return; setBusy(true); setMsg("");
    try {
      const { readXlsx, applyBook } = await import("../../data/xlsx-book");
      const r = applyBook(readXlsx(await f.arrayBuffer()));
      setMsg([r.filled.length ? `Filled details on ${r.filled.length}: ${r.filled.join(", ")}.` : "No missing details to fill.", r.already.length ? `Already complete: ${r.already.join(", ")}.` : "", r.notInEmerald.length ? `In the workbook but not in Emerald: ${r.notInEmerald.join(", ")}.` : "", r.mismatch.length ? `Skipped — customer differs: ${r.mismatch.join("; ")}.` : ""].filter(Boolean).join(" "));
    } catch (e) { setMsg("Could not read this file: " + (e as Error).message); }
    setBusy(false);
  };
  return <div class="rounded-xl border border-line p-2.5 flex flex-col gap-2">
    <div class="text-[13px] font-semibold">Fill missing addresses from your Excel invoice book</div>
    <p class="t-meta">Choose the .xlsx with one sheet per invoice (B-001, B-002 …). Bill-to and ship-to names, addresses, contacts and GSTINs are copied onto the matching invoices where they are missing, and saved to the clients. Numbers, dates, items and amounts never change.</p>
    <label class="inline-flex"><span class={`inline-flex items-center h-8 px-3.5 rounded-full border border-c3 text-[13px] font-semibold cursor-pointer ${busy ? "opacity-50" : ""}`}>{busy ? "Reading…" : "Choose Excel file"}</span>
      <input type="file" accept=".xlsx" class="sr-only" disabled={busy} onChange={(e) => { pick((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} /></label>
    {msg && <p class="text-[12px]" role="status">{msg}</p>}
  </div>;
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
      <BookImport />
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

/** Older invoices that came without an address: add it here (only the address changes; tax and number stay). */
function MissingAddress({ i }: { i: Invoice }) {
  const [a, setA] = useState("");
  return <div class="rounded-xl border border-warn p-2.5 flex flex-col gap-2">
    <p class="text-[12px]">This invoice has no billing address, and none is saved for {i.customer}. Add it once — it is also saved to the client for next time.</p>
    <textarea class={inputCls} rows={3} value={a} placeholder="Billing address" onInput={(e) => setA((e.target as HTMLTextAreaElement).value)} />
    <Button disabled={!a.trim()} onClick={() => setMissingAddress(i, a.trim())}>Save address</Button>
  </div>;
}

/** An issued invoice in a floating window: preview, download, transporter copy, payment, cancel / credit note. */
function ViewWindow({ cur, onClose, onOpen }: { cur: Invoice; onClose: () => void; onOpen: (i: Invoice) => void }) {
  const [cn, setCn] = useState(0), [busy, setBusy] = useState("");
  const allowed = canInvoice(me.value?.role);
  const run = async (what: string, copy?: string) => { setBusy(what); await savePdf(cur, copy); setBusy(""); };
  return (
    <Sheet huge open onClose={onClose} title={`${cur.no} · ${cur.customer}`}
      footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={!!busy} onClick={() => run("dl")}>{busy === "dl" ? "Preparing PDF…" : "Download PDF"}</Button></>}>
      <div class="w-full md:w-[min(860px,86vw)] flex flex-col gap-3">
        {allowed && missingAddress(cur) && <MissingAddress i={cur} />}
        <div class="rounded-xl bg-c1 p-2 text-xs">{cur.status === "cancelled" ? "Cancelled — the number stays used in the series." : "Issued — locked. Correct mistakes by cancelling or with a credit note."}</div>
        <div class="flex flex-wrap gap-2">
          {cur.billTo && <Button variant="outline" disabled={!!busy} onClick={() => run("tr", COPIES[1])}>{busy === "tr" ? "Preparing…" : "Create copy for transporter"}</Button>}
          {cur.orderNo && <Button variant="outline" onClick={() => { onClose(); goOrder(cur.orderNo); }}>Go to order {cur.orderNo}</Button>}
        </div>
        <FitA4><DocSheet d={fromInvoice(cur)} copy={cur.billTo ? COPIES[0] : undefined} /></FitA4>
        {cur.kind === "invoice" && cur.status === "issued" && (cur.paidOn
          ? <div class="flex items-center justify-between text-sm"><Status tone="done">Paid {shortDate(cur.paidOn)}</Status><Button variant="ghost" onClick={() => markUnpaid(cur)}>Mark unpaid</Button></div>
          : <div class="flex flex-wrap items-center gap-2">{accountsSig.value.map((a) => <Button key={a.id} variant="outline" onClick={() => markPaid(cur, a.id)}>Paid → {a.name.split(" ")[0]}</Button>)}</div>)}
        {allowed && cur.kind === "invoice" && cur.status === "issued" && (
          <div class="flex flex-wrap items-end gap-2 border-t border-line pt-2">
            <Field label="Credit note ₹ (taxable)"><input class={inputCls} type="number" value={cn || ""} onInput={(e) => setCn(num(e))} /></Field>
            <Button variant="outline" onClick={() => { if (cn) { onOpen(creditNote(cur, cn, prompt("Reason") ?? "")); setCn(0); } }}>Issue credit note</Button>
            {!monthLocked(cur.date) && <Button variant="ghost" onClick={() => ask(`Cancel ${cur.no}? The number stays used.`).then((ok) => ok && cancelInvoice(cur))}>Cancel invoice</Button>}
          </div>
        )}
      </div>
    </Sheet>
  );
}

type Win = { k: "new"; order?: Order } | { k: "draft"; id: string } | { k: "view"; id: string } | { k: "settings" };
export function Invoice() {
  const [f, setF] = useState("all");
  const [win, setWin] = useState<Win | null>(null);
  const [busy, setBusy] = useState("");
  useEffect(() => { fixKnownInvoices(); }, []);
  const allowed = canInvoice(me.value?.role);
  const close = () => setWin(null);
  const draft = win?.k === "draft" ? draftsSig.value.find((x) => x.id === win.id) : undefined;
  const viewed = win?.k === "view" ? invoicesSig.value.find((x) => x.id === win.id) : undefined;
  const drafted = (o: string, b?: string) => draftsSig.value.some((d) => d.orderNo === o && d.batch === b);
  const waiting = vOrders().filter((o) => o.stage === "invoice" && !o.invoiced && !invoicesSig.value.some((i) => i.orderNo === o.no && i.status === "issued" && !i.batch) && !drafted(o.no));
  const bw = batchesSig.value.filter((b) => b.stage === "invoice" && !b.invoiceNo && !drafted(b.orderNo, b.name));
  const reg = [...invoicesSig.value].filter((i) => f === "all" || (f === "paid" ? !!i.paidOn : f === "credit" ? i.kind === "credit" : f === "cancelled" ? i.status === "cancelled" : !i.paidOn && i.kind === "invoice" && i.status === "issued")).sort((a, b) => b.no.localeCompare(a.no, undefined, { numeric: true }));
  const dup = new Set(invoicesSig.value.map((i) => i.no).filter((n, k, a) => a.indexOf(n) !== k));
  const draftFor = (o: Order, b?: { name: string; units: number }) => {
    const lines = b ? [{ desc: `${o.items[0]?.name ?? "Item"} — ${b.name}`, hsn: "491199", qty: b.units, rate: o.items[0]?.price ?? 0 }] : linesOf(o);
    setWin({ k: "draft", id: newDraft({ billTo: lookupParty({ name: o.customer }) ?? { ...blankParty(), name: o.customer }, orderNo: o.no, batch: b?.name, lines }).id });
  };
  const rowDl = async (i: Invoice, copy?: string) => { setBusy(i.id + (copy ?? "")); await savePdf(i, copy); setBusy(""); };
  const iconBtn = "w-8 h-8 !min-h-0 rounded-lg inline-flex items-center justify-center hover:bg-c1 cursor-pointer disabled:opacity-40";
  return (
    <WorkShell stage="invoice" title="Invoice" sub={`Tax invoices · gapless series per FY · next ${nextNo("invoice")}`}
      actions={allowed && <><Button variant="outline" onClick={() => setWin({ k: "settings" })}>Invoice settings</Button><Button icon="plus" onClick={() => setWin({ k: "new" })}>New invoice</Button></>}
      toolbar={<div class="flex flex-wrap gap-2"><Pick value={f} on={setF} items={["all", "unpaid", "paid", "credit", "cancelled"]} label={(s) => s[0].toUpperCase() + s.slice(1)} /></div>}>
      {win?.k === "settings" && <Sheet huge open onClose={close} title="Invoice settings" footer={<Button onClick={close}>Done</Button>}><div class="w-full md:w-[min(760px,86vw)]"><InvoiceSettings /></div></Sheet>}
      {win?.k === "new" && <Sheet huge open onClose={close} title="New invoice">
        <div class="w-full md:w-[min(720px,86vw)] grid gap-4 md:grid-cols-2 items-start">
          <Card><CardTitle>From scratch</CardTitle><p class="t-meta mb-3">Fill in the client, items and tax state yourself.</p><Button onClick={() => setWin({ k: "draft", id: newDraft().id })}>Start blank invoice</Button></Card>
          <Card><CardTitle>From a running order</CardTitle><FromOrder pre={win.order} onMade={(d) => setWin({ k: "draft", id: d.id })} /></Card>
        </div>
      </Sheet>}
      {draft && <DraftWindow key={draft.id} d={draft} onClose={close} onIssued={(i) => setWin({ k: "view", id: i.id })} />}
      {viewed && <ViewWindow key={viewed.id} cur={viewed} onClose={close} onOpen={(i) => setWin({ k: "view", id: i.id })} />}
      {draftsSig.value.length > 0 && <Section title="Drafts" note={`${draftsSig.value.length} · not numbered yet`}>
        <div class="listbox">{draftsSig.value.map((d) => <button key={d.id} class="w-full flex items-center justify-between gap-3 px-3 h-10 text-[13px] text-left cursor-pointer" onClick={() => setWin({ k: "draft", id: d.id })}>
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
                {allowed ? <Button variant="outline" class="!h-7" onClick={() => setWin({ k: "new", order: o })}>Draft invoice</Button> : <span />}
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
          <Table rows={reg} rowKey={(i) => i.id} onRow={(i) => setWin({ k: "view", id: i.id })} cols={[
            { key: "n", label: "No.", render: (i) => <b>{i.no}</b> },
            { key: "d", label: "Date", render: (i) => shortDate(i.date) },
            { key: "c", label: "Customer", render: (i) => <>{i.customer}{missingAddress(i) && <span class="t-meta text-warn"> · no address</span>}</> },
            { key: "o", label: "Order", render: (i) => (i.orderNo ? `${i.orderNo}${i.batch ? " · " + i.batch : ""}` : "—"), hideTablet: true },
            { key: "t", label: "Taxable", align: "right", render: (i) => inr(invTax(i).taxable), hideTablet: true },
            { key: "v", label: "Total", align: "right", render: (i) => inr(invTax(i).total) },
            { key: "p", label: "Status", card: "status", render: (i) => <Status tone={i.status === "cancelled" ? "idle" : i.kind === "credit" ? "active" : i.paidOn ? "done" : "waiting"}>{i.status === "cancelled" ? "Cancelled" : i.kind === "credit" ? "Credit note" : i.paidOn ? "Paid" : "Unpaid"}</Status> },
            { key: "a", label: "", align: "right", render: (i) => <span class="inline-flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
              <button type="button" class={iconBtn} title="Preview" aria-label={`Preview ${i.no}`} onClick={() => setWin({ k: "view", id: i.id })}><Icon name="doc" size={16} /></button>
              <button type="button" class={iconBtn} title="Download PDF" aria-label={`Download ${i.no} as PDF`} disabled={busy === i.id} onClick={() => rowDl(i)}><Icon name="in" size={16} /></button>
              <Menu label={`More for ${i.no}`} items={[
                { label: "Create copy for transporter", hidden: !i.billTo, on: () => rowDl(i, COPIES[1]) },
                { label: `Go to order ${i.orderNo ?? ""}`, hidden: !i.orderNo, on: () => goOrder(i.orderNo) },
              ]} />
            </span> },
          ]} />
        </Card>
      </Section>
    </WorkShell>
  );
}

