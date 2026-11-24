/** The quotation as a real PDF (selectable text, A4): page 1 pricing, page 2 terms & conditions. Pictures and print details are internal and never printed here. */
import type { jsPDF as JsPDF } from "jspdf";
import { invTax } from "../../data";
import { invoiceBiz } from "../../data/invoicing";
import { amt, longDate, QUOTE_NOTES, QUOTE_TERMS, words, type DocData } from "./Doc";
import { b64, FONTS } from "./pdf";

const L = 14, R = 196, W = R - L, BOTTOM = 266;
const INK: [number, number, number] = [23, 25, 28], GREY: [number, number, number] = [110, 116, 124], LINE: [number, number, number] = [214, 217, 221];

export async function quotePdf(d: DocData): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const base = import.meta.env.BASE_URL, b = d.seller ?? invoiceBiz.value;
  const [fonts, logo] = await Promise.all([Promise.all(FONTS.map(([f]) => b64(`${base}fonts/${f}`))), b64(`${base}nexify-logo.png`, true)]);
  const pdf: JsPDF = new jsPDF({ unit: "mm", format: "a4", compress: true });
  FONTS.forEach(([f, fam, style], i) => { pdf.addFileToVFS(f, fonts[i]); pdf.addFont(f, fam, style, undefined, "Identity-H"); });
  pdf.setProperties({ title: `Quotation ${d.no}`, subject: d.party, creator: "Emerald" });
  const t = invTax({ id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued" });
  const LH = 300 / 573;

  let y = 0;
  const font = (style: "normal" | "bold", pt = 8, fam = "Montserrat") => { pdf.setFont(fam, style); pdf.setFontSize(pt); };
  const T = (s: string, x: number, top: number, align: "left" | "center" | "right" = "left", angle?: number) => pdf.text(s, x, top, { align, baseline: "top", ...(angle ? { angle } : {}) });
  const wrap = (s: string, w: number) => pdf.splitTextToSize(s, w) as string[];
  const ink = (c: [number, number, number] = INK) => pdf.setTextColor(c[0], c[1], c[2]);
  const rule = (yy: number, x1 = L, x2 = R, c = LINE) => { pdf.setDrawColor(c[0], c[1], c[2]); pdf.setLineWidth(0.25); pdf.line(x1, yy, x2, yy); };
  const heading = (s: string) => { font("bold", 7.8); ink(); T(s.toUpperCase(), L, y); const w = pdf.getTextWidth(s.toUpperCase()) + 4; rule(y + 1.4, L + w, R); y += 6; };
  const band = () => { pdf.setFillColor(...INK); pdf.rect(0, 0, 210, 5, "F"); pdf.setFillColor(143, 194, 158); pdf.rect(L, 5, 34, 1.2, "F"); };
  const room = (h: number) => { if (y + h > BOTTOM) { pdf.addPage(); band(); y = 16; return true; } return false; };

  /* ───────── page 1 header ───────── */
  band();
  pdf.addImage(logo, "PNG", L, 11, 38, 38 * LH);
  font("bold", 22, "Comfortaa"); ink(); T("QUOTATION", R, 11, "right");
  font("bold", 10); T(d.no, R, 22, "right");
  const days = d.valid ? Math.max(0, Math.round((+new Date(d.valid) - +new Date(d.date)) / 86400000)) : 0;
  if (days) { const txt = `VALID FOR ${days} DAYS`; font("bold", 6.8); const w = pdf.getTextWidth(txt) + 7; pdf.setFillColor(232, 243, 236); pdf.roundedRect(R - w, 26, w, 5.6, 2.8, 2.8, "F"); pdf.setTextColor(42, 107, 67); T(txt, R - w / 2, 27.5, "center"); ink(); }
  y = 11 + 38 * LH + 5;
  font("bold", 9.6); T(b.name.toUpperCase(), L, y); y += 5; font("normal", 7.3); ink(GREY);
  for (const s of [b.address, `${b.phone}  ·  ${b.email}`, [b.website, b.gstin ? `GSTIN ${b.gstin}` : ""].filter(Boolean).join("  ·  ")].filter(Boolean)) { T(s, L, y); y += 3.7; }
  y += 5;

  /* client + dates */
  const addr = wrap(d.address ?? "", 100).slice(0, 4), boxH = Math.max(20, 13 + addr.length * 3.7 + 4);
  pdf.setDrawColor(...LINE); pdf.setLineWidth(0.25); pdf.roundedRect(L, y, W, boxH, 2, 2, "S"); pdf.line(R - 62, y, R - 62, y + boxH);
  font("bold", 6.2); ink(GREY); T("QUOTATION FOR", L + 4, y + 3.4);
  font("bold", 9.6); ink(); T(d.party || "—", L + 4, y + 7.6);
  font("normal", 7.4); ink(GREY); addr.forEach((s, i) => T(s, L + 4, y + 12.8 + i * 3.7));
  font("bold", 6.2); T("DATE", R - 31, y + 3.4, "right"); T("VALID UNTIL", R - 4, y + 3.4, "right");
  font("bold", 8.6); ink(); T(longDate(d.date), R - 31, y + 7.6, "right"); T(longDate(d.valid ?? ""), R - 4, y + 7.6, "right");
  y += boxH + 6;

  /* ───────── pricing table ───────── */
  heading("Scope & pricing");
  const C = { sr: L + 2, desc: L + 11, qty: R - 74, rate: R - 50, gst: R - 31, amt: R - 2 };
  const head = () => {
    pdf.setFillColor(...INK); pdf.rect(L, y, W, 6.6, "F"); pdf.setTextColor(255, 255, 255); font("bold", 6.8);
    T("#", C.sr, y + 2.1); T("DESCRIPTION", C.desc, y + 2.1); T("QTY", C.qty, y + 2.1, "right"); T("RATE (₹)", C.rate, y + 2.1, "right"); T("GST", C.gst, y + 2.1, "right"); T("AMOUNT (₹)", C.amt, y + 2.1, "right"); ink(); y += 6.6;
  };
  head();
  d.lines.forEach((l, i) => {
    const [name, ...rest] = (l.desc || "—").split(" · "), sub = rest.join(" · ");
    font("bold", 8.6); const nm = wrap(name, C.qty - C.desc - 14); const sb = sub ? (font("normal", 7), wrap(sub, C.qty - C.desc - 14)) : [];
    const h = Math.max(9, nm.length * 4.2 + sb.length * 3.4 + 4.4);
    if (room(h + 2)) head();
    if (i % 2) { pdf.setFillColor(250, 251, 251); pdf.rect(L, y, W, h, "F"); }
    ink(); font("normal", 8.4); T(String(i + 1), C.sr, y + 2.4);
    font("bold", 8.6); nm.forEach((s, k) => T(s, C.desc, y + 2.4 + k * 4.2));
    font("normal", 7); ink(GREY); sb.forEach((s, k) => T(s, C.desc, y + 2.4 + nm.length * 4.2 + k * 3.4));
    ink(); font("normal", 8.4); const v = l.qty * l.rate;
    T(String(l.qty), C.qty, y + 2.4, "right"); T(amt(l.rate), C.rate, y + 2.4, "right"); T(`${d.gstRate}%`, C.gst, y + 2.4, "right"); T(amt(v), C.amt, y + 2.4, "right");
    y += h; rule(y, L, R, [227, 230, 233]);
  });
  y += 7;

  /* totals */
  room(46);
  const tx = R - 66;
  font("normal", 8.6); ink();
  const row = (k: string, v: string) => { T(k, tx + 2, y); T(v, R, y, "right"); y += 5.6; };
  row("Sub-total", "₹ " + amt(t.taxable));
  if (t.igst) row(`IGST ${d.gstRate}%`, "₹ " + amt(t.igst)); else { row(`CGST ${d.gstRate / 2}%`, "₹ " + amt(t.cgst)); row(`SGST ${d.gstRate / 2}%`, "₹ " + amt(t.sgst)); }
  if (t.roundOff !== 0) row("Round-off", (t.roundOff < 0 ? "-" : "") + "₹ " + amt(t.roundOff));
  rule(y - 1, tx, R, INK); pdf.setLineWidth(0.5); pdf.line(tx, y - 1, R, y - 1);
  y += 1.5; font("bold", 11); T("Total", tx + 2, y); T("₹ " + amt(t.total), R, y, "right"); y += 7;
  font("normal", 7); ink(GREY); T(`Rupees ${words(t.total)} only`, R, y, "right"); y += 9;

  /* bank details: their own box */
  room(36);
  const bank: [string, string][] = [["BANK DETAILS", b.bankName || b.bank || ""], ["ACCOUNT NAME", b.accName || b.name], ["ACCOUNT NO.", b.accNo || ""], ["IFSC", b.ifsc || ""], ["UPI", b.upi || ""]].filter(([, v]) => v) as [string, string][];
  if (bank.length) {
    pdf.setDrawColor(...LINE); pdf.roundedRect(L, y, W, 13, 2, 2, "S");
    const gap = (W - 8) / bank.length;
    bank.forEach(([k, v], i) => { font("bold", 6.2); ink(GREY); T(k, L + 4 + i * gap, y + 3); font("bold", 8); ink(); T(v, L + 4 + i * gap, y + 7.2); });
    y += 13 + 6;
  }

  /* payment terms & notes */
  room(34);
  heading("Payment terms & notes");
  const notes = ["3D-printed products: 100% advance before production. Services: 50% to start, 50% before delivery.", ...QUOTE_NOTES(b), ...(d.tech?.trim() ? d.tech.split("\n").map((x) => x.trim()).filter(Boolean) : []), "Full terms & conditions are on page 2."];
  font("normal", 7.4); ink([68, 72, 78]);
  notes.forEach((n, i) => { const parts = wrap(`${i + 1}. ${n}`, W - 4); room(parts.length * 3.7 + 1); parts.forEach((s, k) => { T(s, L + (k ? 3.4 : 0), y); y += 3.7; }); y += 0.9; });

  /* acceptance + signature */
  room(30); y += 4;
  font("normal", 7.4); ink(GREY); wrap("To accept, reply “Approved” on WhatsApp or e-mail, or sign and return this quotation.", 100).forEach((s, k) => T(s, L, y + 8 + k * 3.7));
  const sx = R - 62; pdf.setDrawColor(...INK); pdf.setLineWidth(0.25); pdf.line(sx, y + 14, R, y + 14);
  font("normal", 21, "DancingScript"); pdf.setTextColor(27, 42, 92); T(b.signName || "Ankit P", sx + 31, y + 4.2, "center", 2);
  font("normal", 7.2); ink(); T(`Authorised signatory · ${b.name}`, sx + 31, y + 15.6, "center");

  /* ───────── page 2: terms & conditions ───────── */
  pdf.addPage(); band(); pdf.addImage(logo, "PNG", L, 11, 30, 30 * LH);
  font("bold", 9); ink(); T(`QUOTATION ${d.no}`, R, 13, "right"); font("normal", 7.4); ink(GREY); T(`${b.name} · Terms & conditions`, R, 18, "right");
  y = 11 + 30 * LH + 9; heading("Terms & conditions");
  QUOTE_TERMS.forEach((s, i) => {
    const m = /^([^:]{3,45}):\s(.*)$/.exec(s.replace("Studio Nexify", b.name)), title = m && !s.startsWith("Payments can") ? m[1] : "", body = m && title ? m[2] : s.replace("Studio Nexify", b.name);
    font("normal", 7.9); const parts = wrap(body, W - 6); room(parts.length * 3.9 + (title ? 4.4 : 0) + 3);
    font("bold", 7.9); ink(); if (title) { T(`${i + 1}.`, L, y); T(title, L + 6, y); y += 4.4; } else T(`${i + 1}.`, L, y);
    font("normal", 7.9); ink([51, 55, 60]); parts.forEach((p) => { T(p, L + 6, y); y += 3.9; }); y += 2.6;
  });
  room(24); y += 8; font("normal", 7.4); ink(GREY); T("Accepted by client (name, signature & date)", L, y + 8);
  pdf.setDrawColor(...INK); pdf.line(R - 62, y + 6, R, y + 6); font("normal", 7.2); ink(); T("Client signature", R - 31, y + 7.6, "center");

  /* footer and page numbers on every page */
  const n = pdf.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i); rule(285, L, R); font("normal", 6.8); ink(GREY);
    T(`${b.name} · ${b.website ?? ""}`, L, 287); T("Thank you for considering us.", 105, 287, "center"); T(`Page ${i} of ${n}`, R, 287, "right");
  }
  return pdf.output("blob");
}
