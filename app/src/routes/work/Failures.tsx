/** Failure report: every run with failed pieces, grouped by reason, machine, spool and design. Read only. */
import { useState } from "preact/hooks";
import { Section } from "../../ui";
import { batchesSig, shortDate, type Batch } from "../../data";
import { spoolsSig } from "../../data/inventory";
import { WorkShell } from "./shared";

const RANGES = [["7", "7 days"], ["30", "30 days"], ["90", "90 days"], ["", "All time"]] as const;
const NO_REASON = "No reason given";
const spoolText = (id: string, b: Batch, j: number) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? `${s.material} · ${s.colour} · #${s.slot ?? s.spoolNo}` : b.spool?.split(" + ")[j] ?? "Removed spool"; };

type Row = { key: string; runs: number; pcs: number; failed: number };
function group(runs: Batch[], keys: (b: Batch) => string[]) {
  const m = new Map<string, Row>();
  for (const b of runs) for (const key of keys(b)) { const r = m.get(key) ?? { key, runs: 0, pcs: 0, failed: 0 }; r.runs++; r.pcs += b.units; r.failed += b.failed ?? 0; m.set(key, r); }
  return [...m.values()].sort((a, b) => b.failed - a.failed || b.pcs - a.pcs);
}

function Table({ title, rows, label, total }: { title: string; rows: Row[]; label: string; total: number }) {
  const shown = rows.filter((r) => r.failed > 0);
  return <Section title={title} note={String(shown.length)}>
    {!shown.length ? <p class="t-meta px-1">No failures.</p> : <div class="overflow-x-auto"><table class="w-full border-collapse text-[13px] num">
      <thead><tr class="border-b border-line text-[11px] text-c2 uppercase"><th class="text-left px-2 py-2">{label}</th><th class="px-2">Failed pcs</th><th class="px-2">Share</th><th class="px-2">Printed pcs</th><th class="px-2">Failure rate</th><th class="px-2">Runs</th></tr></thead>
      <tbody>{shown.map((r) => { const rate = r.pcs ? Math.round((r.failed / r.pcs) * 1000) / 10 : 0, share = total ? Math.round((r.failed / total) * 100) : 0; return <tr key={r.key} class="border-b border-line">
        <td class="px-2 py-2 font-sans font-medium">{r.key}</td>
        <td class="px-2 text-center text-red font-semibold">{r.failed}</td>
        <td class="px-2"><div class="flex items-center gap-2"><div class="h-2 flex-1 min-w-[60px] rounded bg-c1 overflow-hidden"><div class="h-full bg-red" style={{ width: `${share}%` }} /></div><span class="w-9 text-right">{share}%</span></div></td>
        <td class="px-2 text-center">{r.pcs}</td>
        <td class={`px-2 text-center font-semibold ${rate >= 10 ? "text-red" : ""}`}>{rate}%</td>
        <td class="px-2 text-center">{r.runs}</td></tr>; })}</tbody></table></div>}
  </Section>;
}

export default function Failures() {
  const [days, setDays] = useState<string>("30");
  const since = days ? new Date(Date.now() - Number(days) * 864e5).toISOString() : "";
  const runs = batchesSig.value.filter((b) => !b.running && (b.endAt ?? b.at ?? "") >= since);
  const bad = runs.filter((b) => (b.failed ?? 0) > 0);
  const failed = bad.reduce((a, b) => a + (b.failed ?? 0), 0), pcs = runs.reduce((a, b) => a + b.units, 0);
  const kpi = (l: string, v: string | number, c = "") => <div><div class="text-[11px] text-c2">{l}</div><div class={`num text-[22px] font-semibold leading-tight ${c}`}>{v}</div></div>;
  return <WorkShell title="Failure report" sub="Failed pieces by reason, machine, spool and design, from Complete print">
    <div class="flex flex-wrap items-center gap-1.5 mb-4">{RANGES.map(([v, l]) => <button key={l} type="button" onClick={() => setDays(v)} class={`h-8 px-3 !min-h-0 rounded-full text-[12px] font-semibold cursor-pointer border ${days === v ? "bg-c4 text-c0 border-c4" : "border-line text-c3"}`}>{l}</button>)}</div>
    <div class="flex flex-wrap gap-x-9 gap-y-3 mb-5">{kpi("Printed pcs", pcs)}{kpi("Failed pcs", failed, failed ? "text-red" : "")}{kpi("Failure rate", `${pcs ? Math.round((failed / pcs) * 1000) / 10 : 0}%`)}{kpi("Runs with failures", `${bad.length}/${runs.length}`)}</div>
    <Table title="By reason" label="Reason" total={failed} rows={group(runs, (b) => [b.reason?.trim() || NO_REASON])} />
    <Table title="By machine" label="Machine" total={failed} rows={group(runs, (b) => (b.printer ? b.printer.split(" + ") : ["No machine"]))} />
    <Table title="By spool" label="Spool" total={failed} rows={group(runs, (b) => (b.spoolIds?.length ? b.spoolIds.map((id, j) => spoolText(id, b, j)) : ["No spool logged"]))} />
    <Table title="By design" label="Order · design" total={failed} rows={group(runs, (b) => [`${b.orderNo} · ${b.name}`])} />
    <Section title="Failed runs" note={String(bad.length)}>
      {!bad.length ? <p class="t-meta px-1">No failed runs in this period.</p> : <div class="grid gap-1.5">{[...bad].sort((a, b) => (b.endAt ?? b.at ?? "").localeCompare(a.endAt ?? a.at ?? "")).map((b) =>
        <div key={b.id} class="rounded-lg border border-line px-3 py-2 text-[13px] flex flex-wrap gap-x-3 gap-y-0.5 items-center">
          <span class="num t-meta w-16">{shortDate((b.endAt ?? b.at ?? "").slice(0, 10))}</span>
          <b class="font-mono text-[12px]">{b.orderNo}</b><span class="font-medium">{b.name}{b.part ? ` · ${b.part}` : ""}</span>
          <span class="text-red font-semibold num">{b.failed}/{b.units} failed</span>
          <span class="text-c3">{b.reason || NO_REASON}</span>
          <span class="ml-auto t-meta">🖨 {b.printer || "—"}{b.spoolIds?.length ? ` · ${b.spoolIds.map((id, j) => spoolText(id, b, j)).join(" + ")}` : ""}{b.by ? ` · ${b.by}` : ""}</span></div>)}</div>}
    </Section>
  </WorkShell>;
}
