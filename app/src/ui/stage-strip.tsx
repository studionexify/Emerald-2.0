import { Fragment } from "preact";
import { Icon } from "./icon";
import { inr, orderTotal, STAGES, type Order, type Stage } from "../data";

/** Stage glyphs, shared by the strip, stage pills and order rows. */
export const STAGE_ICON: Record<Stage, string> = {
  quotation: "doc", po: "stamp", production: "printer", qc: "shield",
  packing: "box", invoice: "receipt", shipping: "truck", archived: "archive",
};

/** Where each stage card leads. */
export const STAGE_HREF: Record<Stage, string> = {
  quotation: "/work/orders", po: "/work/orders", production: "/work/production", qc: "/work/qc",
  packing: "/work/packing", invoice: "/work/invoice", shipping: "/work/shipping", archived: "/work/archive",
};

/**
 * The pipeline as a row of stage cards with chevrons between them.
 * Archived is left off: it is a growing pile, not a queue. Value shows only when the viewer can see money.
 */
export function StageStrip({ orders, showValue, active }: { orders: Order[]; showValue: boolean; active?: Stage }) {
  const stages = STAGES.filter((s) => s.key !== "archived");
  return (
    <nav aria-label="Orders by stage" class="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] md:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-1.5 min-[1400px]:flex min-[1400px]:items-stretch min-[1400px]:gap-1 rounded-[22px] bg-panel p-2">
      {stages.map((s, i) => {
        const inStage = orders.filter((o) => o.stage === s.key);
        const n = inStage.length;
        const v = inStage.filter((o) => o.type !== "inhouse").reduce((t, o) => t + orderTotal(o), 0);
        const on = active === s.key;
        return (
          <Fragment key={s.key}>
            {i > 0 && <span aria-hidden="true" class="hidden min-[1400px]:block shrink-0 self-center text-c2 opacity-60"><Icon name="right" size={14} /></span>}
            <a href={STAGE_HREF[s.key]} aria-label={`${s.label}: ${n} order${n === 1 ? "" : "s"}`}
              class={`flex min-w-0 min-[1400px]:min-w-[8.5rem] flex-1 flex-col gap-1.5 md:gap-2 rounded-2xl border-[1.5px] bg-c0 p-2 md:p-3 hover:border-line ${on ? "!border-c4" : "border-transparent"}`}>
              <span class={`inline-flex max-w-full w-max items-center gap-1 md:gap-1.5 rounded-full px-2 md:px-2.5 py-1 whitespace-nowrap text-[11px] md:text-[11.5px] font-semibold ${on ? "bg-lime text-black" : "bg-c1 text-c3"}`}>
                <Icon name={STAGE_ICON[s.key]} size={13} />{s.label}
              </span>
              <span class="num text-[24px] md:text-[30px] leading-none font-semibold tracking-[-0.03em]">{n}</span>
              <span class="num t-meta truncate">{n === 0 ? "Nothing here" : showValue && v > 0 ? `${inr(v)} in stage` : `${n} open`}</span>
            </a>
          </Fragment>
        );
      })}
    </nav>
  );
}

/** Up to two initials in a warm circle: the customer's mark in a row. */
export function Initials({ name }: { name: string }) {
  const letters = name.replace(/[^\p{L}\p{N} ]/gu, "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "·";
  return <span aria-hidden="true" class="w-8 h-8 shrink-0 rounded-full bg-avatar text-c3 flex items-center justify-center text-[11px] font-semibold">{letters}</span>;
}

/** A stage as a pill: glyph + name. */
export function StagePill({ stage, label }: { stage: Stage; label: string }) {
  return (
    <span class="inline-flex max-w-full items-center gap-1.5 rounded-full bg-c1 px-2.5 py-0.5 text-[11.5px] font-semibold text-c3">
      <Icon name={STAGE_ICON[stage]} size={12} /><span class="truncate">{label}</span>
    </span>
  );
}
