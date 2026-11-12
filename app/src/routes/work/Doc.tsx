/** The document generator: tax invoice, credit note and quotation laid out like the studio's existing PDFs (A4, printed from the browser). */
import { invTax, invoiceBiz, stateLabel, termsOf, type InvLine, type Invoice, type Party, type Quote } from "../../data";
import type { Biz } from "../../data/biz";

export const words = (n: number): string => {
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
export const amt = (n: number) => Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const longDate = (d: string) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-") : "");
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

/** One A4 tax invoice / credit note page — same measurements as the studio's PDFs and the downloaded PDF (mm / pt). */
export function DocSheet({ d, copy }: { d: DocData; copy?: string }) {
  useDocFonts();
  const b = d.seller ?? invoiceBiz.value;
  const t = invTax({ id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued", shipping: d.shipping });
  if (d.kind === "quote") return <QuoteSheet d={d} b={b} t={t} />;
  const bill: Party = d.billTo ?? { name: d.party, address: d.address ?? "", contact: d.contact ?? "", gstin: d.gstin ?? "", email: "", state: "" };
  const ship: Party = d.shipToParty ?? (d.shipTo ? { ...bill, name: d.shipTo.split("\n")[0], address: d.shipTo.split("\n").slice(1).join("\n") || d.shipTo } : bill);
  const credit = d.kind === "credit";
  const IN = "#d9d9d9", OUT = "#b7b7b7";
  const td = { borderTop: `0.23mm solid ${IN}`, height: "4.9mm", padding: "0 0.8mm", verticalAlign: "middle" } as const;
  const vl = { borderLeft: `0.23mm solid ${IN}` };
  const addr = (p: Party) => { const st = p.state ? stateLabel(p.state) : ""; return p.address + (st && !p.address.toLowerCase().includes(p.state.toLowerCase()) ? `\n${st}` : ""); };
  const party = (label: string, p: Party) => <>
    <tr><td style={{ ...td, background: "#000", color: "#fff", fontWeight: 700, width: "19.6mm" }}>{label}</td><td style={{ ...td, ...vl, fontWeight: 700 }}>{p.name}</td></tr>
    <tr><td colSpan={2} style={{ ...td, height: "14.7mm", verticalAlign: "top", paddingTop: "1.1mm", fontWeight: 700, whiteSpace: "pre-line", lineHeight: "3.3mm" }}>{addr(p)}</td></tr>
    <tr><td style={td}>Contact:</td><td style={{ ...td, ...vl, fontWeight: 700 }}>{p.contact || "-"}</td></tr>
    <tr><td style={td}>GST No.</td><td style={{ ...td, ...vl, fontWeight: 700 }}>{p.gstin || "-"}</td></tr>
  </>;
  const facts: [string, string][] = [[credit ? "Credit Note No.:" : "Invoice No.:", d.no], [credit ? "Date:" : "Invoice Date:", longDate(d.date)], ["Place of Supply:", d.pos || (d.interstate ? "Other state" : "Gujarat (24)")], ["Reverse Charges:", "No"]];
  if (credit && d.note) facts.push(["Against:", d.note.replace(/^Against ([^.]+).*$/, "$1")]);
  const rows = [...d.lines, ...Array.from({ length: Math.max(0, 5 - d.lines.length) }, () => null)];
  const colW = ["19.6mm", "47.1mm", "23.6mm", "23.6mm", "23.5mm", "37.1mm"];
  const cell = { borderTop: `0.23mm solid ${IN}`, borderLeft: `0.23mm solid ${IN}`, minHeight: "4.9mm", height: "4.9mm", padding: "0 0.8mm", verticalAlign: "top", paddingTop: "1mm", lineHeight: "3.3mm" } as const;
  const tot: [string, string, boolean][] = [["Sub total", amt(t.taxable), true],
    ...(d.interstate ? [[`IGST (${d.gstRate}%)`, amt(t.igst), false]] : [[`CGST (${d.gstRate / 2}%)`, amt(t.cgst), false], [`SGST (${d.gstRate / 2}%)`, amt(t.sgst), false]]) as [string, string, boolean][],
    ...(t.shipping ? [["Shipping cost", amt(t.shipping), false]] : []) as [string, string, boolean][],
    ["Round-off", (t.roundOff < 0 ? "-" : "") + amt(t.roundOff), true]];
  const blue = { color: "#1155cc", textDecoration: "underline" };
  return (
    <article class="doc-a4 bg-white text-black relative mx-auto shadow-sm border border-c2" style={{ fontFamily: "Montserrat, var(--font-sans)", fontSize: "7.7pt", lineHeight: 1.25, padding: "19mm 17.8mm 12mm 17.7mm" }}>
      {(d.cancelled || d.draft) && <div class="absolute inset-x-0 text-center font-bold pointer-events-none" style={{ top: "120mm", fontSize: "54pt", color: "#e8e8e8", transform: "rotate(-14deg)" }}>{d.cancelled ? "CANCELLED" : "DRAFT"}</div>}
      <img src="/nexify-logo.png" alt={b.name} class="absolute" style={{ right: "17.9mm", top: "19mm", width: "35.5mm", height: "15.7mm", objectFit: "contain" }} />
      <header style={{ paddingLeft: "0.8mm", fontWeight: 700 }}>
        <div style={{ fontSize: "11.2pt", lineHeight: "5.8mm", marginTop: "0.8mm" }}>{b.name.toUpperCase()}</div>
        <div style={{ lineHeight: "4.9mm" }}>{b.address}</div>
        <div style={{ lineHeight: "4.9mm" }}>Mo: {b.phone}&nbsp;&nbsp;|&nbsp;&nbsp;Email: {b.email}</div>
        <div style={{ lineHeight: "4.9mm" }}>{b.website && <><a href={b.website.startsWith("http") ? b.website : "https://" + b.website} style={blue}>{b.website}</a>&nbsp;&nbsp;|&nbsp;&nbsp;</>}GSTIN: {b.gstin}</div>
      </header>
      <div style={{ height: "4.6mm", textAlign: "right", fontSize: "6.2pt", fontWeight: 700, paddingRight: "0.8mm", paddingTop: "1.2mm" }}>{copy ? copy.toUpperCase() : ""}</div>
      <h1 style={{ fontFamily: "Comfortaa, cursive", fontWeight: 700, fontSize: "12.9pt", textAlign: "center", textDecoration: "underline", textUnderlineOffset: "1mm", textDecorationThickness: "0.23mm", margin: "0 0 6.6mm", lineHeight: "5mm" }}>{credit ? "CREDIT NOTE" : "TAX INVOICE"}</h1>
      <section style={{ display: "grid", gridTemplateColumns: "90.3mm 84.2mm", alignItems: "start" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", border: `0.23mm solid ${OUT}` }}><tbody>{party("Bill to:", bill)}{party("Ship to:", ship)}</tbody></table>
        <table style={{ borderCollapse: "collapse", width: "100%", borderRight: `0.23mm solid ${IN}`, borderBottom: `0.23mm solid ${IN}` }}><tbody>
          {facts.map(([k, v]) => <tr key={k}><td style={{ ...td, textAlign: "right", width: "47mm" }}>{k}</td><td style={{ ...td, ...vl, textAlign: "right", fontWeight: 700 }}>{v}</td></tr>)}
        </tbody></table>
      </section>
      <table style={{ borderCollapse: "collapse", width: "174.5mm", marginTop: "4.9mm", borderRight: `0.23mm solid ${IN}`, borderBottom: `0.23mm solid ${IN}`, tableLayout: "fixed" }}>
        <colgroup>{colW.map((w, k) => <col key={k} style={{ width: w }} />)}</colgroup>
        <thead><tr>{["Sr. No.", "Description", "HSN / SAC", "Unit Price", "Qty", "Total"].map((h, k) => <th key={h} style={{ ...cell, fontWeight: 700, textAlign: k === 1 || k === 2 ? "left" : "center" }}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((l, i) => <tr key={i}>{l ? <>
          <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td><td style={cell}>{l.desc}</td><td style={cell}>{l.hsn}</td>
          <td style={{ ...cell, textAlign: "center" }}>₹{amt(l.rate)}</td><td style={{ ...cell, textAlign: "center" }}>{l.qty}</td><td style={{ ...cell, textAlign: "center" }}>{amt(l.qty * l.rate)}</td>
        </> : colW.map((_, k) => <td key={k} style={cell} />)}</tr>)}</tbody>
      </table>
      <section style={{ display: "grid", gridTemplateColumns: "1fr 60.6mm", marginTop: "4.9mm", alignItems: "start" }}>
        <div style={{ fontSize: "6.9pt", paddingLeft: "0.8mm", paddingTop: "5.8mm", lineHeight: "2.95mm", maxWidth: "88mm" }}>
          <div style={{ fontWeight: 700, marginBottom: "3mm" }}>{credit ? "NOTE" : "TERMS AND CONDITIONS"}</div>
          {credit && d.note ? <div>{d.note}</div> : termsOf(b).map((x, k) => <div key={k}>{k + 1}. {x}</div>)}
          <div style={{ marginTop: "1.5mm" }}>Amount in words: <b style={{ fontWeight: 700 }}>Indian Rupees {words(t.total)} Only</b></div>
        </div>
        <div>
          {tot.map(([k, v, bold]) => <div key={k} style={{ display: "grid", gridTemplateColumns: "23.5mm 37.1mm", height: "4.9mm", alignItems: "center" }}>
            <span style={{ textAlign: "right", paddingRight: "0.8mm", fontWeight: bold ? 700 : 400 }}>{k}</span>
            <span style={{ textAlign: "center", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", borderTop: `0.23mm solid ${IN}`, borderLeft: `0.23mm solid ${IN}`, borderRight: `0.23mm solid ${IN}` }}>{v}</span></div>)}
          <div style={{ display: "grid", gridTemplateColumns: "23.5mm 37.1mm", height: "9.8mm" }}>
            <span style={{ background: "#efefef", border: "0.23mm solid #000", borderRight: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>Total</span>
            <span style={{ background: "#000", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "10.3pt" }}>₹{amt(t.total)}</span>
          </div>
        </div>
      </section>
      <p style={{ fontFamily: "Comfortaa, cursive", fontSize: "11.2pt", marginTop: "10.5mm", paddingLeft: "0.8mm" }}><span style={{ textDecoration: "underline", textUnderlineOffset: "0.9mm", textDecorationThickness: "0.2mm" }}>{b.thanks || "Thank you for purchasing from us!"}</span></p>
      <footer style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginTop: "3.6mm", padding: "0 0.7mm 0 0.8mm", lineHeight: "3.3mm" }}>
        <div><div style={{ fontWeight: 700, marginBottom: "3.3mm" }}>PAYMENT INFORMATION</div>
          {b.upi && <div>UPI: {b.upi}</div>}{b.upiNumber && <div>UPI Number: {b.upiNumber}</div>}
          <div style={{ marginTop: "3.4mm" }}>{b.bankName ? <><div>Bank: {b.bankName}</div><div>A/C Name: {b.accName}</div><div>A/C: {b.accNo}</div><div>IFSC: {b.ifsc}</div></> : b.bank}</div></div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>{b.name.toUpperCase()}</div>
          <div style={{ fontFamily: "'Dancing Script', cursive", color: "#1a3fbf", fontSize: "15pt", lineHeight: "6.4mm" }}>{b.signName || "Ankit P"}</div>
          <div style={{ fontSize: "6pt", lineHeight: "3mm", marginBottom: "3.2mm" }}>Authorised Signatory</div>
          <div>{b.phone}</div><div>{b.email}</div><div>{b.addressShort || b.address}</div>{b.website && <a href={b.website.startsWith("http") ? b.website : "https://" + b.website} style={blue}>{b.website}</a>}
        </div>
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
