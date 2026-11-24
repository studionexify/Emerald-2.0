import { invoiceBiz, stateLabel, termsOf , addressFor, stateOfGstin } from "../../data/invoicing";
/** The document generator: tax invoice, credit note and quotation laid out like the studio's existing PDFs (A4, printed from the browser). */
import {invTax, type InvLine, type Invoice, type Party, type Quote} from "../../data";
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
  kind: i.kind, title: i.kind === "credit" ? "Credit note" : "Tax invoice", cancelled: i.status === "cancelled", no: i.no, date: i.date, party: i.customer, gstin: i.gstin, address: i.address || addressFor(i),
  shipTo: i.shipTo, contact: i.contact, pos: i.pos || (i.billTo?.state ? stateLabel(i.billTo.state) : i.gstin ? stateLabel(stateOfGstin(i.gstin)) : undefined), lines: i.lines, gstRate: i.gstRate, interstate: i.interstate, shipping: i.shipping,
  note: i.against ? `Against ${i.against}. ${i.note ?? ""}` : undefined, extra: i.orderNo && !i.billTo ? [["Order", i.orderNo + (i.batch ? ` · ${i.batch}` : "")]] : undefined,
  billTo: i.billTo, shipToParty: i.sameShip ? i.billTo : i.shipToParty, seller: i.seller?.biz, draft: i.no === "Draft",
});
export const fromQuote = (q: Quote): DocData => ({ kind: "quote", title: "Quotation", no: q.no, date: q.date, party: q.customer, address: q.address, lines: q.lines, gstRate: q.gstRate, interstate: false, valid: q.valid, tech: q.tech });

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
  const bill: Party = d.billTo ?? { name: d.party, address: d.address ?? "", contact: d.contact ?? "", gstin: d.gstin ?? "", email: "", state: d.gstin ? stateOfGstin(d.gstin) : "" };
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
  const days = d.valid ? Math.max(0, Math.round((+new Date(d.valid) - +new Date(d.date)) / 86400000)) : 0;
  const notes = ["3D-printed products: 100% advance before production. Services: 50% to start, 50% before delivery.", ...QUOTE_NOTES(b), ...(d.tech?.trim() ? d.tech.split("\n").map((x) => x.trim()).filter(Boolean) : []), "Full terms & conditions are on page 2."];
  const bank = [["Bank details", b.bankName || b.bank], ["Account name", b.accName || b.name], ["Account no.", b.accNo], ["IFSC", b.ifsc], ["UPI", b.upi]].filter(([, v]) => v) as [string, string][];
  const lab = "text-[9px] font-bold uppercase tracking-[0.1em] text-gray-500";
  const Head = ({ children }: { children: string }) => <h2 class="flex items-center gap-3 text-[10.5px] font-bold uppercase tracking-[0.12em] mt-5 mb-2">{children}<span class="flex-1 h-px bg-gray-300" /></h2>;
  const Foot = ({ n }: { n: number }) => <footer class="flex justify-between border-t border-gray-300 pt-1.5 mt-6 text-[9px] text-gray-500"><span>{b.name}{b.website ? ` · ${b.website}` : ""}</span><span>Thank you for considering us.</span><span>Page {n} of 2</span></footer>;
  const page = "relative bg-white text-black border border-gray-300 rounded-xl overflow-hidden px-4 md:px-9 pb-5 text-[12px] leading-snug";
  const base = import.meta.env.BASE_URL;
  return (
    <article class="print-area grid gap-4 max-w-[820px] @container [&_td.r]:text-right [&_th.r]:text-right" style={{ fontFamily: "Montserrat, sans-serif" }}>
      <section class={page}>
        <div class="absolute inset-x-0 top-0 h-[7px] bg-black" /><div class="absolute left-4 md:left-9 top-[7px] h-[2px] w-12 bg-grn" />
        <header class="flex justify-between items-start gap-4 pt-7">
          <div><img src={`${base}nexify-logo.png`} alt={b.name} class="w-32" />
            <div class="mt-2 text-[10px] leading-relaxed text-gray-500"><b class="block text-[12px] tracking-wide text-black">{b.name.toUpperCase()}</b>{b.address}<br />{b.phone} · {b.email}<br />{[b.website, b.gstin ? `GSTIN ${b.gstin}` : ""].filter(Boolean).join(" · ")}</div></div>
          <div class="text-right"><h1 class="text-[26px] font-bold tracking-[0.06em]" style={{ fontFamily: "Comfortaa, sans-serif" }}>QUOTATION</h1><div class="font-bold text-[12px]">{d.no}</div>{days > 0 && <span class="inline-block mt-1.5 rounded-full bg-grn-bg text-grn text-[9px] font-bold tracking-wider px-2.5 py-0.5">VALID FOR {days} DAYS</span>}</div>
        </header>
        <div class="mt-5 grid grid-cols-[1fr_auto] border border-gray-300 rounded-lg">
          <div class="p-3"><div class={lab}>Quotation for</div><div class="font-bold text-[13px] mt-0.5">{d.party || "—"}</div>{d.address && <div class="text-[10px] text-gray-500 whitespace-pre-line mt-0.5">{d.address}</div>}</div>
          <div class="p-3 border-l border-gray-300 flex gap-6 text-right"><div><div class={lab}>Date</div><div class="font-bold text-[12px] mt-0.5">{longDate(d.date)}</div></div><div><div class={lab}>Valid until</div><div class="font-bold text-[12px] mt-0.5">{longDate(d.valid ?? "")}</div></div></div>
        </div>
        <Head>Scope &amp; pricing</Head>
        <table class="w-full border-collapse"><thead><tr class="bg-black [&_th]:!text-white text-[9px] uppercase tracking-wider text-left"><th class="py-1.5 px-2 w-8">#</th><th class="px-2">Description</th><th class="r px-2">Qty</th><th class="r px-2">Rate (₹)</th><th class="r px-2">GST</th><th class="r px-2">Amount (₹)</th></tr></thead>
          <tbody>{d.lines.map((l, i) => { const [name, ...rest] = (l.desc || "—").split(" · "); return <tr key={i} class={`border-b border-gray-200 align-top ${i % 2 ? "bg-gray-50" : ""}`}><td class="py-2 px-2 align-top">{i + 1}</td><td class="px-2"><b class="block">{name}</b>{rest.length > 0 && <span class="text-[10px] text-gray-500">{rest.join(" · ")}</span>}</td><td class="r px-2">{l.qty}</td><td class="r px-2">{amt(l.rate)}</td><td class="r px-2">{d.gstRate}%</td><td class="r px-2">{amt(l.qty * l.rate)}</td></tr>; })}</tbody></table>
        <table class="mt-4 ml-auto w-64 text-[12px]"><tbody>
          <tr><td class="py-0.5">Sub-total</td><td class="r">{rs(t.taxable)}</td></tr>
          {t.igst ? <tr><td class="py-0.5">IGST {d.gstRate}%</td><td class="r">{rs(t.igst)}</td></tr> : <><tr><td class="py-0.5">CGST {d.gstRate / 2}%</td><td class="r">{rs(t.cgst)}</td></tr><tr><td class="py-0.5">SGST {d.gstRate / 2}%</td><td class="r">{rs(t.sgst)}</td></tr></>}
          {t.roundOff !== 0 && <tr><td class="py-0.5">Round-off</td><td class="r">{(t.roundOff < 0 ? "−" : "") + rs(Math.abs(t.roundOff))}</td></tr>}
          <tr class="border-t-2 border-black font-bold text-[14px]"><td class="pt-1.5">Total</td><td class="r pt-1.5">{rs(t.total)}</td></tr></tbody></table>
        <div class="text-right text-[9.5px] text-gray-500 mt-1">Rupees {words(t.total)} only</div>
        {bank.length > 0 && <div class="mt-5 grid gap-3 border border-gray-300 rounded-lg p-3" style={{ gridTemplateColumns: `repeat(${bank.length}, minmax(0, 1fr))` }}>{bank.map(([k, v]) => <div key={k} class="min-w-0"><div class={lab}>{k}</div><div class="font-bold text-[10.5px] break-words mt-0.5">{v}</div></div>)}</div>}
        <Head>Payment terms &amp; notes</Head>
        <ol class="list-decimal pl-4 text-[10px] text-gray-700 leading-relaxed">{notes.map((x) => <li key={x}>{x}</li>)}</ol>
        <div class="mt-6 flex justify-between items-end gap-6"><p class="text-[10px] text-gray-500 max-w-[45%]">To accept, reply “Approved” on WhatsApp or e-mail, or sign and return this quotation.</p>
          <div class="w-56 text-center"><div class="text-[28px] leading-none text-indigo-900 -rotate-2" style={{ fontFamily: "'Dancing Script', cursive", fontWeight: 600 }}>{b.signName || "Ankit P"}</div><div class="border-t border-black mt-1 pt-1 text-[10px]">Authorised signatory · {b.name}</div></div></div>
        <Foot n={1} />
      </section>
      <section class={page}>
        <div class="absolute inset-x-0 top-0 h-[7px] bg-black" /><div class="absolute left-4 md:left-9 top-[7px] h-[2px] w-12 bg-grn" />
        <header class="flex justify-between items-start gap-4 pt-7"><img src={`${base}nexify-logo.png`} alt={b.name} class="w-24" /><div class="text-right"><b class="text-[12px]">QUOTATION {d.no}</b><div class="text-[10px] text-gray-500">{b.name} · Terms &amp; conditions</div></div></header>
        <Head>Terms &amp; conditions</Head>
        <ol class="list-none space-y-2.5 text-[10.5px] text-gray-700 leading-relaxed">{QUOTE_TERMS.map((x, i) => { const s = x.replace("Studio Nexify", b.name), m = /^([^:]{3,45}):\s(.*)$/.exec(s), title = m && !s.startsWith("Payments can") ? m[1] : ""; return <li key={i} class="flex gap-2"><span class="w-4 shrink-0 font-bold text-black">{i + 1}.</span><span>{title && <b class="block text-black">{title}</b>}{title ? m![2] : s}</span></li>; })}</ol>
        <div class="mt-8 flex justify-between items-end gap-6"><span class="text-[10px] text-gray-500">Accepted by client (name, signature &amp; date)</span><div class="w-56 text-center border-t border-black pt-1 text-[10px]">Client signature</div></div>
        <Foot n={2} />
      </section>
    </article>
  );
}
