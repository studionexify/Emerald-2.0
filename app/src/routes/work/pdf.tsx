/**
 * Invoice PDF, drawn as a real document: embedded Montserrat / Comfortaa / Dancing Script fonts, vector lines and
 * boxes, real text (selectable, searchable, editable in PDF tools) — the same layout as the on-screen A4 sheet.
 */
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { jsPDF as JsPDF } from "jspdf";
import { invTax, invoiceBiz, stateLabel, termsOf, type Party } from "../../data";
import type { Biz } from "../../data/biz";
import { amt, longDate, words, type DocData } from "./Doc";

const FONTS: [string, string, string][] = [
  ["Montserrat-Regular.ttf", "Montserrat", "normal"], ["Montserrat-Bold.ttf", "Montserrat", "bold"],
  ["Comfortaa-Regular.ttf", "Comfortaa", "normal"], ["Comfortaa-Bold.ttf", "Comfortaa", "bold"], ["DancingScript-SemiBold.ttf", "DancingScript", "normal"],
];
const cache = new Map<string, string>();
async function b64(url: string, image = false) {
  if (cache.has(url)) return cache.get(url)!;
  const r = await fetch(url); if (!r.ok) throw new Error(`Could not load ${url}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  let s = ""; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  let out = btoa(s);
  if (image) out = await onWhite("data:image/png;base64," + out);
  cache.set(url, out); return out;
}

/** PDF viewers show transparent PNG edges as a grey box; flatten the logo onto white first. */
function onWhite(src: string): Promise<string> {
  return new Promise((done) => {
    const im = new Image();
    im.onload = () => { const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0); done(c.toDataURL("image/jpeg", 0.95)); };
    im.onerror = () => done(src); im.src = src;
  });
}

/* Geometry measured from the studio's own invoices (mm on A4 210 × 297). */
const X = { l: 17.7, r: 192.2, lab: 37.3, mid: 108.0, val: 155.1 };
const COLS = [17.7, 37.3, 84.4, 108.0, 131.6, 155.1, 192.2]; // Sr | Description | HSN | Unit price | Qty | Total
const ROW = 4.9, BODY = 7.7, TERMS = 6.9, STEP = 3.3;
const OUTER = 183, INNER = 217, LW = 0.23;

function sheet(pdf: JsPDF, d: DocData, copy: string | undefined, logo: string) {
  const b: Biz = d.seller ?? invoiceBiz.value;
  const t = invTax({ id: "", kind: "invoice", no: d.no, date: d.date, customer: d.party, lines: d.lines, gstRate: d.gstRate, interstate: d.interstate, status: "issued", shipping: d.shipping });
  const credit = d.kind === "credit";
  const bill: Party = d.billTo ?? { name: d.party, address: d.address ?? "", contact: d.contact ?? "", gstin: d.gstin ?? "", email: "", state: "" };
  const ship: Party = d.shipToParty ?? bill;

  /* text placed by its top edge, like the measurements */
  const asc: Record<string, number> = { Montserrat: 0.75, Comfortaa: 0.86, DancingScript: 0.8 };
  let fam = "Montserrat", size = BODY;
  const font = (style: "normal" | "bold", pt = BODY, f = "Montserrat") => { fam = f; size = pt; pdf.setFont(f, style); pdf.setFontSize(pt); };
  const T = (s: string, x: number, top: number, align: "left" | "center" | "right" = "left") => pdf.text(s, x, top + size * 0.3528 * asc[fam], { align });
  const ink = () => pdf.setTextColor(0, 0, 0);
  const hl = (x1: number, x2: number, y: number, g = INNER) => { pdf.setDrawColor(g, g, g); pdf.setLineWidth(LW); pdf.line(x1, y, x2, y); };
  const vl = (x: number, y1: number, y2: number, g = INNER) => { pdf.setDrawColor(g, g, g); pdf.setLineWidth(LW); pdf.line(x, y1, x, y2); };
  const fill = (x: number, y: number, w: number, h: number, g: number) => { pdf.setFillColor(g, g, g); pdf.rect(x, y, w, h, "F"); };
  const wrap = (s: string, w: number) => pdf.splitTextToSize(s, w) as string[];
  const link = (w: string) => (w.startsWith("http") ? w : "https://" + w);
  const blue = () => pdf.setTextColor(17, 85, 204);

  if (d.cancelled || d.draft) { font("bold", 54); pdf.setTextColor(232, 232, 232); pdf.text(d.cancelled ? "CANCELLED" : "DRAFT", 105, 165, { align: "center", angle: 14 }); }

  /* Header */
  ink(); font("bold", 11.2); T(b.name.toUpperCase(), 18.5, 20.4);
  font("bold", BODY);
  T(b.address, 18.5, 26.2);
  T(`Mo: ${b.phone}  |  Email: ${b.email}`, 18.5, 31.1);
  let x = 18.5;
  if (b.website) {
    blue(); T(b.website, x, 36.0); const ww = pdf.getTextWidth(b.website);
    pdf.setDrawColor(17, 85, 204); pdf.setLineWidth(0.14); pdf.line(x, 38.3, x + ww, 38.3); pdf.link(x, 35.5, ww, 3.5, { url: link(b.website) });
    ink(); x += ww; T("  |  ", x, 36.0); x += pdf.getTextWidth("  |  ");
  }
  T(`GSTIN: ${b.gstin}`, x, 36.0);
  pdf.addImage(logo, logo.startsWith("data:image/jpeg") ? "JPEG" : "PNG", 156.6, 19.0, 35.5, 15.7);

  /* Title */
  if (copy) { font("bold", 6.2); T(copy.toUpperCase(), 191.4, 42.5, "right"); }
  font("bold", 12.9, "Comfortaa"); const title = credit ? "CREDIT NOTE" : "TAX INVOICE";
  T(title, 105, 46.8, "center"); const tw = pdf.getTextWidth(title);
  pdf.setDrawColor(0); pdf.setLineWidth(0.23); pdf.line(105 - tw / 2, 51.3, 105 + tw / 2, 51.3);

  /* Parties (left block) */
  let y = 59.3;
  const party = (label: string, p: Party) => {
    const y0 = y;
    fill(X.l, y, X.lab - X.l, ROW, 0);
    font("bold"); pdf.setTextColor(255, 255, 255); T(label, 18.5, y + 1.2); ink();
    T(wrap(p.name, X.mid - X.lab - 1.6)[0] ?? "", 38.1, y + 1.6);
    vl(X.lab, y, y + ROW); y += ROW; hl(X.l, X.mid, y);
    const st = p.state ? stateLabel(p.state) : "";
    const lines = p.address.split("\n").flatMap((s) => wrap(s, X.mid - X.l - 1.6));
    if (st && !p.address.toLowerCase().includes(p.state.toLowerCase())) lines.push(st);
    const ah = Math.max(3 * ROW, lines.length * STEP + 2.4);
    lines.forEach((s, k) => T(s, 18.5, y + 1.2 + k * STEP));
    y += ah; hl(X.l, X.mid, y);
    const kv = (k: string, v: string) => { font("normal"); T(k, 18.5, y + 1.2); font("bold"); T(v, 38.1, y + 1.6); vl(X.lab, y, y + ROW); y += ROW; hl(X.l, X.mid, y); };
    kv("Contact:", p.contact || "-"); kv("GST No.", p.gstin || "-");
    return y0;
  };
  const top = y; party("Bill to:", bill); party("Ship to:", ship);
  // darker outline round the parties block, as on the originals
  pdf.setDrawColor(OUTER); pdf.setLineWidth(LW); pdf.rect(X.l, top, X.mid - X.l, y - top);
  const partiesEnd = y;

  /* Invoice facts (right block) */
  const facts: [string, string][] = [[credit ? "Credit Note No.:" : "Invoice No.:", d.no], [credit ? "Date:" : "Invoice Date:", longDate(d.date)], ["Place of Supply:", d.pos || (d.interstate ? "Other state" : "Gujarat (24)")], ["Reverse Charges:", "No"]];
  if (credit && d.note) facts.push(["Against:", d.note.replace(/^Against ([^.]+).*$/, "$1")]);
  let my = 59.3; hl(X.mid, X.r, my);
  for (const [k, v] of facts) { font("normal"); T(k, 154.3, my + 1.2, "right"); font("bold"); T(v, 191.4, my + 1.2, "right"); my += ROW; hl(X.mid, X.r, my); }
  vl(X.val, 59.3, my); vl(X.r, 59.3, my);

  /* Items */
  y = Math.max(partiesEnd, my) + ROW;
  const head = () => {
    hl(X.l, X.r, y); font("bold");
    T("Sr. No.", (COLS[0] + COLS[1]) / 2, y + 1.2, "center"); T("Description", 38.1, y + 1.2); T("HSN / SAC", 85.2, y + 1.2);
    T("Unit Price", (COLS[3] + COLS[4]) / 2, y + 1.2, "center"); T("Qty", (COLS[4] + COLS[5]) / 2, y + 1.2, "center"); T("Total", (COLS[5] + COLS[6]) / 2, y + 1.2, "center");
    y += ROW; hl(X.l, X.r, y);
  };
  let tableTop = y; head();
  const rows = [...d.lines, ...Array.from({ length: Math.max(0, 5 - d.lines.length) }, () => null)];
  rows.forEach((l, i) => {
    font("normal");
    const desc = l ? wrap(l.desc, COLS[2] - COLS[1] - 1.6) : [];
    const h = Math.max(ROW, desc.length * STEP + 1.6);
    if (y + h > 250) { COLS.forEach((c) => vl(c, tableTop, y)); pdf.addPage(); y = 20; tableTop = y; head(); font("normal"); }
    if (l) {
      T(String(i + 1), (COLS[0] + COLS[1]) / 2, y + 1.2, "center");
      desc.forEach((s, k) => T(s, 38.1, y + 1.2 + k * STEP));
      T(l.hsn, 85.2, y + 1.2);
      T("₹" + amt(l.rate), (COLS[3] + COLS[4]) / 2, y + 1.2, "center");
      T(String(l.qty), (COLS[4] + COLS[5]) / 2, y + 1.2, "center");
      T(amt(l.qty * l.rate), (COLS[5] + COLS[6]) / 2, y + 1.2, "center");
    }
    y += h; hl(X.l, X.r, y);
  });
  COLS.forEach((c) => vl(c, tableTop, y));

  /* Totals (right) */
  if (y > 205) { pdf.addPage(); y = 20; }
  let ty = y + ROW; const vc = (X.val + X.r) / 2;
  hl(X.val, X.r, ty); const totTop = ty;
  const tot = (k: string, v: string, bold = false) => { font(bold ? "bold" : "normal"); T(k, 154.3, ty + 1.2, "right"); font("normal"); T(v, vc, ty + 1.2, "center"); ty += ROW; hl(X.val, X.r, ty); };
  tot("Sub total", amt(t.taxable), true);
  if (d.interstate) tot(`IGST (${d.gstRate}%)`, amt(t.igst));
  else { tot(`CGST (${d.gstRate / 2}%)`, amt(t.cgst)); tot(`SGST (${d.gstRate / 2}%)`, amt(t.sgst)); }
  if (t.shipping) tot("Shipping cost", amt(t.shipping));
  tot("Round-off", (t.roundOff < 0 ? "-" : "") + amt(t.roundOff), true);
  vl(X.val, totTop, ty); vl(X.r, totTop, ty + 2 * ROW);
  fill(131.6, ty, X.val - 131.6, 2 * ROW, 239); fill(X.val, ty, X.r - X.val, 2 * ROW, 0);
  pdf.setDrawColor(0); pdf.setLineWidth(LW); pdf.line(131.6, ty, X.val, ty); pdf.line(131.6, ty + 2 * ROW, X.val, ty + 2 * ROW); pdf.line(131.6, ty, 131.6, ty + 2 * ROW);
  font("bold"); ink(); T("Total", 143.4, ty + 3.8, "center");
  font("bold", 10.3); pdf.setTextColor(255, 255, 255); T("₹" + amt(t.total), vc, ty + 3.3, "center"); ink();
  ty += 2 * ROW;

  /* Terms (left), level with the totals as on the originals */
  let ly = totTop + 5.8;
  font("bold", TERMS); T(credit ? "NOTE" : "TERMS AND CONDITIONS", 18.5, ly); ly += 5.9;
  font("normal", TERMS);
  const items = credit && d.note ? [d.note] : termsOf(b).map((s, k) => `${k + 1}. ${s}`);
  for (const s of items) for (const line of wrap(s, 87)) { T(line, 18.5, ly); ly += 2.95; }

  /* Amount in words (left, under the terms) */
  ly = Math.max(ly + 1.5, ty - 3.2);
  font("normal", TERMS); const pre = "Amount in words: "; T(pre, 18.5, ly); const pw = pdf.getTextWidth(pre);
  font("bold", TERMS); wrap(`Indian Rupees ${words(t.total)} Only`, 110 - pw).forEach((s, k) => T(s, 18.5 + pw, ly + k * 2.95));

  /* Thank-you + footer */
  y = Math.max(ty, ly + 3) + 12;
  font("normal", 11.2, "Comfortaa"); const thanks = b.thanks || "Thank you for purchasing from us!";
  T(thanks, 18.5, y); pdf.setDrawColor(0); pdf.setLineWidth(0.2); pdf.line(18.5, y + 3.5, 18.5 + pdf.getTextWidth(thanks), y + 3.5);
  y += 8.4;
  font("bold"); T("PAYMENT INFORMATION", 18.5, y); T(b.name.toUpperCase(), 191.4, y, "right");
  font("normal");
  const left: [string, number][] = [];
  if (b.upi) left.push([`UPI: ${b.upi}`, 6.6]); if (b.upiNumber) left.push([`UPI Number: ${b.upiNumber}`, 9.9]);
  (b.bankName ? [`Bank: ${b.bankName}`, `A/C Name: ${b.accName ?? ""}`, `A/C: ${b.accNo ?? ""}`, `IFSC: ${b.ifsc ?? ""}`] : [b.bank]).forEach((s, k) => left.push([s, 16.6 + k * STEP]));
  left.forEach(([s, dy]) => T(s, 18.5, y + dy));
  /* signature, in the space under the company name */
  font("normal", 15, "DancingScript"); pdf.setTextColor(26, 63, 191); T(b.signName || "Ankit P", 191.4, y + 4.4, "right"); ink();
  font("normal", 6); T("Authorised Signatory", 191.4, y + 11.2, "right");
  font("normal");
  [b.phone, b.email, b.addressShort || b.address].forEach((s, k) => T(s, 191.5, y + 16.6 + k * STEP, "right"));
  if (b.website) {
    const wy = y + 16.6 + 3 * STEP; blue(); T(b.website, 191.5, wy, "right"); const ww = pdf.getTextWidth(b.website);
    pdf.setDrawColor(17, 85, 204); pdf.setLineWidth(0.14); pdf.line(191.5 - ww, wy + 2.3, 191.5, wy + 2.3); pdf.link(191.5 - ww, wy, ww, 3, { url: link(b.website) }); ink();
  }
}

/** Save one PDF, one A4 page per copy label (undefined = no copy label). Text is real text, not an image. */
export async function downloadInvoicePdf(d: DocData, copies: (string | undefined)[], filename: string) {
  const { jsPDF } = await import("jspdf");
  const base = import.meta.env.BASE_URL;
  const [fonts, logo] = await Promise.all([Promise.all(FONTS.map(([f]) => b64(`${base}fonts/${f}`))), b64(`${base}nexify-logo.png`, true)]);
  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  FONTS.forEach(([f, fam, style], i) => { pdf.addFileToVFS(f, fonts[i]); pdf.addFont(f, fam, style, undefined, "Identity-H"); });
  pdf.setProperties({ title: `${d.kind === "credit" ? "Credit Note" : "Tax Invoice"} ${d.no}`, subject: d.party, creator: "Emerald" });
  copies.forEach((c, i) => { if (i) pdf.addPage(); sheet(pdf, d, c, logo); });
  pdf.save(filename);
}

const A4_PX = 793.7; // 210 mm at 96 dpi
/** Shows an A4 page shrunk to fit the available width (phones, tablets, dialogs) — never cropped. */
export function FitA4({ children }: { children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1), [h, setH] = useState(0);
  useLayoutEffect(() => {
    const fit = () => { const w = box.current?.clientWidth ?? A4_PX; const s = Math.min(1, w / A4_PX); setK(s); setH((inner.current?.scrollHeight ?? 0) * s); };
    fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current); if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} class="w-full overflow-hidden" style={{ height: h || undefined }}>
    <div ref={inner} style={{ width: A4_PX, transform: `scale(${k})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}
