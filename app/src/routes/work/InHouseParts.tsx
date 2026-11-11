import { sortAbc } from "../../mock/types";
import { useState } from "preact/hooks";
import { Thumb } from "../../ui/media";
import { Button, Sheet } from "../../ui";
import { createOrder, filMasterSig, qcSig, uid, patchOrder, moveTo, log, me, today, ordersSig, batchesSig, lineProgress, shrinkImage, storeMedia, type Batch, type Order } from "../../data";
import { lineRun } from "../../data/floor";
import { PURPOSES } from "./Orders";
import { StartPrint, FinishPrint } from "./Floor";
import { StagePill } from "./Overview";

/** In-house quick create: what, how many, colour, purpose, optional photo, then straight into Start. */
export function QuickCreate({ onClose }: { onClose: () => void }) {
  const cols = filMasterSig.value.colours.map((c) => c.name);
  const [d, setD] = useState({ name: "", qty: 1, material: "PLA", colours: [cols[0] ?? "Black"] as string[], purpose: "Jig / tool" }), [pic, setPic] = useState<{ img: string; thumb: string } | null>(null);
  const [made, setMade] = useState<string | null>(null);
  const f = "h-10 px-3 rounded-lg border border-line bg-c0 text-[14px] w-full min-w-0";
  const attach = async (file?: File | null) => { if (!file || !file.type.startsWith("image/")) return; const [full, thumb] = await Promise.all([shrinkImage(file, 1024, 0.6), shrinkImage(file, 160, 0.6)]); setPic({ img: storeMedia(full, d.name || file.name), thumb }); };
  const create = () => { const o = createOrder({ type: "inhouse", customer: "", item: d.name.trim(), qty: d.qty, price: 0, medium: "Internal", due: today(), material: d.material, colour: d.colours[0], purpose: d.purpose });
    patchOrder(o, { items: o.items.map((i) => ({ ...i, colours: d.colours, colour: d.colours[0], ...(pic ?? {}) })) }); setMade(o.id); };
  const mo = made ? ordersSig.value.find((x) => x.id === made) : null;
  if (mo) return <StartPrint simple o={mo} k={0} onClose={onClose} />;
  const L = (t: string, c: preact.ComponentChildren) => <label class="flex flex-col gap-1 text-[12px] text-c2">{t}{c}</label>;
  return <Sheet open onClose={onClose} title="New in-house print" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={create} disabled={!d.name.trim() || !d.colours.length}>Next · pick filament</Button></>}>
    <div class="max-w-[520px] mx-auto grid grid-cols-2 gap-3">
      <div class="col-span-2">{L("What are we printing", <input class={f} value={d.name} placeholder="e.g. Fixture clip v2" onInput={(e) => setD({ ...d, name: (e.target as HTMLInputElement).value })} />)}</div>
      {L("Quantity", <input type="number" min={1} class={f} value={d.qty} onInput={(e) => setD({ ...d, qty: Math.max(1, Number((e.target as HTMLInputElement).value) || 1) })} />)}
      {L("Purpose", <select class={f} value={d.purpose} onChange={(e) => setD({ ...d, purpose: (e.target as HTMLSelectElement).value })}>{PURPOSES.map((x) => <option key={x}>{x}</option>)}</select>)}
      {L("Material", <select class={f} value={d.material} onChange={(e) => setD({ ...d, material: (e.target as HTMLSelectElement).value })}>{sortAbc(["PLA", "PETG", "ABS", "ASA", "TPU", "Resin", "Other"]).map((x) => <option key={x}>{x}</option>)}</select>)}
      <div class="col-span-2"><div class="text-[12px] text-c2 mb-1">Colours in this part · tap to add or remove</div>
        <div class="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">{cols.map((x) => { const on = d.colours.includes(x), hex = filMasterSig.value.colours.find((c) => c.name === x)?.hex;
          return <button key={x} type="button" aria-pressed={on} onClick={() => setD({ ...d, colours: on ? d.colours.filter((c) => c !== x) : [...d.colours, x] })} class={`h-8 px-2.5 !min-h-0 rounded-full flex items-center gap-1.5 text-[12px] cursor-pointer border ${on ? "bg-c4 text-c0 border-c4 font-semibold" : "border-line bg-c0"}`}><span class="w-3.5 h-3.5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.2)]" style={{ background: hex ?? "var(--c-1)" }} />{x}</button>; })}</div></div>
      <div class="col-span-2">{L("Photo (optional)", <input type="file" accept="image/*" class="text-[13px]" onChange={(e) => attach((e.target as HTMLInputElement).files?.[0])} />)}</div>
    </div></Sheet>;
}
const DEFECTS = sortAbc(["Warping", "Layer shift", "Stringing", "Dimension off", "Surface defect", "Broken / weak"]);
/** In-house order: every line item with its own Start / Finish, all on this tab. QC & close once every line is printed. */
export function InHouseCard({ o, onOpen }: { o: Order; onOpen: (o: Order) => void }) {
  const [go, setGo] = useState<{ k: number; run?: Batch } | null>(null);
  const cur = ordersSig.value.find((x) => x.id === o.id) ?? o;
  const rows = cur.items.map((i, k) => ({ i, k, p: lineProgress(cur, i), run: lineRun(cur, i) }));
  const allDone = rows.every((r) => r.p.pending === 0 && !r.run);
  const wasted = rows.reduce((t, r) => t + r.p.failed, 0);
  const [qc, setQc] = useState("Pass");
  const close = () => {
    const [res, ...def] = qc.split(" · "), g = batchesSig.value.filter((b) => b.orderNo === cur.no).reduce((t, b) => t + Object.values(b.grams ?? {}).reduce((a, x) => a + x, 0), 0);
    for (const i of cur.items) qcSig.value = [{ id: uid(), orderNo: cur.no, item: i.name, result: res.toLowerCase() as "pass", grams: g, defect: def.join(" · ") || undefined, by: me.value?.name ?? "You", date: today() }, ...qcSig.value];
    log(`QC ${qc}`, cur.no);
    if (res === "Rework") { moveTo(patchOrder(cur, { items: cur.items.map((i) => { const p = lineProgress(cur, i); return { ...i, printed: 0, failed: p.failed + p.printed }; }) }), "production", `In-house QC: ${qc}`); return; }
    moveTo(cur, "archived", `In-house QC: ${qc}`);
  };
  return <div class="border-t border-line first:border-0 px-4 py-3">
    <div class="flex items-center gap-3 mb-2">
      <button type="button" class="min-w-0 flex-1 text-left cursor-pointer !min-h-0" onClick={() => onOpen(cur)}><span class="t-meta font-mono">{cur.no}</span></button>
      {wasted > 0 && <span class="text-[11px] font-semibold text-red">{wasted} wasted</span>}
      <StagePill o={cur} />
    </div>
    <ul class="grid gap-1.5">{rows.map(({ i, k, p, run }) => <li key={k} class={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line px-3 py-2 ${p.pending === 0 && !run ? "bg-c1 text-c2 [&_img]:grayscale" : "bg-c0"}`}>
      <Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-11 h-11 !rounded-lg shrink-0" />
      <div class="min-w-0 flex-1 basis-[9rem]"><div class="text-[14px] font-semibold truncate">{i.name}</div>
        <div class="t-meta truncate">{[i.material, ...(i.colours ?? (i.colour ? [i.colour] : []))].filter(Boolean).join(" · ")} · Qty {i.qty}</div></div>
      <div class="flex items-center gap-3 max-[560px]:w-full max-[560px]:justify-between">
      <select value={i.purpose ?? ""} aria-label="Purpose" onChange={(e) => patchOrder(cur, { items: cur.items.map((x, j) => (j === k ? { ...x, purpose: (e.target as HTMLSelectElement).value } : x)) })} class="h-8 px-2 rounded-lg border border-line bg-c1 text-[12px] cursor-pointer max-w-[120px]"><option value="">Purpose…</option>{PURPOSES.map((x) => <option key={x}>{x}</option>)}</select>
      <div class="num text-[12px] text-right whitespace-nowrap"><b class="text-grn">{Math.min(p.printed, i.qty)}</b><span class="text-c3">/{i.qty}</span>{p.failed > 0 && <span class="text-red"> · {p.failed} wasted</span>}</div>
      {run ? <button type="button" onClick={() => setGo({ k, run })} class="h-9 px-4 !min-h-0 rounded-lg bg-amb text-c0 text-[13px] font-bold cursor-pointer whitespace-nowrap">■ Finish{run.printer ? ` · ${run.printer}` : ""}</button>
        : p.pending > 0 ? <button type="button" onClick={() => setGo({ k })} class="h-9 px-4 !min-h-0 rounded-lg bg-grn text-c0 text-[13px] font-bold cursor-pointer">▶ Start</button>
        : <span class="text-[12px] font-semibold px-2">Done ✓</span>}
      </div>
    </li>)}</ul>
    {allDone && cur.stage !== "archived" && <div class="mt-2 flex flex-wrap items-center justify-end gap-2"><span class="t-meta">QC</span>
      <select value={qc} onChange={(e) => setQc((e.target as HTMLSelectElement).value)} aria-label="QC result" class="h-9 px-2 rounded-lg border border-line bg-c0 text-[13px] cursor-pointer">
        <option>Pass</option>{["Rework", "Scrap"].map((r) => DEFECTS.map((d) => <option key={r + d}>{`${r} · ${d}`}</option>))}</select>
      <Button onClick={close}>Complete</Button></div>}
    {go && !go.run && <StartPrint simple o={cur} k={go.k} onClose={() => setGo(null)} />}
    {go?.run && <FinishPrint simple o={cur} k={go.k} run={go.run} onClose={() => setGo(null)} />}
  </div>;
}
