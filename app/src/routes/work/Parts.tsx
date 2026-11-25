/** Cut a line item into parts: each part has its own type, colour, printer, weight and time. Once printed (failed prints too) the totals show. */
import { useState } from "preact/hooks";
import { lazy } from "../../router";
import { ordersSig, batchesSig, type Order } from "../../data";
import { runTotals, hoursText } from "../../data/floor";

const PartsSheet = lazy<{ o: Order; k: number; onClose: () => void }>(() => import("./PartsSheet").then((m) => m.PartsSheet));

/** The "Cut part" / "Parts" button for a line, with what it has used so far. */
export function PartsButton({ o, k, compact }: { o: Order; k: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const cur = ordersSig.value.find((x) => x.id === o.id) ?? o, i = cur.items[k]; if (!i) return null;
  const t = batchesSig.value.length ? runTotals(cur, i) : null, n = i.parts?.length ?? 0;
  return <>
    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(true); }} class={`${compact ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]"} !min-h-0 max-md:h-auto max-md:min-h-6 max-md:py-0.5 max-md:whitespace-normal max-md:text-left rounded-full border border-line bg-c0 font-semibold whitespace-nowrap cursor-pointer`} title="Cut this line into parts, each with its own printer, filament, weight and time">
      ✂ {n ? `Parts · ${n}` : "Split into parts"}{t && t.runs - t.running > 0 ? ` · ${t.g} g · ${hoursText(t.h)}` : ""}</button>
    {open && <PartsSheet o={cur} k={k} onClose={() => setOpen(false)} />}
  </>;
}

