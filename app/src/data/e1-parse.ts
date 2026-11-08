/** Parse the Emerald 1 live-data export (markdown, one "## table (N rows)" section per table) into plain rows. Pure: no stores. */
export type Row = Record<string, any>;
export type Tables = Record<string, Row[]>;

function cells(line: string): string[] {
  const out: string[] = []; let cur = "";
  const s = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") { cur += "|"; i++; continue; }
    if (s[i] === "|") { out.push(cur.trim()); cur = ""; continue; }
    cur += s[i];
  }
  out.push(cur.trim());
  return out;
}

/** Merge any number of export files (the single full export, the parts, or both — identical rows are kept once). Continued sections append; the first table in each section is its data. */
export function parseExport(texts: string[], into: Tables = {}): Tables {
  const seen = new Map<string, Set<string>>();
  const add = (t: string, r: Row) => { const s = seen.get(t) ?? seen.set(t, new Set(into[t].map((x) => JSON.stringify(x)))).get(t)!; const k = JSON.stringify(r); if (!s.has(k)) { s.add(k); into[t].push(r); } };
  for (const text of texts) {
    const lines = text.split(/\r?\n/);
    let table: string | null = null, head: string[] | null = null, jsonl = false;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = /^## ([a-z0-9_.]+) \(\d+ rows\)/.exec(l);
      if (m) { table = m[1]; head = null; jsonl = false; into[table] ??= []; continue; }
      if (/^## /.test(l)) { table = null; continue; }
      if (!table) continue;
      if (/^```jsonl/.test(l)) { jsonl = true; continue; }
      if (jsonl) { if (l.startsWith("```")) { jsonl = false; continue; } try { add(table, JSON.parse(l)); } catch {} continue; }
      if (!l.startsWith("|")) continue;
      if (!head) { if (/^\|\s*-/.test(lines[i + 1] ?? "")) { head = cells(l); i++; } continue; }
      const c = cells(l);
      if (c.length !== head.length) continue;
      const r: Row = {};
      head.forEach((h, k) => (r[h] = c[k] === "NULL" ? null : c[k]));
      add(table, r);
    }
  }
  return into;
}
