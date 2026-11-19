/** 🕘 Print history of one Floor line. Loaded on demand from Floor. */
import { Thumb } from "../../ui/media";
import { Button, Sheet } from "../../ui";
import { batchesSig, spoolsSig, type Order, type LineItem, type Batch } from "../../data";
import { colourHex, floorLine } from "../../data/floor";

const Sq = ({ hex, size = "w-6 h-6" }: { hex?: string; size?: string }) => <span class={`${size} inline-block rounded-[5px] shadow-[inset_0_0_0_1px_rgb(128_128_128/0.7)] align-middle`} style={{ background: hex || "repeating-linear-gradient(45deg,#9a9a9a 0 3px,#d8d8d8 3px 6px)" }} />;
const spoolName = (id?: string) => { const s = spoolsSig.value.find((x) => x.id === id); return s ? { s, t: `${s.material} · ${s.colour} · #${s.slot ?? s.spoolNo}` } : null; };
const runsOf = (o: Order, i: LineItem) => batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && b.running);
const Head = ({ i, k, f }: { i: LineItem; k: number; f: ReturnType<typeof floorLine> }) => <div class="flex gap-4 mb-4"><Thumb thumb={i.thumb} full={i.img} alt={i.name} class="w-24 h-24 !rounded-xl" />
  <div class="min-w-0 text-[13px] leading-relaxed text-c3">Sr {k + 1} · Qty {i.qty} · <b class="text-c4">{f.printed} printed · {f.remaining} pending</b>{f.wasted ? <span class="text-red"> · {f.wasted} wasted</span> : null}</div></div>;
/** Runs of a line taken off the plate (finished or skipped), newest first. */
const pastRuns = (o: Order, i: LineItem) => batchesSig.value.filter((b) => b.orderNo === o.no && b.name === i.name && !b.running).sort((a, b) => (b.endAt ?? b.at ?? "").localeCompare(a.endAt ?? a.at ?? ""));
const when = (iso?: string) => iso ? new Date(iso).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

/** 🕘 History of one line: every run with its machine, spools, grams, time, good and failed pieces. Read only. */
export function PrintHistory({ o, k, onClose }: { o: Order; k: number; onClose: () => void }) {
  const i = o.items[k], f = floorLine(o, i), runs = [...runsOf(o, i), ...pastRuns(o, i)];
  const spoolsOf = (b: Batch) => (b.spoolIds?.length ? b.spoolIds.map((id, j) => { const n = spoolName(id); return { id, t: n?.t ?? (b.spool?.split(" + ")[j] ?? "Spool removed from store"), hex: n?.s.hex ?? colourHex(n?.s.colour ?? b.colours?.[j] ?? ""), ref: b.colours?.[j], g: b.grams?.[id] }; }) : b.spool ? b.spool.split(" + ").map((t) => ({ id: t, t, hex: undefined as string | undefined, ref: undefined as string | undefined, g: undefined as number | undefined })) : []);
  const tot = runs.filter((b) => !b.running).reduce((a, b) => ({ good: a.good + b.done, bad: a.bad + (b.failed ?? 0), h: a.h + (b.hours ?? 0), g: a.g + Object.values(b.grams ?? {}).reduce((x, y) => x + y, 0) }), { good: 0, bad: 0, h: 0, g: 0 });
  return <Sheet huge open onClose={onClose} title={`🕘 Print history · ${i.name}`} footer={<Button onClick={onClose}>Close</Button>}>
    <div class="max-w-[820px] mx-auto"><Head i={i} k={k} f={f} />
      <div class="flex flex-wrap gap-x-6 gap-y-1 mb-3 text-[13px] num"><span><b>{runs.length}</b> runs</span><span class="text-grn"><b>{tot.good}</b> good</span><span class={tot.bad ? "text-red" : ""}><b>{tot.bad}</b> failed</span><span><b>{tot.g}</b> g used</span><span><b>{Math.round(tot.h * 10) / 10}</b> h</span></div>
      {!runs.length && <p class="t-meta">No runs logged for this line yet. Counts typed in Edit line items have no run behind them.</p>}
      <div class="grid gap-2">{runs.map((b) => { const sp = spoolsOf(b), bad = b.failed ?? 0; return <div key={b.id} class={`rounded-xl border p-3 ${b.running ? "border-amb/50 bg-amb-bg/40" : bad ? "border-red/40" : "border-line"}`}>
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <b>{b.running ? "ON PLATE" : b.weighLater ? "Done · weigh pending" : !b.spoolIds?.length && !b.grams ? "Logged (skipped)" : "Done"}</b>
          <span>🖨 {b.printer || "No machine"}</span>
          {(b.part || b.partsOn) && <span class="t-meta">{b.partsOn ? b.partsOn.join(" + ") : b.part}</span>}
          <span class="ml-auto t-meta num">Start {when(b.at)}{b.endAt ? ` · End ${when(b.endAt)}` : ""}{b.hours ? ` · ${b.hours} h` : ""}</span></div>
        <div class="flex flex-wrap gap-x-4 mt-1 text-[12.5px] num"><span>{b.plates ?? 1} plate{(b.plates ?? 1) > 1 ? "s" : ""} × {b.perPlate ?? b.units}</span>
          {!b.running && <><span class="text-grn font-semibold">{b.done} good</span><span class={bad ? "text-red font-semibold" : "text-c2"}>{bad} failed</span></>}
          {b.reason && <span class="text-red">· {b.reason}</span>}{b.by && <span class="text-c2">· by {b.by}</span>}</div>
        {sp.length > 0 && <div class="grid gap-1 mt-2">{sp.map((x) => <div key={x.id} class="flex items-center gap-2 text-[12.5px]"><Sq hex={x.hex} size="w-3.5 h-3.5" /><span class="min-w-0 truncate">{x.t}</span>{x.ref && <span class="t-meta truncate">for {x.ref}</span>}<span class="ml-auto num font-semibold">{x.g ? `${x.g} g` : b.running || b.weighLater ? "" : "—"}</span></div>)}</div>}
      </div>; })}</div>
    </div>
  </Sheet>;
}
