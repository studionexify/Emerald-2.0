import { sortAbc } from "../../mock/types";
import { canSwitchMode, PAY_LABEL } from "../../data/mode";
import { ordersSig } from "../../data";
import { vOrders, vQuotes } from "../../data";
import { useState } from "preact/hooks";
import { Pick, Button, Card, CardTitle, Chip, DetailHead, Empty, Field, inputCls, Section, Stat, Status, SubTabs, Table } from "../../ui";
import {
  inr, invoicesSig, invTax, nextNo, photosSig, quotesSig,
  rate, shipmentsSig, shortDate, today, uid, log, patchOrder, nowS, consume,
  type InvLine, type Order, type Quote, type Shipment,
  lookupParty, 
  stateLabel, 
} from "../../data";
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
