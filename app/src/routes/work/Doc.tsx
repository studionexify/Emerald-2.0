/** The document generator: tax invoice, credit note and quotation laid out like the studio's existing PDFs (A4, printed from the browser). */
import { invTax, invoiceBiz, stateLabel, termsOf, type InvLine, type Invoice, type Party, type Quote } from "../../data";
import type { Biz } from "../../data/biz";

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
  /** New invoices: the parties and the company details frozen at issue. */
  billTo?: Party; shipToParty?: Party; seller?: Biz; draft?: boolean;
};
export const fromInvoice = (i: Invoice): DocData => ({
  kind: i.kind, title: i.kind === "credit" ? "Credit note" : "Tax invoice", cancelled: i.status === "cancelled", no: i.no, date: i.date, party: i.customer, gstin: i.gstin, address: i.address,
  shipTo: i.shipTo, contact: i.contact, pos: i.pos, lines: i.lines, gstRate: i.gstRate, interstate: i.interstate, shipping: i.shipping,
  note: i.against ? `Against ${i.against}. ${i.note ?? ""}` : undefined, extra: i.orderNo && !i.billTo ? [["Order", i.orderNo + (i.batch ? ` · ${i.batch}` : "")]] : undefined,
  billTo: i.billTo, shipToParty: i.sameShip ? i.billTo : i.shipToParty, seller: i.seller?.biz, draft: i.no === "Draft",
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

/* Fonts used by the studio's invoice PDFs, loaded only when a document is shown. */
let fontsIn = false;
function useDocFonts() {
  if (fontsIn || typeof document === "undefined") return; fontsIn = true;
  const l = document.createElement("link"); l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700&family=Dancing+Script:wght@600&family=Montserrat:wght@400;600;700&display=swap";
  document.head.appendChild(l);
}
const site = (w?: string) => (w ? (w.startsWith("http") ? w : "https://" + w) : "");

/** One A4 tax invoice / credit note page, laid out like the studio's invoices. `copy` prints "Original for Recipient" etc. */
export function DocSheet({ d, copy }: { d: DocData; copy?: string }) {
  useDocFonts();
  const b = d.seller ?? invoiceBiz.value;
  const t = invTax({ id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued", shipping: d.shipping });
  if (d.kind === "quote") return <QuoteSheet d={d} b={b} t={t} />;
  const bill: Party = d.billTo ?? { name: d.party, address: d.address ?? "", contact: d.contact ?? "", gstin: d.gstin ?? "", email: "", state: "" };
  const ship: Party = d.shipToParty ?? (d.shipTo ? { ...bill, name: d.shipTo.split("\n")[0], address: d.shipTo.split("\n").slice(1).join("\n") || d.shipTo } : bill);
  const cell = "border border-[#c8c8c8] px-[5px] py-[3px] align-top";
  const party = (label: string, p: Party) => <>
    <tr><td class={`${cell} bg-black text-white font-bold w-[96px]`}>{label}</td><td class={`${cell} font-bold`}>{p.name}</td></tr>
    <tr><td colSpan={2} class={`${cell} font-bold whitespace-pre-line h-[66px]`}>{p.address}</td></tr>
    <tr><td class={cell}>Contact:</td><td class={`${cell} font-bold`}>{p.contact || "-"}</td></tr>
    {p.email && <tr><td class={cell}>Email:</td><td class={`${cell} font-bold`}>{p.email}</td></tr>}
    <tr><td class={cell}>GST No.</td><td class={`${cell} font-bold`}>{p.gstin || "-"}</td></tr>
    {p.state && <tr><td class={cell}>State:</td><td class={`${cell} font-bold`}>{stateLabel(p.state)}</td></tr>}
  </>;
  const rows = [...d.lines, ...Array.from({ length: Math.max(0, 5 - d.lines.length) }, () => null)];
  const credit = d.kind === "credit";
  return (
    <article class="doc-a4 bg-white text-black relative mx-auto shadow-sm border border-c2 text-[11.5px] leading-[1.35]" style={{ fontFamily: "Montserrat, var(--font-sans)" }}>
      {d.cancelled && <div class="absolute inset-x-0 top-[40%] text-center text-6xl font-bold opacity-15 rotate-[-14deg] pointer-events-none">CANCELLED</div>}
      {d.draft && <div class="absolute inset-x-0 top-[40%] text-center text-6xl font-bold opacity-10 rotate-[-14deg] pointer-events-none">DRAFT</div>}
      <header class="flex justify-between items-start">
        <div class="font-bold text-[12px] leading-[1.75]">
          <div class="text-[17px] mb-0.5">{b.name.toUpperCase()}</div>
          <div>{b.address}</div>
          <div>Mo: {b.phone}&nbsp;&nbsp;|&nbsp;&nbsp;Email: {b.email}</div>
          <div>{b.website && <><a href={site(b.website)} class="text-[#1155cc] underline">{b.website}</a>&nbsp;&nbsp;|&nbsp;&nbsp;</>}GSTIN: {b.gstin}</div>
        </div>
        <img src="/nexify-logo.png" alt={b.name} class="h-[68px] w-auto mt-1" />
      </header>
      {copy && <div class="text-right text-[10px] font-semibold mt-3 uppercase tracking-wide">{copy}</div>}
      <h1 class={`text-center text-[21px] font-normal underline underline-offset-4 ${copy ? "mt-1" : "mt-7"} mb-7`}>{credit ? "CREDIT NOTE" : "TAX INVOICE"}</h1>
      <section class="grid grid-cols-[52%_48%] items-start">
        <table class="w-full border-collapse"><tbody>{party("Bill to:", bill)}{party("Ship to:", ship)}</tbody></table>
        <table class="w-full border-collapse"><tbody>
          {([[credit ? "Credit Note No.:" : "Invoice No.:", d.no], [credit ? "Date:" : "Invoice Date:", longDate(d.date)], ["Place of Supply:", d.pos || (d.interstate ? "Other state" : "Gujarat (24)")], ["Reverse Charges:", "No"], ...(d.note && credit ? [["Against:", d.note.replace(/^Against ([^.]+).*$/, "$1")]] : []), ...(d.extra ?? [])] as [string, string][]).map(([k, v]) =>
            <tr key={k}><td class={`${cell} text-right w-1/2`}>{k}</td><td class={`${cell} text-right font-bold`}>{v}</td></tr>)}
        </tbody></table>
      </section>
      <table class="w-full border-collapse mt-6 text-center">
        <thead><tr class="font-bold">{["Sr. No.", "Description", "HSN / SAC", "Unit Price", "Qty", "Total"].map((h, k) => <th key={h} class={`${cell} ${k === 1 ? "text-left" : ""} ${["w-[10%]", "w-[27%]", "w-[13.5%]", "w-[13.5%]", "w-[13.5%]", "w-[22%]"][k]}`}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((l, i) => <tr key={i} class="h-[25px]">{l ? <><td class={cell}>{i + 1}</td><td class={`${cell} text-left`}>{l.desc}</td><td class={cell}>{l.hsn}</td><td class={cell}>₹{amt(l.rate)}</td><td class={cell}>{l.qty}</td><td class={cell}>{amt(l.qty * l.rate)}</td></> : [0, 1, 2, 3, 4, 5].map((k) => <td key={k} class={cell} />)}</tr>)}</tbody>
      </table>
      <section class="grid grid-cols-[1fr_auto] gap-8 mt-6 items-start">
        <div class="pt-6 text-[11px]">
          <div class="font-bold mb-3">{credit ? "NOTE" : "TERMS AND CONDITIONS"}</div>
          {credit && d.note ? <p>{d.note}</p> : <ol class="list-none">{termsOf(b).map((x, k) => <li key={k}>{k + 1}. {x}</li>)}</ol>}
        </div>
        <table class="border-collapse w-[290px]"><tbody>
          <tr><td class="text-right pr-1 py-[3px] font-bold">Sub total</td><td class={`${cell} text-center w-[175px]`}>{amt(t.taxable)}</td></tr>
          {d.interstate ? <tr><td class="text-right pr-1 py-[3px]">IGST ({d.gstRate}%)</td><td class={`${cell} text-center`}>{amt(t.igst)}</td></tr>
            : <><tr><td class="text-right pr-1 py-[3px]">CGST ({d.gstRate / 2}%)</td><td class={`${cell} text-center`}>{amt(t.cgst)}</td></tr><tr><td class="text-right pr-1 py-[3px]">SGST ({d.gstRate / 2}%)</td><td class={`${cell} text-center`}>{amt(t.sgst)}</td></tr></>}
          {t.shipping ? <tr><td class="text-right pr-1 py-[3px]">Shipping cost</td><td class={`${cell} text-center`}>{amt(t.shipping)}</td></tr> : null}
          <tr><td class="text-right pr-1 py-[3px] font-bold">Round-off</td><td class={`${cell} text-center`}>{t.roundOff < 0 ? "-" : ""}{amt(t.roundOff)}</td></tr>
          <tr><td class="border border-black bg-[#efefef] text-center font-bold py-3">Total</td><td class="border border-black bg-black text-white text-center font-bold text-[17px]">₹{amt(t.total)}</td></tr>
        </tbody></table>
      </section>
      <div class="flex justify-between items-end gap-6 mt-4">
        <p class="text-[11px]">Amount in words: <b>Indian Rupees {words(t.total)} Only</b></p>
        <div class="text-center text-[11px] shrink-0 w-[200px]">
          <div class="font-bold">For {b.name.toUpperCase()}</div>
          <div class="text-[#1a3fbf] text-[28px] leading-none my-1.5" style={{ fontFamily: "'Dancing Script', cursive" }}>{b.signName || "Ankit P"}</div>
          <div class="border-t border-[#999] pt-0.5">Authorised Signatory</div>
        </div>
      </div>
      <p class="mt-5 text-[19px] underline underline-offset-4" style={{ fontFamily: "Comfortaa, cursive" }}>{b.thanks || "Thank you for purchasing from us!"}</p>
      <footer class="mt-4 flex justify-between items-start text-[11.5px]">
        <div><div class="font-bold mb-4">PAYMENT INFORMATION</div>
          {b.upi && <div>UPI: {b.upi}</div>}{b.upiNumber && <div>UPI Number: {b.upiNumber}</div>}
          <div class="mt-4">{b.bankName ? <><div>Bank: {b.bankName}</div><div>A/C Name: {b.accName}</div><div>A/C: {b.accNo}</div><div>IFSC: {b.ifsc}</div></> : b.bank}</div></div>
        <div class="text-right"><div class="font-bold mb-[52px]">{b.name.toUpperCase()}</div><div>{b.phone}</div><div>{b.email}</div><div>{b.addressShort || b.address}</div>{b.website && <a href={site(b.website)} class="text-[#1155cc] underline">{b.website}</a>}</div>
      </footer>
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
