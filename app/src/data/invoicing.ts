/**
 * Tax-invoice rules: Indian GST states, HSN/SAC list, invoice settings, drafts, issuing and client autofill.
 * - A draft has no number. The number is taken only when it is issued, so the series (B-019, B-020 …) has no gaps.
 * - An issued invoice is frozen: company details, terms and signatory are copied onto it, so later setting changes never alter it.
 *   Mistakes are corrected by cancelling (the number stays used) or by a credit note.
 * - Tax follows the Bill-to party's state: Gujarat → CGST 9% + SGST 9%; any other state → IGST 18%.
 */
import { computed } from "@preact/signals";
import { fingerprint, persisted, today, uid } from "./store";
import { bizSig, type Biz } from "./biz";
import { invoicesSig, logFn, nextNo, seriesLatest, setSeriesFloor, type InvLine, type Invoice, type Party, type SellerSnap } from "./ledger";
import { clientsSig, type Client } from "./inventory";
import { ordersSig } from "./index";

/* ---------------------------------------------------------------- states (GST state codes) */
export const STATES: [string, string][] = [
  ["Jammu and Kashmir", "01"], ["Himachal Pradesh", "02"], ["Punjab", "03"], ["Chandigarh", "04"], ["Uttarakhand", "05"], ["Haryana", "06"], ["Delhi", "07"],
  ["Rajasthan", "08"], ["Uttar Pradesh", "09"], ["Bihar", "10"], ["Sikkim", "11"], ["Arunachal Pradesh", "12"], ["Nagaland", "13"], ["Manipur", "14"],
  ["Mizoram", "15"], ["Tripura", "16"], ["Meghalaya", "17"], ["Assam", "18"], ["West Bengal", "19"], ["Jharkhand", "20"], ["Odisha", "21"],
  ["Chhattisgarh", "22"], ["Madhya Pradesh", "23"], ["Gujarat", "24"], ["Dadra and Nagar Haveli and Daman and Diu", "26"], ["Maharashtra", "27"],
  ["Karnataka", "29"], ["Goa", "30"], ["Lakshadweep", "31"], ["Kerala", "32"], ["Tamil Nadu", "33"], ["Puducherry", "34"],
  ["Andaman and Nicobar Islands", "35"], ["Telangana", "36"], ["Andhra Pradesh", "37"], ["Ladakh", "38"],
];
export const stateCode = (name: string) => STATES.find(([n]) => n.toLowerCase() === name.trim().toLowerCase())?.[1] ?? "";
export const stateOfGstin = (g: string) => STATES.find(([, c]) => c === g.trim().slice(0, 2))?.[0] ?? "";
/** "Gujarat (24)" — how the state is printed everywhere on an invoice. */
export const stateLabel = (name: string) => (name ? `${name}${stateCode(name) ? ` (${stateCode(name)})` : ""}` : "");
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/* ---------------------------------------------------------------- HSN / SAC */
export type Hsn = { id: string; code: string; desc: string };
export const hsnSig = persisted<Hsn[]>("hsn", [
  { id: "hsn-491199", code: "491199", desc: "General category for sale of goods" },
  { id: "hsn-998851", code: "998851", desc: "Rubber and plastic product manufacturing services" },
  { id: "hsn-998391", code: "998391", desc: "Specialty design services including interior design, fashion design, industrial design and other specialty design services" },
]);

/* ---------------------------------------------------------------- invoice settings */
export const DEFAULT_TERMS = [
  "Any disputes will be subject to the jurisdiction of Vadodara, Gujarat.",
  "Payment terms: Immediate/advance",
  "All applicable GST will be added to the invoice amount as per Indian tax laws.",
  "All sales are final, and goods once sold will not be accepted for return or exchange.",
].join("\n");
/** Studio details as on the existing invoices; used for any field not yet set in Invoice settings. */
const DEFAULTS: Partial<Biz> = {
  name: "Studio Nexify", address: "Tarsali, Vadodara, Gujarat - 390009", addressShort: "Tarsali, Vadodara - 390009", phone: "+91 - 97730 48267",
  email: "connect@studionexify.com", website: "www.studionexify.com", gstin: "24CNXPP2704E1ZV", upi: "9773048267@ibl", upiNumber: "9773048267",
  bankName: "HDFC Bank Tarsali", accName: "Studio Nexify", accNo: "50200102379294", ifsc: "HDFC0009473", jurisdiction: "Vadodara, Gujarat",
  invTerms: DEFAULT_TERMS, thanks: "Thank you for purchasing from us!", signName: "Ankit P", state: "Gujarat", gstRate: 18, seriesFloor: { "B-": 18 },
};
const PLACEHOLDER = /X{3}|ABCDE1234F|0000000|··/;
/** Invoice settings with defaults filled in. Placeholder values from the first-run setup count as not set. */
export const invoiceBiz = computed<Biz>(() => {
  const b = { ...bizSig.value } as Biz;
  for (const [k, v] of Object.entries(DEFAULTS)) { const cur = (b as any)[k]; if (cur === undefined || cur === "" || (typeof cur === "string" && PLACEHOLDER.test(cur))) (b as any)[k] = v; }
  return b;
});
setSeriesFloor(() => invoiceBiz.value.seriesFloor ?? {});
export const sellerNow = (): SellerSnap => { const biz = invoiceBiz.value; return { biz, ver: fingerprint(biz) }; };
export const termsOf = (b: Biz) => (b.invTerms ?? DEFAULT_TERMS).split("\n").map((x) => x.trim()).filter(Boolean);
export const COPIES = ["Original for Recipient", "Duplicate for Transporter", "Triplicate for Supplier"] as const;
/** Only the owner and partners create and issue invoices. */
export const canInvoice = (role?: string) => role === "owner" || role === "partner";

/* ---------------------------------------------------------------- parties & autofill */
export const blankParty = (): Party => ({ name: "", address: "", state: "", contact: "", email: "", gstin: "" });
const norm = (s?: string) => (s ?? "").trim().toLowerCase();
/** Everything known about a party, from the client list and from earlier invoices. Matched by GSTIN first, then by name. */
export function lookupParty(q: { name?: string; gstin?: string }): Party | null {
  const g = norm(q.gstin), n = norm(q.name);
  if (!g && !n) return null;
  const c = clientsSig.value.find((x) => g && norm(x.gstin) === g) ?? (n ? clientsSig.value.find((x) => norm(x.name) === n) : undefined);
  const inv = [...invoicesSig.value].reverse().map((i) => i.billTo).find((p) => p && ((g && norm(p.gstin) === g) || (n && norm(p.name) === n)));
  if (!c && !inv) return null;
  const pick = (a?: string, b?: string) => (a && a.trim() ? a : b ?? "");
  const gstin = pick(c?.gstin, inv?.gstin);
  return {
    name: pick(c?.name, inv?.name), address: pick(c?.address, inv?.address), contact: pick(c?.phone, inv?.contact), email: pick(c?.email, inv?.email), gstin,
    state: pick(c?.state, pick(inv?.state, gstin ? stateOfGstin(gstin) : "")),
  };
}
/** Saves what was typed for a party, so next time it fills itself in. Values the user changed replace the old ones. */
export function rememberParty(p: Party) {
  if (!p.name.trim()) return;
  const g = norm(p.gstin), n = norm(p.name);
  const c = clientsSig.value.find((x) => g && norm(x.gstin) === g) ?? clientsSig.value.find((x) => norm(x.name) === n);
  const patch: Partial<Client> = { name: p.name.trim(), address: p.address || c?.address, phone: p.contact || c?.phone || "", email: p.email || c?.email, gstin: p.gstin || c?.gstin || "", state: p.state || c?.state };
  if (c) clientsSig.value = clientsSig.value.map((x) => (x.id === c.id ? { ...x, ...patch } : x));
  else clientsSig.value = [...clientsSig.value, { id: uid(), kind: p.gstin ? "Business" : "Individual", city: "", medium: "", active: true, ...patch } as Client];
}

/* ---------------------------------------------------------------- drafts */
/** Invoices not yet issued. Kept apart from the register so they never count in sales, GST or the number series. */
export const draftsSig = persisted<Invoice[]>("invoiceDrafts", []);
export function newDraft(d: { billTo?: Party; lines?: InvLine[]; orderNo?: string; batch?: string } = {}): Invoice {
  const billTo = d.billTo ?? blankParty();
  const inv: Invoice = {
    id: uid(), kind: "invoice", no: "Draft", date: today(), customer: billTo.name, lines: d.lines ?? [{ desc: "", hsn: hsnSig.value[0]?.code ?? "", qty: 1, rate: 0 }],
    gstRate: invoiceBiz.value.gstRate ?? 18, interstate: false, status: "issued", billTo, shipToParty: blankParty(), sameShip: true, orderNo: d.orderNo, batch: d.batch, seller: sellerNow(),
  };
  draftsSig.value = [inv, ...draftsSig.value];
  return derive(inv);
}
export const updateDraft = (d: Invoice, p: Partial<Invoice>) => (draftsSig.value = draftsSig.value.map((x) => (x.id === d.id ? derive({ ...x, ...p }) : x)));
export const deleteDraft = (d: Invoice) => (draftsSig.value = draftsSig.value.filter((x) => x.id !== d.id));
/** Settings changed since this draft was started? */
export const draftOutdated = (d: Invoice) => !!d.seller && d.seller.ver !== sellerNow().ver;

/** Fill the flat fields (used by reports, GST desk and older screens) from the structured parties. */
export function derive(d: Invoice): Invoice {
  const b = d.billTo ?? blankParty(), s = d.sameShip ? b : d.shipToParty ?? blankParty();
  const home = d.seller?.biz.state ?? invoiceBiz.value.state ?? "Gujarat";
  return {
    ...d, customer: b.name, gstin: b.gstin || undefined, address: b.address || undefined, contact: b.contact || undefined,
    shipTo: d.sameShip ? undefined : [s.name, s.address].filter(Boolean).join("\n") || undefined,
    pos: stateLabel(b.state) || undefined, interstate: !!b.state && b.state !== home,
  };
}

/** Everything that must be right before a number is taken. Empty = ready to issue. */
export function problems(d: Invoice): string[] {
  const out: string[] = [], b = d.billTo ?? blankParty();
  if (!b.name.trim()) out.push("Bill to: name is missing");
  if (!b.address.trim()) out.push("Bill to: address is missing");
  if (!b.state) out.push("Bill to: state is missing (decides CGST+SGST or IGST)");
  for (const [who, p] of [["Bill to", b], ["Ship to", d.sameShip ? null : d.shipToParty]] as const) {
    if (!p) continue;
    const g = p.gstin.trim().toUpperCase();
    if (g && !GSTIN_RE.test(g)) out.push(`${who}: GSTIN ${g} is not a valid 15-character GSTIN`);
    else if (g && p.state && stateOfGstin(g) !== p.state) out.push(`${who}: GSTIN starts with ${g.slice(0, 2)} (${stateOfGstin(g) || "unknown"}) but the state is ${p.state}`);
  }
  if (!d.sameShip && !d.shipToParty?.name.trim()) out.push("Ship to: name is missing");
  if (!d.lines.length) out.push("Add at least one item");
  d.lines.forEach((l, k) => {
    if (!l.desc.trim()) out.push(`Item ${k + 1}: description is missing`);
    if (!l.hsn) out.push(`Item ${k + 1}: choose an HSN / SAC code`);
    if (!(l.qty > 0)) out.push(`Item ${k + 1}: quantity must be more than 0`);
    if (!(l.rate > 0)) out.push(`Item ${k + 1}: unit price must be more than 0`);
  });
  const latest = seriesLatest("invoice", d.date);
  if (latest && d.date < latest) out.push(`Date: the last invoice in this series is dated ${latest}; a new one cannot be dated earlier`);
  if (d.date > today()) out.push("Date: an invoice cannot be dated in the future");
  return out;
}

/** Issue a draft: takes the next number in the series, freezes it, and remembers the parties for autofill. */
export function issueDraft(d: Invoice, keepOldDetails = true): Invoice {
  const p = problems(d); if (p.length) throw new Error(p.join("\n"));
  const seller = keepOldDetails && d.seller ? d.seller : sellerNow();
  const no = nextNo("invoice", d.date);
  if (invoicesSig.value.some((i) => i.no === no)) throw new Error(`${no} already exists — reload and try again.`);
  const clean = (x: Party): Party => ({ ...x, gstin: x.gstin.trim().toUpperCase(), name: x.name.trim() });
  const inv = derive({ ...d, no, seller, status: "issued", billTo: clean(d.billTo!), shipToParty: d.sameShip ? undefined : clean(d.shipToParty!), lines: d.lines.map((l) => ({ ...l, desc: l.desc.trim() })) });
  invoicesSig.value = [...invoicesSig.value, inv];
  draftsSig.value = draftsSig.value.filter((x) => x.id !== d.id);
  rememberParty(inv.billTo!); if (!inv.sameShip && inv.shipToParty) rememberParty(inv.shipToParty);
  logFn("Issued invoice", `${inv.no} · ${inv.customer}`, "money");
  return inv;
}

/**
 * Best known address for an invoice that has none (older invoices imported from Emerald 1 often came without one):
 * the client record (by GSTIN, then name), the linked order's delivery address, then another invoice for the same customer.
 */
export function addressFor(i: Invoice): string {
  if (i.billTo?.address?.trim()) return i.billTo.address;
  if (i.address?.trim()) return i.address;
  const g = norm(i.gstin), n = norm(i.customer);
  const c = clientsSig.value.find((x) => g && norm(x.gstin) === g && x.address?.trim()) ?? clientsSig.value.find((x) => norm(x.name) === n && x.address?.trim());
  if (c?.address) return c.address;
  const o = i.orderNo ? ordersSig.value.find((x) => x.no === i.orderNo) : undefined;
  if (o?.delivery?.address?.trim()) return o.delivery.address;
  const other = invoicesSig.value.find((x) => x.id !== i.id && ((g && norm(x.gstin) === g) || norm(x.customer) === n) && (x.billTo?.address?.trim() || x.address?.trim()));
  return other ? other.billTo?.address || other.address || "" : "";
}
/** Contact number the same way, for invoices that lack one. */
function contactFor(i: Invoice): string {
  if (i.contact?.trim()) return i.contact;
  const g = norm(i.gstin), n = norm(i.customer);
  return (clientsSig.value.find((x) => (g && norm(x.gstin) === g) || norm(x.name) === n)?.phone ?? "").trim();
}
/** Invoices with no address anywhere — the owner is asked to add them. */
export const missingAddress = (i: Invoice) => !addressFor(i).trim();
/** Add a missing address to an older invoice (and to the client, so it fills next time). Tax and number are untouched. */
export function setMissingAddress(i: Invoice, address: string) {
  invoicesSig.value = invoicesSig.value.map((x) => (x.id === i.id ? { ...x, address, ...(x.billTo ? { billTo: { ...x.billTo, address } } : {}) } : x));
  rememberParty({ name: i.customer, address, state: i.billTo?.state ?? (i.gstin ? stateOfGstin(i.gstin) : ""), contact: i.contact ?? "", email: "", gstin: i.gstin ?? "" });
  logFn("Added invoice address", i.no, "money");
}

/** Corrections the owner asked for on invoices made before this generator. Safe to run any number of times. */
export function fixKnownInvoices() {
  let changed = false;
  const next = invoicesSig.value.map((i) => {
    if (i.no === "B-015" && i.lines.length === 1 && i.lines[0].qty === 1 && i.lines[0].rate === 42000) { changed = true; return { ...i, lines: [{ ...i.lines[0], rate: 43000 }] }; }
    if (i.no === "B-017" && i.interstate) { changed = true; return { ...i, interstate: false }; } // billed to a Gujarat party: CGST + SGST, round-off 0
    // Older invoices without an address: fill it (and the contact) from the client, order or another invoice.
    if (!i.billTo && !i.address?.trim()) { const a = addressFor(i); if (a) { changed = true; return { ...i, address: a, contact: contactFor(i) || i.contact }; } }
    return i;
  });
  if (changed) invoicesSig.value = next;
}
