/**
 * The client journey in one place: make the quotation, record that it was sent, then the client's answer.
 * Every entry point (the client tab, the order panel, the checklist, the quotation register) uses these same functions,
 * so a quote, the order and the later invoice always agree.
 */
import { signal } from "@preact/signals";
import { addDays, today, uid } from "./store";
import { clientsSig } from "./inventory";
import { nextNo, quotesSig, type Quote } from "./ledger";
import { rate } from "./rates";
import { log, moveTo, ordersSig, patchOrder, type Order } from "./index";

/** Set to an order id to open its quotation (for example straight after "Use in quotation" in Nexcal). */
export const openQuoteSig = signal<string | null>(null);

const r2 = (n: number) => Math.round(n * 100) / 100;
export const isPlaceholderName = (n: string) => !n.trim() || /^new client$/i.test(n.trim());
export const quoteOf = (o: Order) => quotesSig.value.filter((q) => q.orderNo === o.no).sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no))[0];

/** Lines of the quote from the order. Prices that include GST are split so the quote total equals what the order says. */
export const quoteLines = (o: Order, inclGst: boolean, gst = rate("gst")): Quote["lines"] =>
  o.items.map((i) => ({ desc: [i.name, [i.material, i.colour].filter(Boolean).join(" ")].filter(Boolean).join(" · "), hsn: "491199", qty: i.qty, rate: inclGst ? r2(i.price / (1 + gst / 100)) : i.price }));

/** Press "Create quotation": one open quote per order; an existing open or approved one is reused, never duplicated. */
export function ensureQuote(o: Order): Quote {
  const have = quotesSig.value.find((q) => q.orderNo === o.no && (q.outcome === "open" || q.outcome === "approved" || q.outcome === "unrecorded"));
  if (have) return have;
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  const q: Quote = { id: uid(), no: nextNo("quote"), date: today(), customer: o.customer, orderNo: o.no, address: c?.address || undefined, lines: quoteLines(o, true), gstRate: rate("gst"), valid: addDays(today(), rate("quoteValid")), outcome: "open", pay: o.pay, inclGst: true };
  quotesSig.value = [...quotesSig.value, q]; log("Created quotation", `${q.no} · ${o.no}`); return q;
}
export const putQuote = (id: string, p: Partial<Quote>) => { quotesSig.value = quotesSig.value.map((x) => (x.id === id ? { ...x, ...p } : x)); };
export const markSent = (q: Quote, via: string) => { putQuote(q.id, { sent: today(), via }); log("Quotation sent", `${q.no} · ${via}`); };

/** Set or change the client's name and contact details on the order and the client list. */
export function saveClient(o: Order, d: { name?: string; phone?: string; email?: string; address?: string }): Order {
  const name = (d.name ?? o.customer).trim() || o.customer, prev = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase()) ?? clientsSig.value.find((x) => x.name.trim().toLowerCase() === name.toLowerCase());
  const next = { ...(prev ?? { id: uid(), kind: "Individual", phone: "", city: "", gstin: "", medium: o.medium }), name, ...(d.phone !== undefined ? { phone: d.phone.trim() } : {}), ...(d.email !== undefined ? { email: d.email.trim() || undefined } : {}), ...(d.address !== undefined ? { address: d.address.trim() || undefined } : {}) };
  clientsSig.value = prev ? clientsSig.value.map((x) => (x.id === prev.id ? next : x)) : [...clientsSig.value, next];
  const n = name === o.customer ? o : patchOrder(o, { customer: name });
  const q = quoteOf(o); if (q && name !== q.customer) putQuote(q.id, { customer: name });
  return n;
}

/**
 * The client said yes. One function for every path: the quote becomes approved, its prices become the order's prices (so the panel, the quote and the
 * invoice agree), the order is marked approved and moves to Production. No money is booked here.
 */
export function approveOrder(o: Order, d: { note?: string; po?: string; items?: Order["items"] } = {}): Order {
  const q = quoteOf(o);
  let items = d.items ?? o.items;
  if (q && q.outcome !== "lost") {
    putQuote(q.id, { outcome: "approved" });
    items = items.map((i, k) => (q.lines[k] ? { ...i, price: q.lines[k].rate, qty: q.lines[k].qty || i.qty } : i)); // the approved quote is the price the client agreed to
  }
  const n = patchOrder(o, { approved: true, blocked: undefined, items, ...(d.po?.trim() ? { po: d.po.trim() } : {}) });
  log(`Approved${d.note?.trim() ? ` (${d.note.trim()})` : ""}`, o.no);
  return n.stage === "quotation" ? moveTo(n, "production", "client approved") : n;
}

/** The client said no: the quote is marked lost with the reason; the order stays where it is, flagged, until you delete or reopen it. */
export function declineQuote(o: Order, why: string): Order {
  const q = quoteOf(o); if (q) putQuote(q.id, { outcome: "lost", lostWhy: why.trim() || undefined });
  log("Quotation declined", `${o.no}${why.trim() ? ` · ${why.trim()}` : ""}`);
  return patchOrder(o, { blocked: `Quotation declined${why.trim() ? `: ${why.trim()}` : ""}` });
}
export const reopenQuote = (o: Order): Order => { const q = quoteOf(o); if (q) putQuote(q.id, { outcome: "open", lostWhy: undefined }); return patchOrder(o, { blocked: undefined }); };
export const orderById = (id: string) => ordersSig.value.find((x) => x.id === id);
