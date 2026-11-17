/** The Parts window (loaded only when opened). */
import { useEffect, useState } from "preact/hooks";
import { Button, Sheet } from "../../ui";
import { ordersSig, printersSig, filMasterSig, type Order } from "../../data";
import { allotParts, cutParts, MAX_PARTS, saveParts, runTotals, hoursText, lineColours } from "../../data/floor";
import type { LinePart } from "../../mock/types";

const sel = "h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] min-w-0 w-full cursor-pointer";
const inp = "h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] min-w-0 w-full num";
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];
/** Printers to share parts between: tick one to put everything on it, several to share equally. */
function Chips({ all, on, set }: { all: string[]; on: string[]; set: (v: string[]) => void }) {
  return <div class="flex flex-wrap gap-1.5">{all.map((m) => { const a = on.includes(m); return <button key={m} type="button" aria-pressed={a} onClick={() => set(a ? on.filter((x) => x !== m) : [...on, m])} class={`h-8 px-3 !min-h-0 rounded-full border text-[12px] cursor-pointer ${a ? "bg-c4 text-c0 border-c4 font-semibold" : "border-line bg-c0 text-c3 font-medium"}`}>{a ? "✓ " : ""}{m}</button>; })}
    {all.length > 1 && <button type="button" onClick={() => set(on.length === all.length ? [] : all)} class="h-8 px-2 !min-h-0 text-[12px] underline text-c3 cursor-pointer">{on.length === all.length ? "None" : "All printers"}</button>}</div>;
}

export function PartsSheet({ o, k, onClose }: { o: Order; k: number; onClose: () => void }) {
  const cur = ordersSig.value.find((x) => x.id === o.id) ?? o, i = cur.items[k];
  const [nTxt, setNTxt] = useState("2"), [files, setFiles] = useState<string[]>([]), [pick, setPick] = useState<string[]>([]), [chosen, setChosen] = useState<string[]>([]), [note, setNote] = useState("");
  const n = Math.max(2, Math.min(MAX_PARTS, Math.round(Number(nTxt)) || 2));
  /* a Nexder design with several files: offer one part per file (loaded only when this window opens) */
  useEffect(() => { if (!i?.designId) return; import("../../data/nexder").then((m) => { const d = m.nexderDesignsSig.value.find((x) => x.id === i.designId); if (d && d.files.length > 1) setFiles(d.files.map((f) => f.name.replace(/\.[^.]+$/, ""))); }).catch(() => {}); }, [i?.designId]);
  if (!i) return null;
  const parts = i.parts ?? [], all = runTotals(cur, i);
  const put = (next: LinePart[]) => saveParts(cur, k, next);
  const one = (id: string, p: Partial<LinePart>) => put(parts.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const mats = uniq([...filMasterSig.value.materials.map((m) => m.name), i.material, ...parts.map((p) => p.material)]);
  const cols = uniq([...lineColours(i), ...filMasterSig.value.colours.map((c) => c.name), ...parts.map((p) => p.colour)]);
  const machines = uniq(printersSig.value.filter((p) => p.active !== false).map((p) => p.name));
  const plan = parts.reduce((a, p) => ({ g: a.g + (p.g ?? 0), min: a.min + (p.min ?? 0) }), { g: 0, min: 0 });
  const make = (names?: string[], printers: string[] = []) => { const next = cutParts(cur, k, names?.length ?? n, printers); if (names) saveParts(next, k, (next.items[k].parts ?? []).map((p, j) => ({ ...p, name: names[j] ?? p.name }))); };
  return <Sheet huge open onClose={onClose} title={`✂ Parts · ${i.name}`} footer={<Button onClick={onClose}>Done</Button>}>
    <div class="max-w-[820px] mx-auto">
      {!parts.length ? <div class="rounded-2xl bg-c1 p-4 grid gap-3">
        <b class="text-[14px]">Cut this into how many parts?</b>
        <p class="t-meta">Big pieces are cut so several printers print them at the same time. Each part gets its own type, colour, printer, weight and time, and each one is started and finished on its own. A piece is counted automatically once every part of it has printed good.</p>
        <div class="flex flex-wrap items-center gap-2">
          <input type="text" inputMode="numeric" value={nTxt} onInput={(e) => setNTxt((e.target as HTMLInputElement).value.replace(/\D/g, "").slice(0, 3))} onBlur={() => setNTxt(String(n))} class={`${inp} !w-20`} aria-label={`Number of parts, 2 to ${MAX_PARTS}`} />
          {[2, 3, 4, 6, 8, 10, 12, 16, 20, 24].map((x) => <button key={x} type="button" onClick={() => setNTxt(String(x))} class={`h-9 min-w-9 px-2 !min-h-0 rounded-full text-[13px] font-semibold cursor-pointer ${n === x ? "bg-c4 text-c0" : "bg-c0 border border-line"}`}>{x}</button>)}
          <Button onClick={() => make()}>Cut into {n} parts</Button></div>
        <div class="border-t border-line pt-3 grid gap-2"><b class="text-[13px]">Quick split equally across printers</b>
          <p class="t-meta">Tick the printers. The {n} parts are shared equally between them{pick.length ? `: ${Math.floor(n / pick.length)}${n % pick.length ? "–" + Math.ceil(n / pick.length) : ""} each on ${pick.length} printer${pick.length > 1 ? "s" : ""}` : ""}. You can still rename and change every part afterwards.</p>
          <Chips all={machines} on={pick} set={setPick} />
          <div><Button variant="outline" disabled={!pick.length} onClick={() => make(undefined, pick)}>Cut into {n} parts across {pick.length || "…"} printer{pick.length === 1 ? "" : "s"}</Button></div></div>
        {files.length > 1 && <div class="border-t border-line pt-3"><p class="t-meta mb-2">This design has {files.length} files. Make one part for each file:</p><Button variant="outline" onClick={() => make(files)}>One part per file · {files.length}</Button></div>}
      </div> : <>
        <div class="rounded-2xl bg-c1 p-3 mb-3 grid gap-2">
          <div class="flex flex-wrap items-center gap-3"><b class="text-[13px]">Allot parts to printers</b>
            <button type="button" onClick={() => setChosen(chosen.length === parts.length ? [] : parts.map((x) => x.id))} class="text-[12px] underline text-c3 cursor-pointer !min-h-0">{chosen.length === parts.length ? "Unselect all" : "Select all parts"}</button>
            <span class="t-meta">{chosen.length ? `${chosen.length} selected` : "none selected: applies to all parts"}</span></div>
          <Chips all={machines} on={pick} set={setPick} />
          <div class="flex flex-wrap items-center gap-2"><Button variant="outline" disabled={!pick.length} onClick={() => { put(allotParts(parts, pick, chosen.length ? chosen : undefined)); setNote(`${chosen.length || parts.length} part${(chosen.length || parts.length) === 1 ? "" : "s"} allotted${pick.length > 1 ? ` equally across ${pick.length} printers` : ` to ${pick[0]}`}.`); }}>{pick.length > 1 ? `Share ${chosen.length || "all"} equally across ${pick.length} printers` : pick.length ? `Allot ${chosen.length || "all"} to ${pick[0]}` : "Pick a printer"}</Button>{note && <span role="status" class="t-meta">{note}</span>}</div></div>
        <div class="grid gap-3">{parts.map((p, j) => { const t = runTotals(cur, i, p.name), locked = t.runs > 0; return (
          <div key={p.id} class="rounded-2xl border border-line bg-c0 p-3">
            <div class="flex items-center gap-2 mb-2"><input type="checkbox" checked={chosen.includes(p.id)} onChange={() => setChosen((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))} aria-label={`Select ${p.name}`} class="w-4 h-4 !min-h-0 accent-c4 cursor-pointer shrink-0" /><span class="w-5 h-5 rounded-full bg-c4 text-c0 text-[11px] font-bold flex items-center justify-center shrink-0">{j + 1}</span>
              <input value={p.name} disabled={locked} aria-label="Part name" onInput={(e) => one(p.id, { name: (e.target as HTMLInputElement).value })} title={locked ? "Prints are logged against this name" : undefined} class="h-8 px-2 rounded-lg border border-line bg-c0 text-[13px] font-semibold flex-1 min-w-0 disabled:opacity-70" />
              {!locked && <button type="button" onClick={() => put(parts.filter((x) => x.id !== p.id))} class="text-[12px] text-red underline cursor-pointer !min-h-0">Remove</button>}</div>
            <div class="grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
              <label class="grid gap-1 text-[11px] text-c2">Type<select class={sel} value={p.material} onChange={(e) => one(p.id, { material: (e.target as HTMLSelectElement).value })}>{mats.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label class="grid gap-1 text-[11px] text-c2">Colour<select class={sel} value={p.colour} onChange={(e) => one(p.id, { colour: (e.target as HTMLSelectElement).value })}>{cols.map((c) => <option key={c}>{c}</option>)}</select></label>
              <label class="grid gap-1 text-[11px] text-c2">Printer<select class={sel} value={p.printer} onChange={(e) => one(p.id, { printer: (e.target as HTMLSelectElement).value })}><option value="">Any</option>{uniq([...machines, p.printer]).map((m) => <option key={m}>{m}</option>)}</select></label>
              <label class="grid gap-1 text-[11px] text-c2">Weight (g)<input type="number" min={0} class={inp} value={p.g ?? ""} onInput={(e) => one(p.id, { g: Number((e.target as HTMLInputElement).value) || undefined })} /></label>
              <label class="grid gap-1 text-[11px] text-c2">Time (min)<input type="number" min={0} class={inp} value={p.min ?? ""} onInput={(e) => one(p.id, { min: Number((e.target as HTMLInputElement).value) || undefined })} /></label>
            </div>
            <p class="t-meta mt-2">{t.runs ? <>{t.running ? `${t.running} on the plate · ` : ""}{t.runs - t.running} printed · <span class="text-grn">{t.good} good</span> · <span class={t.failed ? "text-red" : ""}>{t.failed} failed</span> · <b class="text-c4 num">{t.g} g · {hoursText(t.h)}</b> used{t.toWeigh ? " (some grams wait for the final weigh)" : ""}</> : "Not printed yet. Start it from the Start button and pick this part."}</p>
          </div>); })}</div>
        <button type="button" onClick={() => put([...parts, { id: crypto.randomUUID(), name: `Part ${parts.length + 1}`, material: i.material, colour: lineColours(i)[0] ?? i.colour, printer: "" }])} class="mt-3 w-full h-10 rounded-xl border border-dashed border-c2 text-[13px] font-medium text-c3 cursor-pointer !min-h-0">+ Add a part</button>
        <div class="mt-4 rounded-2xl bg-c1 p-3 grid gap-1 text-[13px]" aria-label="Totals">
          <div class="flex justify-between gap-3"><span class="text-c3">Planned</span><b class="num">{plan.g} g · {hoursText(plan.min / 60)}</b></div>
          <div class="flex justify-between gap-3"><span class="text-c3">Used so far, failed prints included</span><b class="num">{all.g} g · {hoursText(all.h)}</b></div>
          <div class="flex justify-between gap-3"><span class="text-c3">Prints</span><span class="num">{all.runs - all.running} done · {all.good} good · <span class={all.failed ? "text-red" : ""}>{all.failed} failed</span>{all.running ? ` · ${all.running} on the plate` : ""}</span></div>
          {all.toWeigh > 0 && <p class="t-meta">{all.toWeigh} run{all.toWeigh > 1 ? "s" : ""} printed with the spool still loaded: their grams are added at the final weigh.</p>}
        </div>
        {all.runs === 0 && <button type="button" onClick={() => put([])} class="mt-3 text-[12px] text-red underline cursor-pointer !min-h-0">Remove all parts</button>}
      </>}
    </div>
  </Sheet>;
}
