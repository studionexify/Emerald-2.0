/** Real forms for the order checklist: each step asks for what it needs and records it (QC entry, packing record, shipment, payment …). Nothing is ticked without the work. */
import { useState } from "preact/hooks";
import { Button, Field, inputCls, Sheet } from "../../ui";
import { navigate } from "../../router";
import { accountsSig, addMoney, consume, inr, invDue, invoicesSig, log, me, orderProgress, orderTotal, packRecSig, packSig, patchOrder, qcSig, shipmentsSig, today, uid, updateInvoice, vMoney, batchSet, addBatch, type Batch, type Order } from "../../data";

import { approveOrder } from "../../data/quoting";
const val = (e: Event) => (e.target as HTMLInputElement).value;
const who = () => me.value?.name ?? "You";
type Props = { order: Order; field: string; onClose: () => void; onDone: (o: Order) => void };

export function RecordSheet({ order: o, field, onClose, onDone }: Props) {
  const [f, setF] = useState<Record<string, string>>({});
  const [err, setErr] = useState("");
  const set = (k: string) => (e: Event) => setF({ ...f, [k]: val(e) });
  const g = (k: string, d = "") => f[k] ?? d;
  const done = (p: Partial<Order>, what: string) => { const n = patchOrder(o, p); log(what, o.no); onDone(n); onClose(); };
  const fail = (m: string) => setErr(m);
  const invs = invoicesSig.value.filter((i) => i.orderNo === o.no && invDue(i) > 0);
  const paidSoFar = vMoney().filter((m) => m.ref === o.no && m.amount > 0).reduce((s, m) => s + m.amount, 0);
  const due = invs.length ? invs.reduce((s, i) => s + invDue(i), 0) : Math.max(0, orderTotal(o) - paidSoFar);
  const prog = orderProgress(o);
  const item = o.items[0]?.name ?? "";
  const accs = accountsSig.value;

  let title = "", body: preact.ComponentChildren = null, save: (() => void) | null = null, label = "Save";
  if (field === "approved") {
    title = o.type === "inhouse" ? "Approve job card" : "Quotation approved";
    body = <Field label="How was it approved? (optional)"><input class={inputCls} placeholder="e.g. WhatsApp OK from client" value={g("note")} onInput={set("note")} /></Field>;
    save = () => { if (o.type === "inhouse") return done({ approved: true }, `Approved${g("note") ? ` (${g("note")})` : ""}`); onDone(approveOrder(o, { note: g("note") })); onClose(); }; label = o.type === "inhouse" ? "Mark approved" : "Approve and send to Production";
  } else if (field === "po") {
    title = "PO received";
    body = <Field label="PO number"><input class={inputCls} value={g("po")} onInput={set("po")} /></Field>;
    save = () => (g("po").trim() ? done({ po: g("po").trim() }, `PO ${g("po").trim()} recorded`) : fail("Enter the PO number."));
  } else if (field === "buildSheet") {
    title = "Build sheet";
    body = <p class="text-[13px]">Confirm the build sheet (files, plates, colours, machine) has been prepared for this order.</p>;
    save = () => done({ buildSheet: true }, "Build sheet ready"); label = "Build sheet is ready";
  } else if (field === "jobsDone") {
    title = "Jobs off the floor";
    body = <div class="text-[13px] flex flex-col gap-2"><p>{prog.printed} of {prog.qty} pieces logged as printed{prog.pending ? ` · ${prog.pending} still to print` : ""}.</p><p class="t-meta">Prints are logged on the Floor sheet / Production page; this ticks when everything is printed.</p>
      <Button variant="outline" onClick={() => { onClose(); navigate("/work/production"); }}>Open Production</Button></div>;
    save = () => (prog.pending > 0 ? fail(`${prog.pending} pieces are still to print — log them first.`) : done({ jobsDone: true }, "All jobs off the floor")); label = "All printed";
  } else if (field === "qcLogged") {
    title = "QC entry";
    body = <div class="flex flex-col gap-2">
      <Field label="Item"><select class={inputCls} value={g("item", item)} onChange={set("item")}>{o.items.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field>
      <Field label="Result"><select class={inputCls} value={g("res", "pass")} onChange={set("res")}><option value="pass">Pass</option><option value="rework">Rework</option><option value="scrap">Scrap</option></select></Field>
      {g("res", "pass") !== "pass" && <><Field label="Defect"><input class={inputCls} value={g("defect")} onInput={set("defect")} /></Field>
        {g("res") === "scrap" && <Field label="Grams wasted"><input class={inputCls} type="number" min="0" value={g("grams")} onInput={set("grams")} /></Field>}</>}
      <Field label="Note"><input class={inputCls} value={g("note")} onInput={set("note")} /></Field></div>;
    save = () => { const r = g("res", "pass") as "pass" | "rework" | "scrap"; if (r !== "pass" && !g("defect").trim()) return fail("Say what the defect was.");
      qcSig.value = [{ id: uid(), orderNo: o.no, item: g("item", item), result: r, grams: Number(g("grams")) || 0, defect: g("defect") || undefined, note: g("note") || undefined, by: who(), date: today() }, ...qcSig.value]; done({ qcLogged: true }, `QC ${r}`); };
  } else if (field === "packed") {
    title = "Packing record";
    const items = packSig.value.filter((p) => p.active !== false);
    body = <div class="flex flex-col gap-2">
      <Field label="Box / pack"><input class={inputCls} placeholder="e.g. 20×15×10 cm box" value={g("box")} onInput={set("box")} /></Field>
      <Field label="Gross weight"><input class={inputCls} placeholder="e.g. 450 g" value={g("weight")} onInput={set("weight")} /></Field>
      <div class="grid grid-cols-[1fr_90px] gap-2"><Field label="Packing material used"><select class={inputCls} value={g("pm")} onChange={set("pm")}><option value="">None</option>{items.map((p) => <option key={p.id} value={p.name}>{p.name} ({p.qty} {p.unit})</option>)}</select></Field>
        <Field label="Qty"><input class={inputCls} type="number" min="1" value={g("pq", "1")} onInput={set("pq")} /></Field></div></div>;
    save = () => { if (!g("box").trim()) return fail("Enter the box or pack used.");
      let cost = 0; if (g("pm")) { const q = Number(g("pq", "1")) || 1; cost = consume({ kind: "packing", item: g("pm"), qty: q, orderNo: o.no }).cost; }
      packRecSig.value = [{ id: uid(), order: o.no, box: g("box"), weight: g("weight"), materials: g("pm") ? `${g("pq", "1")} × ${g("pm")}` : "", cost, by: who(), notes: "", date: today() }, ...packRecSig.value]; done({ packed: true }, "Packing recorded"); };
  } else if (field === "invoiced") {
    title = "Invoice";
    body = <p class="text-[13px]">{invoicesSig.value.some((i) => i.orderNo === o.no && i.status === "issued") ? "An invoice is already issued for this order." : "The order is ticked as invoiced when its invoice is issued. Create the draft, check it, and issue it."}</p>;
    save = () => { import("../../data/invoicing").then(({ newDraft, lookupParty, blankParty }) => { newDraft({ billTo: lookupParty({ name: o.customer }) ?? { ...blankParty(), name: o.customer }, orderNo: o.no, lines: o.items.map((i) => ({ desc: `${i.name} (${i.material} ${i.colour})`, hsn: "491199", qty: i.qty, rate: i.price })) }); onClose(); navigate("/work/invoice"); }); }; label = "Create invoice draft";
  } else if (field === "tracking") {
    title = "Courier handover";
    body = <div class="flex flex-col gap-2">
      <div class="grid grid-cols-2 gap-2"><Field label="Courier"><input class={inputCls} value={g("courier")} onInput={set("courier")} /></Field><Field label="Service"><input class={inputCls} placeholder="Surface / Air" value={g("service")} onInput={set("service")} /></Field></div>
      <Field label="Tracking number"><input class={inputCls} value={g("trk")} onInput={set("trk")} /></Field>
      <div class="grid grid-cols-2 gap-2"><Field label="Freight we paid ₹"><input class={inputCls} type="number" min="0" value={g("paid")} onInput={set("paid")} /></Field><Field label="Charged to client ₹"><input class={inputCls} type="number" min="0" value={g("rec")} onInput={set("rec")} /></Field></div>
      <Field label="Expected delivery"><input class={inputCls} type="date" value={g("eta")} onInput={set("eta")} /></Field></div>;
    save = () => { if (!g("courier").trim() || !g("trk").trim()) return fail("Courier and tracking number are required.");
      const paid = Number(g("paid")) || 0;
      shipmentsSig.value = [{ id: uid(), orderNo: o.no, date: today(), courier: g("courier").trim(), service: g("service"), tracking: g("trk").trim(), lines: o.items.map((i) => ({ name: i.name, qty: i.qty })), freightPaid: paid, freightRecovered: Number(g("rec")) || 0, eta: g("eta") || today() }, ...shipmentsSig.value];
      if (paid > 0) consume({ kind: "freight", item: g("courier").trim(), qty: paid, orderNo: o.no });
      done({ tracking: g("trk").trim() }, `Handed to ${g("courier").trim()} · ${g("trk").trim()}`); };
  } else if (field === "paid") {
    title = "Payment received";
    const acc = g("acc", accs[0]?.id ?? "");
    body = <div class="flex flex-col gap-2">
      <p class="t-meta">Still due on this order: {inr(due)}</p>
      <Field label="Amount received ₹"><input class={inputCls} type="number" min="0" value={g("amt", String(Math.round(due)))} onInput={set("amt")} /></Field>
      <Field label="Into"><select class={inputCls} value={acc} onChange={set("acc")}>{accs.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Date"><input class={inputCls} type="date" max={today()} value={g("date", today())} onInput={set("date")} /></Field></div>;
    save = () => { const a = Number(g("amt", String(Math.round(due)))); if (!(a > 0) || !acc) return fail("Enter the amount and the account.");
      const inv = invs[0], date = g("date", today());
      addMoney({ date, account: acc, kind: "receipt", amount: a, note: o.customer, ref: inv?.no ?? o.no, source: "order_panel" });
      if (inv && a >= invDue(inv) - 1) updateInvoice(inv, { paidOn: date, paidAccount: acc }, "Marked invoice paid");
      done(a >= due - 1 ? { paid: true } : {}, `Received ${inr(a)}`); };
    label = "Record payment";
  }
  return (
    <Sheet open onClose={onClose} title={`${title} · ${o.no}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button>{save && <Button onClick={() => { setErr(""); save!(); }}>{label}</Button>}</>}>
      <div class="w-full md:w-[min(440px,86vw)] flex flex-col gap-3">{body}{err && <p role="alert" class="text-[13px] font-semibold text-red">{err}</p>}</div>
    </Sheet>
  );
}

/** Batch of an order: name and planned units are asked, not guessed. */
export function AddBatchSheet({ order, onClose, onDone }: { order: Order; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(order.items[0]?.name ?? ""), [units, setUnits] = useState(""), [err, setErr] = useState("");
  return (
    <Sheet open onClose={onClose} title={`New batch · ${order.no}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => { const u = Number(units); if (!name.trim() || !(u > 0)) return setErr("Enter the item and how many units."); addBatch(order, name.trim(), u); onDone(); onClose(); }}>Add batch</Button></>}>
      <div class="w-full md:w-[min(440px,86vw)] flex flex-col gap-3">
        <Field label="Item"><select class={inputCls} value={name} onChange={(e) => setName(val(e))}>{order.items.map((i) => <option key={i.name}>{i.name}</option>)}</select></Field>
        <Field label="Units in this batch"><input class={inputCls} type="number" min="1" value={units} onInput={(e) => setUnits(val(e))} /></Field>
        {err && <p role="alert" class="text-[13px] font-semibold text-red">{err}</p>}
      </div>
    </Sheet>
  );
}

/** Dispatch of one batch: courier and tracking number are entered, never generated. */
export function BatchTrackingSheet({ batch: b, onClose, onDone }: { batch: Batch; onClose: () => void; onDone: () => void }) {
  const [courier, setCourier] = useState(""), [trk, setTrk] = useState(""), [paid, setPaid] = useState(""), [err, setErr] = useState("");
  return (
    <Sheet open onClose={onClose} title={`Dispatch · ${b.orderNo} · ${b.name}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => {
      if (!courier.trim() || !trk.trim()) return setErr("Courier and tracking number are required.");
      shipmentsSig.value = [{ id: uid(), orderNo: b.orderNo, batch: b.name, date: today(), courier: courier.trim(), service: "", tracking: trk.trim(), lines: [{ name: b.name, qty: b.done || b.units }], freightPaid: Number(paid) || 0, freightRecovered: 0, eta: today() }, ...shipmentsSig.value];
      if (Number(paid) > 0) consume({ kind: "freight", item: courier.trim(), qty: Number(paid), orderNo: b.orderNo, batch: b.name });
      batchSet(b, { tracking: trk.trim() }, "Batch dispatched"); onDone(); onClose(); }}>Save dispatch</Button></>}>
      <div class="w-full md:w-[min(440px,86vw)] flex flex-col gap-3">
        <Field label="Courier"><input class={inputCls} value={courier} onInput={(e) => setCourier(val(e))} /></Field>
        <Field label="Tracking number"><input class={inputCls} value={trk} onInput={(e) => setTrk(val(e))} /></Field>
        <Field label="Freight we paid ₹"><input class={inputCls} type="number" min="0" value={paid} onInput={(e) => setPaid(val(e))} /></Field>
        {err && <p role="alert" class="text-[13px] font-semibold text-red">{err}</p>}
      </div>
    </Sheet>
  );
}
