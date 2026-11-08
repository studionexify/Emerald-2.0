/** The document generator: tax invoice, credit note and quotation laid out like the studio's existing PDFs (A4, printed from the browser). */
import { invTax, type InvLine, type Invoice, type Quote } from "../../data";
import { bizSig, type Biz } from "../../data/biz";

const words = (n: number): string => {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]} ${a[x % 10]}`.trim());
  const three = (x: number) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred ${two(x % 100)}` : two(x)).trim();
  n = Math.round(Math.abs(n)); if (!n) return "Zero";
  const parts: string[] = []; const cr = Math.floor(n / 1e7), l = Math.floor((n % 1e7) / 1e5), t = Math.floor((n % 1e5) / 1000), r = n % 1000;
  if (cr) parts.push(`${three(cr)} Crore`); if (l) parts.push(`${two(l)} Lakh`); if (t) parts.push(`${two(t)} Thousand`); if (r) parts.push(three(r));
  return parts.join(" ");
};
/** ₹ with paise, Indian grouping — documents always show two decimals. */
const rs = (n: number) => (n < 0 ? "−" : "") + "₹" + Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const amt = (n: number) => Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const longDate = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "");
const quoteDate = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "");

export const INVOICE_TERMS = (b: Biz) => [
  `Any disputes will be subject to the jurisdiction of ${b.jurisdiction || "Vadodara, Gujarat"}.`,
  "Payment terms: Immediate/advance",
  "All applicable GST will be added to the invoice amount as per Indian tax laws.",
  "All sales are final, and goods once sold will not be accepted for return or exchange.",
];
export const QUOTE_NOTES = (b: Biz) => [INVOICE_TERMS(b)[0], INVOICE_TERMS(b)[2], INVOICE_TERMS(b)[3]];
export const QUOTE_TERMS = [
  "Scope of Work: Services will be provided strictly as outlined in the quotation. Any additional work or modifications beyond the agreed scope shall be treated as a separate engagement and may incur additional charges.",
  "File & Material Requirements (3D Printing): Clients are required to provide print-ready 3D models in the specified format. Studio Nexify shall not be held responsible for design or dimensional inaccuracies in client-supplied files. Material choice and finish may affect both cost and production time.",
  "Project Timeline: Estimated timelines are provided in good faith and are subject to variation based on project complexity, client approvals, and external dependencies. Any delay caused by the client may extend the delivery schedule accordingly.",
  "Revisions & Modifications: For service-based projects, up to two (2) minor revisions are included in the quoted amount. Any major change or redesign request will be subject to an additional charge amounting to 50% of the original quoted amount.",
  "Payment Terms: For Services: 50% advance payment is required to initiate the project, and the remaining 50% is due upon completion and prior to delivery. For 3D Printing Products: 100% advance payment is required before production begins.",
  "Payments can be made via Bank Transfer or UPI. All prices are exclusive of applicable taxes unless otherwise specified.",
  "Ownership & Intellectual Property: Full ownership and usage rights of the final deliverables will be transferred to the client only after full payment has been received. All drafts, working files, or source project files remain the property of Studio Nexify unless expressly purchased or agreed upon in writing.",
  "Confidentiality: All materials, designs, and client information shared with Studio Nexify will be treated as strictly confidential and will not be disclosed to any third party without prior written consent.",
  "Liability: Studio Nexify shall not be held liable for any indirect, incidental, or consequential losses arising from project delays, data loss, third-party failures, or misuse of delivered materials.",
  "Cancellation Policy: In the event of cancellation, the client shall be invoiced for all work completed up to the date of cancellation, including any non-recoverable expenses incurred.",
  "Acceptance: Proceeding with this quotation or making an advance payment constitutes the client's acceptance of these Terms and Conditions.",
];

export type DocData = {
  kind: "invoice" | "credit" | "quote" | "challan"; title: string; no: string; date: string; party: string; gstin?: string; address?: string; shipTo?: string; contact?: string; pos?: string;
  lines: InvLine[]; gstRate: number; interstate: boolean; shipping?: number; note?: string; valid?: string; tech?: string; cancelled?: boolean; extra?: [string, string][];
};
export const fromInvoice = (i: Invoice): DocData => ({
  kind: i.kind, title: i.kind === "credit" ? "Credit note" : "Tax invoice", cancelled: i.status === "cancelled", no: i.no, date: i.date, party: i.customer, gstin: i.gstin, address: i.address,
  shipTo: i.shipTo, contact: i.contact, pos: i.pos, lines: i.lines, gstRate: i.gstRate, interstate: i.interstate, shipping: i.shipping,
  note: i.against ? `Against ${i.against}. ${i.note ?? ""}` : undefined, extra: i.orderNo ? [["Order", i.orderNo + (i.batch ? ` · ${i.batch}` : "")]] : undefined,
});
export const fromQuote = (q: Quote): DocData => ({ kind: "quote", title: "Quotation", no: q.no, date: q.date, party: q.customer, address: q.address, lines: q.lines, gstRate: q.gstRate, interstate: false, valid: q.valid, tech: q.tech });

function PayInfo({ b }: { b: Biz }) {
  return (
    <div class="text-[11px]">
      <div class="font-bold mb-0.5">PAYMENT INFORMATION</div>
      {b.upi && <div>UPI: {b.upi}</div>}{b.upiNumber && <div>UPI Number: {b.upiNumber}</div>}
      {b.bankName ? <><div>Bank: {b.bankName}</div><div>A/C Name: {b.accName}</div><div>A/C: {b.accNo}</div><div>IFSC: {b.ifsc}</div></> : <div>{b.bank}</div>}
    </div>
  );
}
function Contact({ b }: { b: Biz }) {
  return <div class="text-[11px] text-right"><div class="font-bold">{b.name.toUpperCase()}</div><div>{b.phone}</div><div>{b.email}</div><div>{b.addressShort || b.address}</div>{b.website && <div>{b.website}</div>}</div>;
}

export function DocSheet({ d }: { d: DocData }) {
  const b = bizSig.value;
  const t = invTax({ id: "", kind: d.kind === "credit" ? "invoice" : "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued", shipping: d.shipping });
  if (d.kind === "quote") return <QuoteSheet d={d} b={b} t={t} />;
  const party = (label: string, addr?: string) => (
    <div class="grid grid-cols-[70px_1fr] gap-x-2"><span class="font-semibold">{label}</span><span>{d.party}{addr && <><br />{addr}</>}</span>
      <span class="font-semibold">Contact:</span><span>{d.contact || ""}</span><span class="font-semibold">GST No.</span><span>{d.gstin || ""}</span></div>
  );
  return (
    <article class="print-area bg-white text-black rounded-xl p-4 md:p-8 text-[12px] leading-snug border border-c2 max-w-[820px] @container overflow-x-auto [&_td.text-right]:whitespace-nowrap relative">
      {d.cancelled && <div class="absolute inset-x-0 top-1/3 text-center text-5xl font-bold opacity-20 rotate-[-12deg] pointer-events-none">CANCELLED</div>}
      <header class="text-center mb-3">
        <div class="text-xl font-bold">{b.name.toUpperCase()}</div><div>{b.address}</div>
        <div>Mo: {b.phone} | Email: {b.email}</div><div>{b.website ? `${b.website} | ` : ""}GSTIN: {b.gstin || "—"}</div>
      </header>
      <h1 class="text-right text-lg font-bold uppercase mb-3">{d.title}</h1>
      <section class="grid @lg:grid-cols-[1fr_auto] gap-4 sm:gap-6 mb-3">
        <div class="space-y-2">{party("Bill to:", d.address)}{party("Ship to:", d.shipTo || d.address)}</div>
        <div class="grid grid-cols-[auto_auto] gap-x-4 h-fit">
          <span>{d.kind === "credit" ? "Credit note No.:" : d.kind === "challan" ? "Challan No.:" : "Invoice No.:"}</span><b class="text-right">{d.no}</b>
          <span>{d.kind === "credit" ? "Date:" : "Invoice Date:"}</span><span class="text-right">{longDate(d.date)}</span>
          <span>Place of Supply:</span><span class="text-right">{d.pos || (d.interstate ? "Other state" : "Gujarat")}</span>
          <span>Reverse Charges:</span><span class="text-right">No</span>
          {d.extra?.map(([k, v]) => <><span key={k}>{k}:</span><span class="text-right">{v}</span></>)}
        </div>
      </section>
      <table class="w-full border-collapse mb-3 [&_td]:px-1 [&_th]:px-1">
        <thead><tr class="border-y border-black text-left"><th class="py-1 w-12">Sr. No.</th><th>Description</th><th>HSN / SAC</th><th class="text-right">Unit Price</th><th class="text-right">Qty</th><th class="text-right">Total</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i} class="border-b border-gray-300"><td class="py-1 text-center">{i + 1}</td><td>{l.desc}</td><td>{l.hsn}</td><td class="text-right">{amt(l.rate)}</td><td class="text-right">{l.qty}</td><td class="text-right">{amt(l.qty * l.rate)}</td></tr>)}</tbody>
      </table>
      <section class="grid @lg:grid-cols-[1fr_auto] gap-4 sm:gap-6">
        <div><div class="font-bold">TERMS AND CONDITIONS</div><ol class="list-decimal pl-4">{INVOICE_TERMS(b).map((x) => <li key={x}>{x}</li>)}</ol>{d.note && <p class="mt-2">{d.note}</p>}</div>
        <table class="w-full @lg:w-64 h-fit whitespace-nowrap [&_td]:pl-3 [&_td:first-child]:pl-0"><tbody>
          <tr><td>Sub total</td><td class="text-right">{amt(t.taxable)}</td></tr>
          {!d.gstRate ? null : d.interstate ? <tr><td>IGST ({d.gstRate}%)</td><td class="text-right">{amt(t.igst)}</td></tr> : <><tr><td>CGST ({d.gstRate / 2}%)</td><td class="text-right">{amt(t.cgst)}</td></tr><tr><td>SGST ({d.gstRate / 2}%)</td><td class="text-right">{amt(t.sgst)}</td></tr></>}
          <tr><td>Shipping cost</td><td class="text-right">{amt(t.shipping)}</td></tr>
          <tr><td>Round-off</td><td class="text-right">{t.roundOff < 0 ? "−" : ""}{amt(t.roundOff)}</td></tr>
          <tr class="border-t-2 border-black font-bold"><td class="py-1">Total</td><td class="text-right">{rs(t.total)}</td></tr>
        </tbody></table>
      </section>
      <p class="mt-2">Amount in words: <b>Rupees {words(t.total)} only</b></p>
      <p class="mt-3 text-center italic">Thank you for purchasing from us!</p>
      <footer class="mt-4 flex justify-between items-end gap-4"><PayInfo b={b} /><Contact b={b} /></footer>
    </article>
  );
}

function QuoteSheet({ d, b, t }: { d: DocData; b: Biz; t: ReturnType<typeof invTax> }) {
  const g = d.gstRate / 100;
  return (
    <article class="print-area bg-white text-black rounded-xl p-4 md:p-8 text-[12px] leading-snug border border-c2 max-w-[820px] @container overflow-x-auto [&_td.text-right]:whitespace-nowrap">
      <h1 class="text-2xl font-bold mb-3">QUOTATION</h1>
      <div class="flex flex-wrap justify-between gap-3 mb-2"><span>Date: <b>{quoteDate(d.date)}</b></span><span>Valid until date: <b>{quoteDate(d.valid ?? "")}</b></span><span>Quote Number: <b>{d.no}</b></span></div>
      <div class="flex flex-wrap justify-between gap-3 mb-3"><span>To: <b>{d.party}</b></span>{d.address && <span>Address: {d.address}</span>}</div>
      <table class="w-full border-collapse mb-3 [&_td]:px-1 [&_th]:px-1">
        <thead><tr class="border-y border-black text-left"><th class="py-1 w-12">Sr. No</th><th>Description</th><th class="text-right">Price</th><th class="text-right">QTY</th><th class="text-right">GST ({d.gstRate}%)</th><th class="text-right">Amount</th></tr></thead>
        <tbody>{d.lines.map((l, i) => { const v = l.qty * l.rate; return <tr key={i} class="border-b border-gray-300"><td class="py-1 text-center">{i + 1}</td><td>{l.desc}</td><td class="text-right">{rs(l.rate)}</td><td class="text-right">{l.qty}</td><td class="text-right">{rs(v * g)}</td><td class="text-right">{rs(v * (1 + g))}</td></tr>; })}</tbody>
      </table>
      <section class="grid @lg:grid-cols-[1fr_auto] gap-4 sm:gap-6">
        <div>
          <div class="font-bold">Notes</div><ol class="list-decimal pl-4">{QUOTE_NOTES(b).map((x) => <li key={x}>{x}</li>)}</ol>
          {d.tech && <><div class="font-bold mt-2">Technical Data:</div><ol class="list-decimal pl-4">{d.tech.split("\n").filter(Boolean).map((x) => <li key={x}>{x}</li>)}</ol></>}
        </div>
        <table class="w-full @lg:w-64 h-fit whitespace-nowrap [&_td]:pl-3 [&_td:first-child]:pl-0"><tbody>
          <tr><td>Sub-Total</td><td class="text-right">{rs(t.taxable)}</td></tr>
          <tr><td>GST ({d.gstRate}%)</td><td class="text-right">{rs(t.cgst + t.sgst + t.igst)}</td></tr>
          <tr class="border-t-2 border-black font-bold"><td class="py-1">Total</td><td class="text-right">{rs(t.taxable + t.cgst + t.sgst + t.igst)}</td></tr>
        </tbody></table>
      </section>
      <footer class="mt-4 flex justify-between items-end gap-4"><Contact b={b} /><PayInfo b={b} /></footer>
      <section class="mt-6 break-before-page"><div class="font-bold mb-1">Terms &amp; Conditions</div><ol class="list-decimal pl-4 space-y-1">{QUOTE_TERMS.map((x) => <li key={x}>{x.replace("Studio Nexify", b.name)}</li>)}</ol></section>
    </article>
  );
}
