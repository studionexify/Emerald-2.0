/**
 * Bank statement reader: CSV / TSV / text, Excel (.xlsx) and text-based PDF. Finds the header row and columns by name,
 * understands Indian number formats ("1,25,000.00", "(500)", "500 Dr"), many date styles and debit/credit or signed amounts.
 * Loaded only when someone imports a statement.
 */
import { unzlibSync, strFromU8 } from "fflate";
import type { StmtRow } from "./ledger";

const MON = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const p2 = (n: number) => String(n).padStart(2, "0");
const yr = (y: number) => (y < 100 ? 2000 + y : y);

export function parseDate(raw: string): string {
  const t = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(t); if (m) return `${m[1]}-${p2(+m[2])}-${p2(+m[3])}`;
  m = /^(\d{1,2})[-/. ]([A-Za-z]{3})[a-z]*[-/. ,]*(\d{2,4})/.exec(t); if (m && MON.includes(m[2].toLowerCase())) return `${yr(+m[3])}-${p2(MON.indexOf(m[2].toLowerCase()) + 1)}-${p2(+m[1])}`;
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/.exec(t); if (m) return `${yr(+m[3])}-${p2(+m[2])}-${p2(+m[1])}`; // India: day first
  if (/^\d{5}(\.\d+)?$/.test(t) && +t > 30000 && +t < 70000) return new Date(Math.round((+t - 25569) * 864e5)).toISOString().slice(0, 10); // Excel serial
  return "";
}

/** "1,25,000.00", "₹ 500", "(500)", "500 Dr", "-500" → signed number; NaN when there is no number. */
export function parseAmount(raw: string | undefined): number {
  let t = (raw ?? "").trim(); if (!t || t === "-") return NaN;
  const neg = /^\(.*\)$/.test(t) || /(^-|dr\.?$)/i.test(t) || /^-/.test(t);
  const cr = /cr\.?$/i.test(t);
  t = t.replace(/[₹,\s()]|rs\.?|inr|dr\.?$|cr\.?$/gi, "").replace(/^-/, "");
  if (!/^\d*\.?\d+$/.test(t)) return NaN;
  const v = Number(t); return neg && !cr ? -v : v;
}

function splitDelimited(text: string): string[][] {
  const first = text.split(/\r?\n/, 5).join("\n");
  const delim = [",", "\t", ";", "|"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = []; let row: string[] = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cur.trim()); cur = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cur.trim()); if (row.some(Boolean)) rows.push(row); row = []; cur = ""; }
    else cur += c;
  }
  row.push(cur.trim()); if (row.some(Boolean)) rows.push(row);
  return rows;
}

const H = {
  date: /^(txn\.?|transaction|posting|post)?\s*date$|^date$/i, value: /value\s*date/i,
  text: /narration|description|particulars|details|remarks|transaction\s*remarks|memo/i,
  debit: /withdraw|debit|^dr\b|paid\s*out|money\s*out/i, credit: /deposit|credit|^cr\b|paid\s*in|money\s*in/i,
  amount: /^amount|txn\s*amount|transaction\s*amount/i, type: /dr\s*\/\s*cr|^type$|cr\s*\/\s*dr/i, balance: /balance/i,
};

export function rowsFromTable(raw: string[][]): StmtRow[] {
  const table = Array.from(raw, (r) => Array.from(r ?? [], (c) => String(c ?? ""))); // Excel rows can have holes and non-text cells
  if (!table.length) return [];
  let h = table.findIndex((r) => r.some((c) => H.date.test(c.trim()) || H.value.test(c)) && r.some((c) => H.text.test(c)));
  if (h < 0) h = table.findIndex((r) => r.some((c) => /date/i.test(c)) && r.some((c) => H.debit.test(c) || H.credit.test(c) || H.amount.test(c)));
  const hdr = h >= 0 ? table[h] : [];
  const col = (re: RegExp, not?: RegExp) => hdr.findIndex((c) => re.test((c ?? "").trim()) && !(not && not.test(c)));
  let date = col(H.date, H.value); if (date < 0) date = col(/date/i);
  let text = col(H.text); const debit = col(H.debit, H.type), credit = col(H.credit, H.type), amount = col(H.amount), type = col(H.type), bal = col(H.balance);
  const body = table.slice(h + 1);
  // No usable header: guess date = first column that holds dates, text = longest text column, amounts = numeric columns after it.
  if (h < 0 || date < 0) {
    const sample = body.length ? body : table, ncol = Math.max(...sample.map((r) => r.length));
    date = [...Array(ncol).keys()].find((c) => sample.filter((r) => parseDate(r[c] ?? "")).length > sample.length / 2) ?? -1;
    if (date < 0) return [];
    text = [...Array(ncol).keys()].filter((c) => c !== date).sort((a, b) => sample.reduce((s, r) => s + (r[b]?.length ?? 0), 0) - sample.reduce((s, r) => s + (r[a]?.length ?? 0), 0))[0];
  }
  const nums = [...Array(Math.max(...table.map((r) => r.length))).keys()].filter((c) => c !== date && c !== text && body.some((r) => !isNaN(parseAmount(r[c]))));
  const out: StmtRow[] = [];
  for (const r of h >= 0 && date >= 0 ? body : table) {
    const d = parseDate(r[date] ?? ""); if (!d) { if (out.length && r[text] && !r.some((c, k) => k !== text && c)) out[out.length - 1].text += " " + r[text]; continue; } // wrapped narration
    let a = NaN;
    if (debit >= 0 || credit >= 0) { const dr = parseAmount(r[debit]), cr = parseAmount(r[credit]); a = (isNaN(cr) ? 0 : Math.abs(cr)) - (isNaN(dr) ? 0 : Math.abs(dr)); if (isNaN(dr) && isNaN(cr)) a = NaN; }
    else if (amount >= 0) { a = parseAmount(r[amount]); const ty = (r[type] ?? "").toLowerCase(); if (!isNaN(a) && type >= 0) a = /dr|debit|w/.test(ty) ? -Math.abs(a) : /cr|credit|d/.test(ty) ? Math.abs(a) : a; }
    else { const ns = nums.filter((c) => c !== bal); const v = ns.map((c) => parseAmount(r[c])).filter((x) => !isNaN(x)); a = ns.length >= 2 ? (v[1] ?? 0) - (v[0] ?? 0) : v[0] ?? NaN; }
    if (isNaN(a) || a === 0) continue;
    const b = bal >= 0 ? parseAmount(r[bal]) : NaN;
    out.push({ date: d, text: (r[text] ?? "").replace(/\s+/g, " ").trim() || "Statement line", amount: Math.round(a * 100) / 100, balance: isNaN(b) ? undefined : b });
  }
  return out;
}

function ascii85(b: Uint8Array): Uint8Array {
  const t = strFromU8(b).replace(/\s/g, "").replace(/^<~/, ""), end = t.indexOf("~>"), src = end >= 0 ? t.slice(0, end) : t, out: number[] = [];
  let g: number[] = [];
  const flush = (n: number) => { const pad = 5 - n; while (g.length < 5) g.push(84); let v = 0; for (const x of g) v = v * 85 + x; const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; out.push(...bytes.slice(0, 4 - pad)); g = []; };
  for (const ch of src) { if (ch === "z" && !g.length) { out.push(0, 0, 0, 0); continue; } g.push(ch.charCodeAt(0) - 33); if (g.length === 5) flush(5); }
  if (g.length) flush(g.length);
  return Uint8Array.from(out);
}
/** Text items of a PDF with their positions, grouped into table rows. Works for text PDFs (most net-banking downloads); scanned or font-encoded PDFs are refused with a clear message. */
function pdfTable(buf: Uint8Array): string[][] {
  const bin = new TextDecoder("latin1").decode(buf);
  const items: { x: number; y: number; t: string; pg: number }[] = []; let pg = 0;
  for (const m of bin.matchAll(/stream\r?\n/g)) {
    const start = m.index! + m[0].length, end = bin.indexOf("endstream", start); if (end < 0) continue;
    let raw: Uint8Array = buf.slice(start, end); if (/ASCII85Decode/.test(bin.slice(Math.max(0, start - 300), start))) { try { raw = ascii85(raw); } catch {} }
    let data: Uint8Array; try { data = unzlibSync(raw); } catch { data = raw; } // compressed, else plain
    const c = strFromU8(data, true); if (!/BT/.test(c)) continue; pg++;
    for (const bt of c.matchAll(/BT([\s\S]*?)ET/g)) {
      let x = 0, y = 0;
      for (const tok of bt[1].matchAll(/(-?[\d.]+)\s+(-?[\d.]+)\s+Td|(?:-?[\d.]+\s+){4}(-?[\d.]+)\s+(-?[\d.]+)\s+Tm|\[((?:[^\]\\]|\\.)*)\]\s*TJ|\(((?:[^)\\]|\\.)*)\)\s*Tj/g)) {
        if (tok[1] !== undefined) { x += +tok[1]; y += +tok[2]; }
        else if (tok[3] !== undefined) { x = +tok[3]; y = +tok[4]; }
        else { const raw = tok[5] ?? tok[6] ?? ""; const t = tok[5] !== undefined ? [...raw.matchAll(/\(((?:[^)\\]|\\.)*)\)/g)].map((q) => q[1]).join("") : raw; const s = t.replace(/\\([()\\])/g, "$1").trim(); if (s) items.push({ x, y, t: s, pg }); }
      }
    }
  }
  const rows = new Map<string, typeof items>();
  for (const it of items) { const k = `${it.pg}:${Math.round(it.y / 3)}`; (rows.get(k) ?? rows.set(k, []).get(k)!).push(it); }
  const lines = [...rows.entries()].sort((a, b) => { const [pa, ya] = a[0].split(":").map(Number), [pb, yb] = b[0].split(":").map(Number); return pa - pb || yb - ya; }).map(([, r]) => r.sort((a, b) => a.x - b.x));
  // Put each text into the column of the header it sits under (nearest centre), so empty debit/credit cells stay empty.
  const hi = lines.findIndex((r) => r.some((c) => H.date.test(c.t)) && r.some((c) => H.text.test(c.t)));
  if (hi < 0) return lines.map((r) => r.map((c) => c.t));
  const centre = (c: { x: number; t: string }) => c.x + c.t.length * 2.6, hc = lines[hi].map(centre);
  const out: string[][] = [lines[hi].map((c) => c.t)];
  for (const r of lines.slice(hi + 1)) { const row: string[] = hc.map(() => ""); for (const c of r) { let k = 0; hc.forEach((h, n) => { if (Math.abs(h - centre(c)) < Math.abs(hc[k] - centre(c))) k = n; }); row[k] = (row[k] ? row[k] + " " : "") + c.t; } out.push(row); }
  return out;
}

export async function readStatement(file: File): Promise<{ rows: StmtRow[]; note?: string }> {
  const name = file.name.toLowerCase();
  let table: string[][] = [];
  if (/\.xlsx$|\.xlsm$/.test(name)) {
    const { readXlsx } = await import("./xlsx-book");
    const sheets = [...readXlsx(await file.arrayBuffer()).values()];
    const best = sheets.map((t) => ({ t, r: rowsFromTable(t) })).sort((a, b) => b.r.length - a.r.length)[0];
    return { rows: best?.r ?? [] };
  }
  if (/\.xls$/.test(name)) return { rows: [], note: "Old .xls files can't be read here — open it in Excel and Save As .xlsx or .csv, then upload that." };
  if (/\.pdf$/.test(name) || file.type === "application/pdf") {
    table = pdfTable(new Uint8Array(await file.arrayBuffer()));
    const rows = rowsFromTable(table);
    return rows.length ? { rows } : { rows: [], note: "No transaction table could be read from this PDF (it may be scanned, or password-protected). Download the CSV or Excel statement from net banking instead." };
  }
  if (/\.(png|jpe?g|heic)$/.test(name)) return { rows: [], note: "Photos of statements can't be read. Use the CSV, Excel or PDF from net banking." };
  return { rows: rowsFromTable(splitDelimited((await file.text()).replace(/^﻿/, ""))) };
}
