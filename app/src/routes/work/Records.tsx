import { useState } from "preact/hooks";
import { Button, Card, CardTitle, Chip, DetailHead, Empty, Field, inputCls, Section, Stat, Status, SubTabs, Table } from "../../ui";
import {
  accountsSig, batchesSig, cancelInvoice, creditNote, fyOf, inr, invoicesSig, invTax, markPaid, markUnpaid, monthLocked, nextNo, ordersSig, photosSig, quotesSig, raiseInvoice,
  rate, resequence, shipmentsSig, shortDate, today, uid, updateInvoice, X, log, patchOrder, nowS, consume,
  type InvLine, type Invoice, type Order, type Quote, type Shipment,
} from "../../data";
import { DocSheet, fromInvoice, fromQuote, type DocData } from "./Doc";
import { WorkShell } from "./shared";

const linesOf = (o: Order): InvLine[] => o.items.map((i) => ({ desc: `${i.name} (${i.material} ${i.colour})`, hsn: "3926", qty: i.qty, rate: i.price }));

/** Editable line items for invoices and quotations. */
function LinesEditor({ lines, on, locked }: { lines: InvLine[]; on: (l: InvLine[]) => void; locked?: boolean }) {
  const set = (k: number, p: Partial<InvLine>) => on(lines.map((l, i) => (i === k ? { ...l, ...p } : l)));
  const c = "h-8 px-2 rounded-lg border border-c3 bg-c0 text-xs min-w-0";
  return (
    <div class="flex flex-col gap-1.5">
      {lines.map((l, k) => (
        <div key={k} class="grid grid-cols-[1fr_56px_44px_72px_24px] gap-1">
          <input class={c} disabled={locked} value={l.desc} onInput={(e) => set(k, { desc: (e.target as HTMLInputElement).value })} aria-label="Description" />
          <input class={c} disabled={locked} value={l.hsn} onInput={(e) => set(k, { hsn: (e.target as HTMLInputElement).value })} aria-label="HSN" />
          <input class={c} disabled={locked} type="number" value={l.qty} onInput={(e) => set(k, { qty: Number((e.target as HTMLInputElement).value) || 0 })} aria-label="Qty" />
          <input class={c} disabled={locked} type="number" value={l.rate} onInput={(e) => set(k, { rate: Number((e.target as HTMLInputElement).value) || 0 })} aria-label="Rate" />
          {!locked && <button class="text-xs cursor-pointer" aria-label="Remove line" onClick={() => on(lines.filter((_, i) => i !== k))}>✕</button>}
        </div>
      ))}
      {!locked && <button class="text-xs underline self-start cursor-pointer" onClick={() => on([...lines, { desc: "", hsn: "3926", qty: 1, rate: 0 }])}>+ Line</button>}
    </div>
  );
}

/* ======================================================= Invoice (stage + register) */
export function Invoice() {
  const [f, setF] = useState("all");
  const [open, setOpen] = useState<Invoice | null>(null);
  const [view, setView] = useState<"edit" | "doc">("edit");
  const [cn, setCn] = useState(0);
  const cur = open && (invoicesSig.value.find((i) => i.id === open.id) ?? open);
  const waiting = ordersSig.value.filter((o) => o.stage === "invoice" && !invoicesSig.value.some((i) => i.orderNo === o.no && i.status === "issued" && !i.batch));
  const bw = batchesSig.value.filter((b) => b.stage === "invoice" && !b.invoiceNo);
  const reg = [...invoicesSig.value].filter((i) => f === "all" || (f === "paid" ? !!i.paidOn : f === "credit" ? i.kind === "credit" : f === "cancelled" ? i.status === "cancelled" : !i.paidOn && i.kind === "invoice" && i.status === "issued")).sort((a, b) => b.no.localeCompare(a.no));
  const locked = !!cur && (monthLocked(cur.date) || cur.status === "cancelled");
  const raise = (o: Order, batch?: { name: string; units: number; id: string }) => {
    const lines = batch ? [{ desc: `${o.items[0].name} — ${batch.name}`, hsn: "3926", qty: batch.units, rate: o.items[0].price }] : linesOf(o);
    const client = X.clients.find((c) => c.name === o.customer);
    const inv = raiseInvoice({ customer: o.customer, gstin: client?.gstin || undefined, orderNo: o.no, batch: batch?.name, lines });
    if (batch) batchesSig.value = batchesSig.value.map((b) => (b.id === batch.id ? { ...b, invoiceNo: inv.no } : b)); else patchOrder(o, { invoiced: true });
    setOpen(inv); setView("doc");
  };
  return (
    <WorkShell title="Invoice" sub={`Tax invoices · gapless series per FY · next ${nextNo("invoice")}`}
      actions={<><Button variant="outline" onClick={() => confirm("Renumber this FY's series in date order?") && resequence(fyOf(today()))}>Resequence</Button><Button icon="plus" onClick={() => { const inv = raiseInvoice({ customer: "Walk-in customer", lines: [{ desc: "", hsn: "3926", qty: 1, rate: 0 }] }); setOpen(inv); setView("edit"); }}>New invoice</Button></>}
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "unpaid", "paid", "credit", "cancelled"].map((s) => <Chip key={s} active={f === s} onClick={() => setF(s)}>{s[0].toUpperCase() + s.slice(1)}</Chip>)}</div>}
      detail={cur && (
        <div>
          <DetailHead title={`${cur.no} · ${cur.customer}`} onClose={() => setOpen(null)} />
          <div class="mb-2"><SubTabs value={view} onChange={setView} items={[["edit", "Details"], ["doc", "Document"]]} /></div>
          {view === "doc" ? <><DocSheet d={fromInvoice(cur)} /><div class="flex gap-2 mt-3"><Button onClick={() => window.print()}>Print / save PDF</Button></div></> : (
            <div class="flex flex-col gap-2">
              {locked && <div class="rounded-xl bg-c1 p-2 text-xs">{cur.status === "cancelled" ? "Cancelled — number kept in the series." : "GST month filed & locked — correct with a credit note."}</div>}
              <div class="grid grid-cols-2 gap-2">
                <Field label="Customer"><input class={inputCls} disabled={locked} value={cur.customer} onInput={(e) => updateInvoice(cur, { customer: (e.target as HTMLInputElement).value })} /></Field>
                <Field label="GSTIN (blank = B2C)"><input class={inputCls} disabled={locked} value={cur.gstin ?? ""} onInput={(e) => updateInvoice(cur, { gstin: (e.target as HTMLInputElement).value || undefined })} /></Field>
                <Field label="Date"><input class={inputCls} disabled={locked} type="date" value={cur.date} onInput={(e) => updateInvoice(cur, { date: (e.target as HTMLInputElement).value })} /></Field>
                <Field label="Number"><input class={inputCls} disabled={locked} value={cur.no} onInput={(e) => updateInvoice(cur, { no: (e.target as HTMLInputElement).value }, "Renamed invoice")} /></Field>
              </div>
              <label class="flex items-center gap-2 text-xs"><input type="checkbox" disabled={locked} checked={cur.interstate} onChange={() => updateInvoice(cur, { interstate: !cur.interstate })} /> Out-of-state (IGST)</label>
              <LinesEditor lines={cur.lines} locked={locked} on={(l) => updateInvoice(cur, { lines: l })} />
              <div class="flex justify-between text-sm font-semibold border-t border-c1 pt-2"><span>Total incl. GST</span><span class="num">{inr(invTax(cur).total)}</span></div>
              {cur.kind === "invoice" && cur.status === "issued" && (cur.paidOn
                ? <div class="flex items-center justify-between text-sm"><Status tone="done">Paid {shortDate(cur.paidOn)}</Status><Button variant="ghost" onClick={() => markUnpaid(cur)}>Mark unpaid</Button></div>
                : <div class="flex flex-wrap items-center gap-2">{accountsSig.value.map((a) => <Button key={a.id} variant="outline" onClick={() => markPaid(cur, a.id)}>Paid → {a.name.split(" ")[0]}</Button>)}</div>)}
              {cur.kind === "invoice" && cur.status === "issued" && (
                <div class="flex flex-wrap items-end gap-2 border-t border-c1 pt-2">
                  <Field label="Credit note ₹ (taxable)"><input class={inputCls} type="number" value={cn || ""} onInput={(e) => setCn(Number((e.target as HTMLInputElement).value) || 0)} /></Field>
                  <Button variant="outline" onClick={() => { if (cn) { setOpen(creditNote(cur, cn, prompt("Reason") ?? "")); setCn(0); } }}>Issue credit note</Button>
                  {!monthLocked(cur.date) && <Button variant="ghost" onClick={() => confirm(`Cancel ${cur.no}? The number stays used.`) && cancelInvoice(cur)}>Cancel invoice</Button>}
                </div>
              )}
            </div>
          )}
        </div>
      )}>
      <Section title="Awaiting invoice" note={`${waiting.length + bw.length} · orders + batch dispatches`}>
        {waiting.length + bw.length === 0 ? <p class="text-sm text-c3">Nothing waiting.</p> : (
          <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {waiting.map((o) => (
              <Card key={o.id}>
                <CardTitle action={<span class="num text-sm font-semibold">{inr(o.items.reduce((s, i) => s + i.qty * i.price, 0))}</span>}>{o.no} · {o.customer}</CardTitle>
                <p class="text-xs text-c3 mb-2">{o.items.map((i) => `${i.name} ×${i.qty}`).join(", ")}</p>
                <Button onClick={() => raise(o)}>Raise invoice</Button>
              </Card>
            ))}
            {bw.map((b) => { const o = ordersSig.value.find((x) => x.no === b.orderNo); return o && (
              <Card key={b.id}>
                <CardTitle action={<span class="text-xs text-c3">Batch dispatch</span>}>{b.orderNo} · {b.name}</CardTitle>
                <p class="text-xs text-c3 mb-2">{b.customer} · {b.units} units</p>
                <Button onClick={() => raise(o, b)}>Raise dispatch invoice</Button>
              </Card>); })}
          </div>
        )}
      </Section>
      <Section title="Register" note={`${reg.length}`}>
        <Card>
          <Table rows={reg} rowKey={(i) => i.id} onRow={(i) => { setOpen(i); setView("edit"); }} cols={[
            { key: "n", label: "No.", render: (i) => <b>{i.no}</b> },
            { key: "d", label: "Date", render: (i) => shortDate(i.date) },
            { key: "c", label: "Customer", render: (i) => i.customer },
            { key: "o", label: "Order", render: (i) => (i.orderNo ? `${i.orderNo}${i.batch ? " · " + i.batch : ""}` : "—"), hideTablet: true },
            { key: "t", label: "Taxable", align: "right", render: (i) => inr(invTax(i).taxable), hideTablet: true },
            { key: "v", label: "Total", align: "right", render: (i) => inr(invTax(i).total) },
            { key: "p", label: "Status", render: (i) => <Status tone={i.status === "cancelled" ? "idle" : i.kind === "credit" ? "active" : i.paidOn ? "done" : "waiting"}>{i.status === "cancelled" ? "Cancelled" : i.kind === "credit" ? "Credit note" : i.paidOn ? "Paid" : "Unpaid"}</Status> },
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
  const cur = open && (quotesSig.value.find((q) => q.id === open.id) ?? open);
  const upd = (q: Quote, p: Partial<Quote>) => { quotesSig.value = quotesSig.value.map((x) => (x.id === q.id ? { ...x, ...p } : x)); if (p.outcome) log(`Quote ${p.outcome}`, q.no); };
  const rows = [...quotesSig.value].filter((q) => f === "all" || q.outcome === f).sort((a, b) => b.no.localeCompare(a.no));
  const make = (o?: Order) => { const valid = new Date(Date.now() + rate("quoteValid") * 864e5).toISOString().slice(0, 10);
    const q: Quote = { id: uid(), no: nextNo("quote"), date: today(), customer: o?.customer ?? "", orderNo: o?.no, lines: o ? linesOf(o) : [{ desc: "", hsn: "3926", qty: 1, rate: 0 }], gstRate: rate("gst"), valid, outcome: "open" };
    quotesSig.value = [...quotesSig.value, q]; log("Created quotation", q.no); setOpen(q); setView("edit"); };
  const pending = ordersSig.value.filter((o) => o.stage === "quotation" && !quotesSig.value.some((q) => q.orderNo === o.no));
  const cnt = (s: string) => quotesSig.value.filter((q) => q.outcome === s);
  return (
    <WorkShell title="Quotation register" sub="Every quote and its outcome — unknown is never folded into lost" actions={<Button icon="plus" onClick={() => make()}>New quotation</Button>}
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "open", "approved", "lost", "unrecorded"].map((s) => <Chip key={s} active={f === s} onClick={() => setF(s)}>{s[0].toUpperCase() + s.slice(1)}</Chip>)}</div>}
      detail={cur && (
        <div>
          <DetailHead title={`${cur.no} · ${cur.customer || "new"}`} onClose={() => setOpen(null)} />
          <div class="mb-2"><SubTabs value={view} onChange={setView} items={[["edit", "Details"], ["doc", "Document"]]} /></div>
          {view === "doc" ? <><DocSheet d={fromQuote(cur)} /><Button class="mt-3" onClick={() => window.print()}>Print / save PDF</Button></> : (
            <div class="flex flex-col gap-2">
              <div class="grid grid-cols-2 gap-2">
                <Field label="Customer"><input class={inputCls} value={cur.customer} onInput={(e) => upd(cur, { customer: (e.target as HTMLInputElement).value })} /></Field>
                <Field label="Valid until"><input class={inputCls} type="date" value={cur.valid} onInput={(e) => upd(cur, { valid: (e.target as HTMLInputElement).value })} /></Field>
              </div>
              <LinesEditor lines={cur.lines} on={(l) => upd(cur, { lines: l })} />
              <div class="flex justify-between text-sm font-semibold border-t border-c1 pt-2"><span>Total incl. GST</span><span class="num">{inr(cur.lines.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + cur.gstRate / 100))}</span></div>
              <div class="flex flex-wrap gap-1.5">{(["open", "approved", "lost", "unrecorded"] as const).map((o) => <Chip key={o} active={cur.outcome === o} onClick={() => upd(cur, { outcome: o })}>{o}</Chip>)}</div>
              {cur.orderNo && <p class="text-xs text-c3">Linked to {cur.orderNo}. Approving here doesn't move the order — stages are free.</p>}
            </div>
          )}
        </div>
      )}>
      <div class="grid grid-cols-4 gap-2">
        <Stat value={cnt("open").length} label="Open" /><Stat value={cnt("approved").length} label="Approved" /><Stat value={cnt("lost").length} label="Lost" /><Stat value={cnt("unrecorded").length} label="Unrecorded" />
      </div>
      {pending.length > 0 && <Card><CardTitle>Orders at Quotation without a quote</CardTitle><div class="flex flex-wrap gap-2">{pending.map((o) => <Button key={o.id} variant="outline" onClick={() => make(o)}>Quote {o.no} · {o.customer}</Button>)}</div></Card>}
      <Card>
        <Table rows={rows} rowKey={(q) => q.id} onRow={(q) => { setOpen(q); setView("edit"); }} cols={[
          { key: "n", label: "Quote", render: (q) => <b>{q.no}</b> },
          { key: "d", label: "Date", render: (q) => shortDate(q.date) },
          { key: "c", label: "Customer", render: (q) => q.customer },
          { key: "v", label: "Valid till", render: (q) => shortDate(q.valid) },
          { key: "o", label: "Outcome", render: (q) => <Status tone={q.outcome === "approved" ? "done" : q.outcome === "lost" ? "blocked" : q.outcome === "open" ? "waiting" : "idle"}>{q.outcome}</Status> },
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
    ...quotesSig.value.map((q) => ({ id: q.id, kind: "Quotation", no: q.no, party: q.customer, date: q.date, d: () => fromQuote(q) })),
    ...invoicesSig.value.map((i) => ({ id: i.id, kind: i.kind === "credit" ? "Credit note" : "Tax invoice", no: i.no, party: i.customer, date: i.date, d: () => fromInvoice(i) })),
    ...shipmentsSig.value.map((s) => ({ id: s.id, kind: "Delivery challan", no: `DC-${s.id.slice(0, 4).toUpperCase()}`, party: ordersSig.value.find((o) => o.no === s.orderNo)?.customer ?? s.orderNo, date: s.date,
      d: (): DocData => ({ title: "Delivery challan", no: `DC-${s.id.slice(0, 4).toUpperCase()}`, date: s.date, party: ordersSig.value.find((o) => o.no === s.orderNo)?.customer ?? "", lines: s.lines.map((l) => ({ desc: l.name, hsn: "3926", qty: l.qty, rate: 0 })), gstRate: 0, interstate: false, extra: [["Order", s.orderNo], ["Courier", `${s.courier} ${s.tracking}`]], note: "Not a tax invoice — goods sent for delivery." }) })),
  ].filter((d) => kind === "all" || d.kind === kind).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <WorkShell title="Documents" sub="The generator — every quotation, invoice, credit note and challan, printable"
      toolbar={<div class="flex flex-wrap gap-1.5">{["all", "Quotation", "Tax invoice", "Credit note", "Delivery challan"].map((k) => <Chip key={k} active={kind === k} onClick={() => setKind(k)}>{k === "all" ? "All" : k}</Chip>)}</div>}
      detail={sel && <div><DetailHead title={`${sel.title} · ${sel.no}`} onClose={() => setSel(null)} /><DocSheet d={sel} /><Button class="mt-3" onClick={() => window.print()}>Print / save PDF</Button></div>}>
      <Card>
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
  const ships = ordersSig.value.filter((o) => o.stage === "shipping" || o.stage === "invoice" || o.stage === "packing");
  const [orderNo, setOrderNo] = useState(ships[0]?.no ?? "");
  const o = ordersSig.value.find((x) => x.no === orderNo);
  const sent = (name: string) => shipmentsSig.value.filter((s) => s.orderNo === orderNo).reduce((a, s) => a + (s.lines.find((l) => l.name === name)?.qty ?? 0), 0);
  const [d, setD] = useState({ courier: "Delhivery", service: "Surface", tracking: "", paid: rate("freight"), rec: 0, qty: {} as Record<string, number>, photo: "" });
  const save = () => {
    if (!o) return;
    const lines = o.items.map((i) => ({ name: i.name, qty: d.qty[i.name] ?? Math.max(0, i.qty - sent(i.name)) })).filter((l) => l.qty > 0);
    const s: Shipment = { id: uid(), orderNo: o.no, date: today(), courier: d.courier, service: d.service, tracking: d.tracking, lines, freightPaid: d.paid, freightRecovered: d.rec, eta: new Date(Date.now() + 4 * 864e5).toISOString().slice(0, 10), photo: d.photo || undefined };
    shipmentsSig.value = [s, ...shipmentsSig.value];
    if (d.photo) photosSig.value = [...photosSig.value, { id: uid(), ref: o.no, stage: "courier handover", name: "handover", data: d.photo, at: nowS() }];
    if (d.paid) consume({ kind: "freight", item: `${d.courier} ${d.service}`, qty: d.paid, orderNo: o.no });
    patchOrder(o, { tracking: d.tracking || o.tracking });
    log(`Dispatched ${lines.map((l) => `${l.qty}× ${l.name}`).join(", ")}`, o.no);
    setD({ ...d, tracking: "", qty: {}, photo: "" });
  };
  return (
    <WorkShell title="Shipping" sub="Courier, tracking, freight paid vs recovered · many dispatches per order, part quantities allowed">
      <div class="grid grid-cols-3 gap-2">
        <Stat value={shipmentsSig.value.length} label="dispatches" />
        <Stat value={inr(shipmentsSig.value.reduce((s, x) => s + x.freightPaid, 0))} label="freight paid" />
        <Stat value={inr(shipmentsSig.value.reduce((s, x) => s + x.freightRecovered, 0))} label="recovered" />
      </div>
      <Section title="New dispatch">
        <Card class="flex flex-col gap-2">
          <div class="grid gap-2 grid-cols-2 md:grid-cols-3 xl:grid-cols-6 items-end">
            <Field label="Order"><select class={inputCls} value={orderNo} onChange={(e) => setOrderNo((e.target as HTMLSelectElement).value)}>{ordersSig.value.filter((x) => x.stage !== "archived").map((x) => <option key={x.id} value={x.no}>{x.no} · {x.customer}</option>)}</select></Field>
            <Field label="Courier"><select class={inputCls} value={d.courier} onChange={(e) => setD({ ...d, courier: (e.target as HTMLSelectElement).value })}>{["Delhivery", "DTDC", "Blue Dart", "India Post", "Shiprocket", "Hand delivery"].map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Service"><input class={inputCls} value={d.service} onInput={(e) => setD({ ...d, service: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Tracking no."><input class={inputCls} value={d.tracking} onInput={(e) => setD({ ...d, tracking: (e.target as HTMLInputElement).value })} /></Field>
            <Field label="Freight paid ₹"><input class={inputCls} type="number" value={d.paid} onInput={(e) => setD({ ...d, paid: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
            <Field label="Recovered ₹"><input class={inputCls} type="number" value={d.rec} onInput={(e) => setD({ ...d, rec: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
          </div>
          {o && <ul class="text-sm">{o.items.map((i) => { const left = i.qty - sent(i.name); return (
            <li key={i.name} class="flex items-center justify-between gap-2 py-1 border-t border-c1"><span>{i.name} <span class="text-xs text-c3">{sent(i.name)}/{i.qty} shipped</span></span>
              <input class="h-8 w-20 px-2 rounded-lg border border-c3 bg-c0 text-xs" type="number" aria-label={`Qty of ${i.name} in this dispatch`} value={d.qty[i.name] ?? Math.max(0, left)} onInput={(e) => setD({ ...d, qty: { ...d.qty, [i.name]: Number((e.target as HTMLInputElement).value) || 0 } })} /></li>); })}</ul>}
          <div class="flex flex-wrap items-center gap-2">
            <label class="text-xs underline cursor-pointer">{d.photo ? "Photo attached ✓" : "Handover photo"}<input type="file" accept="image/*" capture="environment" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) { const r = new FileReader(); r.onload = () => setD({ ...d, photo: String(r.result) }); r.readAsDataURL(f); } }} /></label>
            <Button onClick={save}>Save dispatch</Button>
          </div>
        </Card>
      </Section>
      <Section title="Dispatches" note={String(shipmentsSig.value.length)}>
        <Card>
          <Table rows={shipmentsSig.value} rowKey={(s) => s.id} cols={[
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

/* ======================================================= Clients (derived from orders + client records) */
export function Clients() {
  const names = [...new Set([...X.clients.map((c) => c.name), ...ordersSig.value.filter((o) => o.type !== "inhouse").map((o) => o.customer)])];
  const rows = names.map((n) => { const c = X.clients.find((x) => x.name === n); const os = ordersSig.value.filter((o) => o.customer === n);
    const inv = invoicesSig.value.filter((i) => i.customer === n && i.status === "issued");
    return { id: n, name: n, kind: c?.kind ?? "Individual", phone: c?.phone ?? "—", city: c?.city ?? "—", gstin: c?.gstin ?? "", medium: c?.medium ?? os[0]?.medium ?? "—", orders: os.length,
      value: os.reduce((s, o) => s + o.items.reduce((a, i) => a + i.qty * i.price, 0), 0), owed: inv.filter((i) => !i.paidOn && i.kind === "invoice").reduce((s, i) => s + invTax(i).total, 0) }; });
  return (
    <WorkShell title="Clients" sub="Every customer — orders, value and what they owe, derived from records">
      <Card>
        <Table rows={rows} rowKey={(c) => c.id} cols={[
          { key: "n", label: "Client", render: (c) => <b>{c.name}</b> },
          { key: "k", label: "Kind", render: (c) => c.kind },
          { key: "p", label: "Phone", render: (c) => c.phone },
          { key: "c", label: "City", render: (c) => c.city, hideTablet: true },
          { key: "g", label: "GSTIN", render: (c) => c.gstin || "—", hideTablet: true },
          { key: "m", label: "Came via", render: (c) => c.medium },
          { key: "o", label: "Orders", align: "right", render: (c) => c.orders },
          { key: "v", label: "Lifetime", align: "right", render: (c) => inr(c.value) },
          { key: "w", label: "Owes", align: "right", render: (c) => (c.owed ? inr(c.owed) : "—") },
        ]} />
      </Card>
    </WorkShell>
  );
}
