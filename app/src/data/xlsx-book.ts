/**
 * Reads the studio's Excel invoice book (one sheet per invoice: "B-017", "B-016" …) on the device and fills in the
 * client details that older Emerald invoices are missing: bill-to and ship-to name, address, contact and GSTIN.
 * Numbers, dates, items and amounts are never changed. Loaded only when someone imports a workbook.
 */
import { unzipSync, strFromU8 } from "fflate";
import { invoicesSig, logFn, type Invoice, type Party } from "./ledger";
import { rememberParty, stateOfGstin, STATES } from "./invoicing";

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

export type BookResult = { filled: string[]; already: string[]; notInEmerald: string[]; mismatch: string[] };

/** Fill missing details on matching invoices. Only empty fields are filled; nothing that is already there changes. */
export function applyBook(book: Map<string, Rows>): BookResult {
  const res: BookResult = { filled: [], already: [], notInEmerald: [], mismatch: [] };
  const key = (s?: string) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const byNo = new Map<string, { bill?: Party; ship?: Party }>();
  book.forEach((rows, name) => { const no = name.trim().toUpperCase(); if (/^[A-Z]-\d{3}$/.test(no)) byNo.set(no, partiesOf(rows)); });
  const seen = new Set<string>();
  invoicesSig.value = invoicesSig.value.map((i): Invoice => {
    const p = byNo.get(i.no.toUpperCase()); if (!p?.bill?.name) return i; seen.add(i.no.toUpperCase());
    // Same number must also be the same customer (name or GSTIN) — never copy one client's address onto another's invoice.
    const sameParty = key(i.customer) === key(p.bill.name) || (!!i.gstin && !!p.bill.gstin && key(i.gstin) === key(p.bill.gstin));
    if (!sameParty) { res.mismatch.push(`${i.no} (Emerald: ${i.customer}; Excel: ${p.bill.name})`); return i; }
    const b = p.bill, s = p.ship && p.ship.name ? p.ship : b;
    const same = s.name === b.name && s.address === b.address;
    const next: Invoice = {
      ...i,
      address: i.address?.trim() ? i.address : b.address || undefined,
      contact: i.contact?.trim() ? i.contact : b.contact || undefined,
      gstin: i.gstin?.trim() ? i.gstin : b.gstin || undefined,
      shipTo: i.shipTo?.trim() || same ? i.shipTo : [s.name, s.address].filter(Boolean).join("\n"),
      billTo: i.billTo ?? { ...b, name: i.customer || b.name, gstin: i.gstin || b.gstin },
      shipToParty: i.shipToParty ?? (same ? undefined : s), sameShip: i.billTo ? i.sameShip : same,
    };
    const changed = JSON.stringify(next) !== JSON.stringify(i);
    (changed ? res.filled : res.already).push(i.no);
    rememberParty(b); if (!same) rememberParty(s);
    return changed ? next : i;
  });
  byNo.forEach((_, no) => { if (!seen.has(no)) res.notInEmerald.push(no); });
  if (res.filled.length) logFn("Filled invoice details from Excel book", res.filled.join(", "), "money");
  return res;
}
