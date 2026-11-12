/**
 * Reads the studio's Excel invoice book (one sheet per invoice: "B-017", "B-016" …) on the device and fills in the
 * client details that older Emerald invoices are missing: bill-to and ship-to name, address, contact and GSTIN.
 * Numbers, dates, items and amounts are never changed. Loaded only when someone imports a workbook.
 */
import { unzipSync, strFromU8 } from "fflate";
import { invoicesSig, invTax, logFn, type InvLine, type Invoice, type Party } from "./ledger";
import { uid } from "./store";
import { rememberParty, sellerNow, stateLabel, stateOfGstin, STATES } from "./invoicing";

type Rows = string[][];

/** Minimal .xlsx reader: sheet name → rows of cell text. */
export function readXlsx(buf: ArrayBuffer): Map<string, Rows> {
  const z = unzipSync(new Uint8Array(buf));
  const xml = (p: string) => (z[p] ? new DOMParser().parseFromString(strFromU8(z[p]), "application/xml") : null);
  const shared = [...(xml("xl/sharedStrings.xml")?.getElementsByTagName("si") ?? [])].map((si) => [...si.getElementsByTagName("t")].map((t) => t.textContent ?? "").join(""));
  const rels = new Map([...(xml("xl/_rels/workbook.xml.rels")?.getElementsByTagName("Relationship") ?? [])].map((r) => [r.getAttribute("Id")!, r.getAttribute("Target")!]));
  const out = new Map<string, Rows>();
  for (const s of [...(xml("xl/workbook.xml")?.getElementsByTagName("sheet") ?? [])]) {
    const rid = s.getAttribute("r:id") ?? s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const target = rels.get(rid); if (!target) continue;
    const doc = xml(target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "")); if (!doc) continue;
    const rows: Rows = [];
    for (const c of [...doc.getElementsByTagName("c")]) {
      const ref = c.getAttribute("r") ?? ""; const m = /^([A-Z]+)(\d+)$/.exec(ref); if (!m) continue;
      const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1, row = Number(m[2]) - 1;
      const t = c.getAttribute("t"), v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      const text = t === "s" ? shared[Number(v)] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent).join("") : v;
      (rows[row] ??= [])[col] = text;
    }
    out.set(s.getAttribute("name") ?? "", rows.map((r) => r ?? []));
  }
  return out;
}

const clean = (v?: string) => { const s = (v ?? "").trim(); return s === "-" ? "" : /^\d+\.0$/.test(s) ? s.slice(0, -2) : s; };
const after = (row: string[], k: number) => { for (let i = k + 1; i < row.length; i++) if (clean(row[i])) return clean(row[i]); return ""; };
const LABELS = /^(invoice|place of supply|reverse|contact|gst no|ship to|bill to)/i;

/** Pull bill-to / ship-to parties out of one invoice sheet laid out like the studio's template. */
function partiesOf(rows: Rows): { bill?: Party; ship?: Party } {
  const find = (label: RegExp, from = 0) => { for (let r = from; r < rows.length; r++) { const k = (rows[r] ?? []).findIndex((c) => label.test((c ?? "").trim())); if (k >= 0) return { r, k }; } return null; };
  const block = (label: RegExp): Party | undefined => {
    const h = find(label); if (!h) return undefined;
    const name = after(rows[h.r], h.k).replace(/Invoice No\.:.*$/, "").trim();
    const addr: string[] = [];
    let r = h.r + 1;
    for (; r < rows.length; r++) { const first = clean((rows[r] ?? []).find((c) => clean(c)) ?? ""); if (!first) continue; if (LABELS.test(first)) break; addr.push(first); }
    const ct = find(/^contact/i, h.r + 1), gs = find(/^gst no/i, h.r + 1);
    const gstin = gs ? after(rows[gs.r], gs.k).toUpperCase() : "";
    const address = addr.join("\n");
    const state = (gstin && stateOfGstin(gstin)) || STATES.find(([n]) => new RegExp(`\\b${n}\\b`, "i").test(address))?.[0] || (/\b(GJ|Gujarat)\b/i.test(address) ? "Gujarat" : "");
    return { name, address, contact: ct ? after(rows[ct.r], ct.k) : "", email: "", gstin: /^\d{2}[A-Z]/.test(gstin) ? gstin : "", state };
  };
  return { bill: block(/^bill to:?$/i), ship: block(/^ship to:?$/i) };
}

/** Invoice date, items and the workbook's own total, from one sheet. */
function invoiceOf(rows: Rows): { date: string; lines: InvLine[]; total: number } {
  let date = "";
  for (const r of rows) { const k = (r ?? []).findIndex((c) => /^invoice date/i.test((c ?? "").trim())); if (k >= 0) { const v = after(r, k); const n = Number(v); date = n > 20000 ? new Date(Math.round((n - 25569) * 864e5)).toISOString().slice(0, 10) : v.slice(0, 10); break; } }
  const lines: InvLine[] = []; let total = 0;
  const h = rows.findIndex((r) => (r ?? []).some((c) => /^sr\.?\s*no/i.test((c ?? "").trim())));
  if (h >= 0) {
    const hdr = rows[h]; const col = (re: RegExp) => hdr.findIndex((c) => re.test((c ?? "").trim()));
    const cD = col(/^description/i), cH = col(/^hsn/i), cP = col(/^unit price/i), cQ = col(/^qty/i), cT = col(/^total/i);
    for (let r = h + 1; r < rows.length; r++) {
      const row = rows[r] ?? []; const first = clean(row.find((c) => clean(c)) ?? "");
      if (/^terms/i.test(first)) break;
      const desc = clean(row[cD]); const qty = Number(row[cQ]) || 0; const rate = Number(row[cP]) || 0; const tot = Number(row[cT]) || 0;
      if (!desc || !qty) continue;
      // Where the sheet's unit price and line total disagree, the line total is what was billed (e.g. B-015: 43,000 × 1).
      const unit = tot && Math.abs(rate * qty - tot) > 0.01 ? Math.round((tot / qty) * 100) / 100 : rate;
      lines.push({ desc, hsn: clean(row[cH]).replace(/\.0+$/, ""), qty, rate: unit });
    }
  }
  for (const r of rows) { const k = (r ?? []).findIndex((c) => (c ?? "").trim() === "Total"); if (k >= 0) { const v = Number(after(r, k)); if (v) total = v; } }
  return { date, lines, total };
}

export type BookResult = { created: string[]; filled: string[]; already: string[]; mismatch: string[]; totals: string[] };

/**
 * Bring the workbook into Emerald: invoices Emerald lacks are created (issued, unpaid, with their own date, items and
 * client details); invoices it has get any missing client details. Place of supply is the bill-to state with its code.
 */
export function applyBook(book: Map<string, Rows>): BookResult {
  const res: BookResult = { created: [], filled: [], already: [], mismatch: [], totals: [] };
  const key = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const sheets = new Map<string, Rows>();
  book.forEach((rows, name) => { const no = name.trim().toUpperCase(); if (/^[A-Z]-\d{3}$/.test(no)) sheets.set(no, rows); });
  const seen = new Set<string>();
  const seller = sellerNow(), home = seller.biz.state ?? "Gujarat";
  const shipOf = (b: Party, s?: Party) => { const sp = s && s.name ? s : b; return { sp, same: sp.name === b.name && sp.address === b.address }; };
  const next = invoicesSig.value.map((i): Invoice => {
    const rows = sheets.get(i.no.toUpperCase()); if (!rows) return i;
    const p = partiesOf(rows); if (!p.bill?.name) return i; seen.add(i.no.toUpperCase());
    const sameParty = key(i.customer) === key(p.bill.name) || (!!i.gstin && !!p.bill.gstin && key(i.gstin) === key(p.bill.gstin));
    if (!sameParty) { res.mismatch.push(`${i.no} (Emerald: ${i.customer}; Excel: ${p.bill.name})`); return i; }
    const b = p.bill, { sp: s, same } = shipOf(b, p.ship);
    const n: Invoice = {
      ...i,
      address: i.address?.trim() ? i.address : b.address || undefined,
      contact: i.contact?.trim() ? i.contact : b.contact || undefined,
      gstin: i.gstin?.trim() ? i.gstin : b.gstin || undefined,
      shipTo: i.shipTo?.trim() || same ? i.shipTo : [s.name, s.address].filter(Boolean).join("\n"),
      billTo: i.billTo ?? { ...b, name: i.customer || b.name, gstin: i.gstin || b.gstin },
      shipToParty: i.shipToParty ?? (same ? undefined : s), sameShip: i.billTo ? i.sameShip : same,
      pos: b.state ? stateLabel(b.state) : i.pos,
    };
    const changed = JSON.stringify(n) !== JSON.stringify(i);
    (changed ? res.filled : res.already).push(i.no);
    rememberParty(b); if (!same) rememberParty(s);
    return changed ? n : i;
  });
  const created: Invoice[] = [];
  sheets.forEach((rows, no) => {
    if (seen.has(no) || invoicesSig.value.some((i) => i.no.toUpperCase() === no)) return;
    const p = partiesOf(rows), inv = invoiceOf(rows);
    if (!p.bill?.name || !inv.lines.length || !inv.date) return; // blank template sheets are skipped
    const b = p.bill, { sp: s, same } = shipOf(b, p.ship);
    const state = b.state || home;
    const i: Invoice = {
      id: uid(), kind: "invoice", no, date: inv.date, customer: b.name, gstin: b.gstin || undefined, address: b.address || undefined, contact: b.contact || undefined,
      lines: inv.lines, gstRate: seller.biz.gstRate ?? 18, interstate: state !== home, status: "issued",
      billTo: { ...b, state }, shipToParty: same ? undefined : s, sameShip: same, shipTo: same ? undefined : [s.name, s.address].filter(Boolean).join("\n"),
      pos: stateLabel(state), seller,
    };
    const t = invTax(i).total;
    if (inv.total && Math.abs(t - inv.total) > 1) res.totals.push(`${no}: Excel ₹${inv.total}, Emerald ₹${t}`);
    created.push(i); res.created.push(no);
    rememberParty(i.billTo!); if (!same) rememberParty(s);
  });
  invoicesSig.value = [...next, ...created];
  res.created.sort();
  if (res.created.length) logFn("Imported invoices from Excel book", res.created.join(", "), "money");
  if (res.filled.length) logFn("Filled invoice details from Excel book", res.filled.join(", "), "money");
  return res;
}
