/** The document generator: quotation, tax invoice, credit note, delivery challan — one A4 sheet, printed from the browser. */
import { inr, invTax, rate, type InvLine, type Invoice, type Quote } from "../../data";
import { bizSig } from "../../data/biz";

const words = (n: number): string => {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const two = (x: number) => (x < 20 ? a[x] : `${b[Math.floor(x / 10)]} ${a[x % 10]}`.trim());
  const three = (x: number) => (x >= 100 ? `${a[Math.floor(x / 100)]} Hundred ${two(x % 100)}` : two(x)).trim();
  n = Math.round(n); if (!n) return "Zero";
  const parts: string[] = []; const cr = Math.floor(n / 1e7), l = Math.floor((n % 1e7) / 1e5), t = Math.floor((n % 1e5) / 1000), r = n % 1000;
  if (cr) parts.push(`${three(cr)} Crore`); if (l) parts.push(`${two(l)} Lakh`); if (t) parts.push(`${two(t)} Thousand`); if (r) parts.push(three(r));
  return parts.join(" ");
};

export type DocData = { title: string; no: string; date: string; party: string; gstin?: string; address?: string; lines: InvLine[]; gstRate: number; interstate: boolean; note?: string; extra?: [string, string][] };
export const fromInvoice = (i: Invoice): DocData => ({ title: i.kind === "credit" ? "Credit note" : i.status === "cancelled" ? "Tax invoice — CANCELLED" : "Tax invoice", no: i.no, date: i.date, party: i.customer, gstin: i.gstin, address: i.address, lines: i.lines, gstRate: i.gstRate, interstate: i.interstate, note: i.against ? `Against ${i.against}. ${i.note ?? ""}` : undefined, extra: i.orderNo ? [["Order", i.orderNo + (i.batch ? ` · ${i.batch}` : "")]] : undefined });
export const fromQuote = (q: Quote): DocData => ({ title: "Quotation", no: q.no, date: q.date, party: q.customer, lines: q.lines, gstRate: q.gstRate, interstate: false, extra: [["Valid until", q.valid]], note: `Prices valid till ${q.valid}. ${rate("terms")}-day payment terms.` });

export function DocSheet({ d }: { d: DocData }) {
  const b = bizSig.value;
  const fake: Invoice = { id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued" };
  const t = invTax(fake);
  return (
    <article class="print-area bg-white text-black rounded-xl p-5 md:p-8 text-[12px] leading-snug border border-c2 max-w-[820px]">
      <header class="flex justify-between gap-4 border-b-2 border-black pb-3 mb-3">
        <div><div class="text-xl font-bold">{b.name}</div><div>{b.address}</div><div>GSTIN {b.gstin || "—"} · PAN {b.pan || "—"}</div><div>{b.phone} · {b.email}</div></div>
        <div class="text-right"><div class="text-lg font-bold uppercase">{d.title}</div><div>No. <b>{d.no}</b></div><div>Date {d.date}</div>{d.extra?.map(([k, v]) => <div key={k}>{k} {v}</div>)}</div>
      </header>
      <section class="mb-3"><div class="font-semibold">Bill to</div><div>{d.party}</div>{d.address && <div>{d.address}</div>}{d.gstin && <div>GSTIN {d.gstin}</div>}<div>Place of supply: {d.interstate ? "Other state (IGST)" : "Gujarat (CGST + SGST)"}</div></section>
      <table class="w-full border-collapse mb-3">
        <thead><tr class="border-y border-black text-left"><th class="py-1">#</th><th>Description</th><th>HSN</th><th class="text-right">Qty</th><th class="text-right">Rate</th><th class="text-right">Amount</th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i} class="border-b border-gray-300"><td class="py-1">{i + 1}</td><td>{l.desc}</td><td>{l.hsn}</td><td class="text-right">{l.qty}</td><td class="text-right">{inr(l.rate)}</td><td class="text-right">{inr(l.qty * l.rate)}</td></tr>)}</tbody>
      </table>
      <div class="flex justify-end"><table class="w-64">
        <tbody>
          <tr><td>Taxable value</td><td class="text-right">{inr(t.taxable)}</td></tr>
          {d.interstate ? <tr><td>IGST {d.gstRate}%</td><td class="text-right">{inr(t.igst)}</td></tr> : <><tr><td>CGST {d.gstRate / 2}%</td><td class="text-right">{inr(t.cgst)}</td></tr><tr><td>SGST {d.gstRate / 2}%</td><td class="text-right">{inr(t.sgst)}</td></tr></>}
          <tr class="border-t-2 border-black font-bold"><td class="py-1">Total</td><td class="text-right">{inr(t.total)}</td></tr>
        </tbody>
      </table></div>
      <p class="mt-2">Amount in words: <b>Rupees {words(t.total)} only</b></p>
      {d.note && <p class="mt-2">{d.note}</p>}
      <footer class="mt-6 flex justify-between items-end gap-4"><div>Bank: {b.bank || "—"}<br />Terms: {b.terms}</div><div class="text-right">For {b.name}<br /><br />Authorised signatory</div></footer>
    </article>
  );
}
