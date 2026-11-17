/** The quotation as a real PDF (selectable text, A4, several pages when it has many lines), laid out like the on-screen QuoteSheet. */
import type { jsPDF as JsPDF } from "jspdf";
import { invTax } from "../../data";
import { invoiceBiz } from "../../data/invoicing";
import { amt, longDate, QUOTE_NOTES, QUOTE_TERMS, type DocData } from "./Doc";
import { b64, FONTS } from "./pdf";

const L = 16, R = 194, W = R - L, BOTTOM = 280;

export async function quotePdf(d: DocData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const base = import.meta.env.BASE_URL, b = d.seller ?? invoiceBiz.value;
  const [fonts, logo] = await Promise.all([Promise.all(FONTS.map(([f]) => b64(`${base}fonts/${f}`))), b64(`${base}nexify-logo.png`, true)]);
  const pdf: JsPDF = new jsPDF({ unit: "mm", format: "a4", compress: true });
  FONTS.forEach(([f, fam, style], i) => { pdf.addFileToVFS(f, fonts[i]); pdf.addFont(f, fam, style, undefined, "Identity-H"); });
  pdf.setProperties({ title: `Quotation ${d.no}`, subject: d.party, creator: "Emerald" });
  const t = invTax({ id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: false, status: "issued" });
  const gst = t.cgst + t.sgst + t.igst, total = t.total;

  let y = 0;
  const font = (style: "normal" | "bold", pt = 8, fam = "Montserrat") => { pdf.setFont(fam, style); pdf.setFontSize(pt); };
  const T = (s: string, x: number, top: number, align: "left" | "center" | "right" = "left") => pdf.text(s, x, top, { align, baseline: "top" });
  const wrap = (s: string, w: number) => pdf.splitTextToSize(s, w) as string[];
  const rule = (yy: number, g = 190) => { pdf.setDrawColor(g, g, g); pdf.setLineWidth(0.2); pdf.line(L, yy, R, yy); };
  const ink = (g = 0) => pdf.setTextColor(g, g, g);
  const line = (s: string, x: number, step: number, w: number) => { for (const part of wrap(s, w)) { T(part, x, y); y += step; } };
  const room = (h: number) => { if (y + h > BOTTOM) { pdf.addPage(); y = 18; return true; } return false; };

  /* header */
  ink(); font("bold", 12); T(b.name.toUpperCase(), L, 14);
  font("normal", 7.6); let hy = 20;
  for (const s of [b.address, `Mo: ${b.phone}  |  ${b.email}`, b.website ?? "", b.gstin ? `GSTIN: ${b.gstin}` : ""].filter(Boolean)) { for (const p of wrap(s, 110)) { T(p, L, hy); hy += 3.9; } }
  pdf.addImage(logo, "PNG", R - 36, 12, 36, 36 * (300 / 573));
  y = Math.max(hy, 12 + 36 * (300 / 573)) + 6; rule(y); y += 6;
  font("bold", 17, "Comfortaa"); T("QUOTATION", L, y); y += 11;
  font("normal", 8.4);
  T("Quote number", L, y); T("Date", L + 62, y); T("Valid until", L + 112, y); y += 4.2;
  font("bold", 9.2); T(d.no, L, y); T(longDate(d.date), L + 62, y); T(longDate(d.valid ?? ""), L + 112, y); y += 8;
  font("normal", 8.4); T("To", L, y); y += 4.2; font("bold", 10.5); line(d.party || "—", L, 4.8, W);
  if (d.address) { font("normal", 8.4); line(d.address, L, 3.9, W); }
  y += 4;

  /* table: Sr | Description | Price | Qty | GST | Amount */
  const C = { sr: L, desc: L + 11, price: R - 78, qty: R - 52, gst: R - 36, amt: R };
  const head = () => {
    pdf.setFillColor(0, 0, 0); pdf.rect(L, y, W, 6.4, "F"); pdf.setTextColor(255, 255, 255); font("bold", 7.6);
    T("Sr.", C.sr + 2, y + 1.9); T("Description", C.desc, y + 1.9); T("Price", C.price, y + 1.9, "right"); T("Qty", C.qty, y + 1.9, "right"); T(`GST ${d.gstRate}%`, C.gst, y + 1.9, "right"); T("Amount", C.amt - 1.5, y + 1.9, "right"); ink(); y += 8;
  };
  head();
  d.lines.forEach((l, i) => {
    font("normal", 8.4);
    const desc = wrap(l.desc || "—", C.price - C.desc - 22), h = Math.max(6.4, desc.length * 4 + 2.4);
    if (room(h + 2)) head();
    const v = l.qty * l.rate, lg = Math.round(v * d.gstRate) / 100;
    T(String(i + 1), C.sr + 2, y); desc.forEach((s, k) => T(s, C.desc, y + k * 4));
    T(amt(l.rate), C.price, y, "right"); T(String(l.qty), C.qty, y, "right"); T(amt(lg), C.gst, y, "right"); T(amt(v + lg), C.amt - 1.5, y, "right");
    y += h; rule(y - 1.4, 215);
  });
  y += 3;

  /* totals (right) with notes and technical data (left) */
  const top = y; room(40);
  const ty = y; let k0 = y;
  font("normal", 8.4); T("Sub-total", R - 60, y); T(amt(t.taxable), R, y, "right"); y += 5.2;
  T(`GST (${d.gstRate}%)`, R - 60, y); T(amt(gst), R, y, "right"); y += 5.2;
  if (t.roundOff !== 0) { T("Round-off", R - 60, y); T((t.roundOff < 0 ? "-" : "") + amt(t.roundOff), R, y, "right"); y += 5.2; }
  pdf.setFillColor(0, 0, 0); pdf.rect(R - 62, y - 1.4, 62, 8, "F"); pdf.setTextColor(255, 255, 255); font("bold", 9.6); T("Total", R - 60, y + 0.6); T("₹" + amt(total), R - 2, y + 0.6, "right"); ink(); y += 9;
  const endTotals = y;
  y = ty; k0 = top === ty ? ty : ty;
  font("bold", 8.4); T("Notes", L, y); y += 4.6; font("normal", 7.6);
  QUOTE_NOTES(b).forEach((n, i) => line(`${i + 1}. ${n}`, L, 3.7, 100));
  if (d.tech?.trim()) { y += 2; font("bold", 8.4); T("Technical data", L, y); y += 4.6; font("normal", 7.6); d.tech.split("\n").filter(Boolean).forEach((s, i) => line(`${i + 1}. ${s}`, L, 3.7, 100)); }
  y = Math.max(y, endTotals) + 8; void k0;

  /* contact and payment */
  room(36); rule(y); y += 4; font("bold", 8); T("PAYMENT INFORMATION", L, y); T(b.name.toUpperCase(), R, y, "right"); y += 5; font("normal", 7.8);
  const pay = [b.upi && `UPI: ${b.upi}`, b.upiNumber && `UPI Number: ${b.upiNumber}`, ...(b.bankName ? [`Bank: ${b.bankName}`, `A/C Name: ${b.accName ?? ""}`, `A/C: ${b.accNo ?? ""}`, `IFSC: ${b.ifsc ?? ""}`] : [b.bank])].filter(Boolean) as string[];
  pay.forEach((s, i) => T(s, L, y + i * 3.9));
  font("normal", 15, "DancingScript"); pdf.setTextColor(26, 63, 191); T(b.signName || "Ankit P", R, y - 1, "right"); ink(); font("normal", 6.4); T("Authorised Signatory", R, y + 7.4, "right");
  font("normal", 7.6); [b.phone, b.email, b.addressShort || b.address].forEach((s, i) => T(s, R, y + 12 + i * 3.8, "right"));

  /* terms and conditions: their own page(s) */
  pdf.addPage(); y = 18; font("bold", 10.5); T("Terms & Conditions", L, y); y += 8; font("normal", 7.8);
  QUOTE_TERMS.forEach((s, i) => { const parts = wrap(`${i + 1}. ${s.replace("Studio Nexify", b.name)}`, W); if (y + parts.length * 3.9 > BOTTOM) { pdf.addPage(); y = 18; } parts.forEach((p) => { T(p, L, y); y += 3.9; }); y += 1.8; });

  /* page numbers */
  const n = pdf.getNumberOfPages(); for (let i = 1; i <= n; i++) { pdf.setPage(i); font("normal", 6.8); ink(120); T(`${d.no} · page ${i} of ${n}`, R, 289, "right"); }
  return pdf.output("blob");
}
