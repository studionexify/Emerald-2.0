/** Progressive-disclosure primitives: animated collapse, inline meta row, contextual "…" menu. */
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icon";
import { isPhone, Sheet } from "./sheet";
import { Collapse } from "./index";

/** "a · b · c" — 2–3 critical values, no field labels. Falsy parts are dropped. */
export function MetaRow({ items, class: c }: { items: ComponentChildren[]; class?: string }) {
  const xs = items.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return <span class={`t-meta num inline-flex flex-wrap items-center gap-x-1.5 min-w-0 ${c ?? ""}`}>{xs.map((x, i) => <span key={i} class="inline-flex items-center gap-1.5">{i > 0 && <span aria-hidden="true" class="text-c2">·</span>}{x}</span>)}</span>;
}

/** Toggle row ("Show advanced", "Cost breakdown"): button + Collapse. */
export function Reveal({ label, children, open: init = false, meta }: { label: string; children: ComponentChildren; open?: boolean; meta?: ComponentChildren }) {
  const [open, setOpen] = useState(init);
  const id = useRef(`rv${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div class="min-w-0">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}
        class="w-full h-11 md:h-8 flex items-center gap-2 text-[13px] font-semibold text-c4 cursor-pointer">
        <span class={`text-c2 inline-flex transition-transform ${open ? "rotate-90" : ""}`}><Icon name="right" size={12} /></span>
        {label}{meta !== undefined && <span class="ml-auto t-meta num">{meta}</span>}
      </button>
      <Collapse id={id} open={open}><div class="pt-1 pb-2">{children}</div></Collapse>
    </div>
  );
}

export type MenuItem = { label: string; on: () => void; danger?: boolean; hidden?: boolean };
/** Contextual "…" menu for non-primary actions. Popover on desktop (arrow keys, Esc), sheet on phone. */
export function Menu({ items, label = "More actions" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const xs = items.filter((i) => !i.hidden);
  const phone = isPhone.value;
  useEffect(() => {
    if (!open || phone) return;
    const els = () => [...(box.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? [])];
    els()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      const l = els(), i = l.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setOpen(false); btn.current?.focus(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); l[(i + 1) % l.length]?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); l[(i - 1 + l.length) % l.length]?.focus(); }
      else if (e.key === "Tab") setOpen(false);
    };
    const out = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const close = () => setOpen(false);
    document.addEventListener("keydown", key, true);
    document.addEventListener("pointerdown", out, true);
    addEventListener("scroll", close, true); addEventListener("resize", close);
    return () => { document.removeEventListener("keydown", key, true); document.removeEventListener("pointerdown", out, true); removeEventListener("scroll", close, true); removeEventListener("resize", close); };
  }, [open, phone]);
  if (!xs.length) return null;
  const run = (i: MenuItem) => { setOpen(false); i.on(); };
  const row = (i: MenuItem) => (
    <button key={i.label} role="menuitem" onClick={() => run(i)}
      class={`w-full text-left px-3 h-12 md:h-8 rounded-md text-[15px] md:text-[13px] cursor-pointer hover:bg-c1 focus:bg-c1 outline-none ${i.danger ? "font-semibold" : ""}`}>{i.label}</button>
  );
  return (
    <div ref={box} class="relative inline-block" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button ref={btn} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => { const r = btn.current!.getBoundingClientRect(); const up = innerHeight - r.bottom < 40 * xs.length + 24; setPos({ right: Math.max(8, innerWidth - r.right), ...(up ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }) }); setOpen(!open); }}
        class="w-11 h-11 md:w-7 md:h-7 rounded-md inline-flex items-center justify-center text-c3 hover:bg-c1 hover:text-c4 cursor-pointer">
        <span class="text-lg leading-none tracking-tighter" aria-hidden="true">···</span>
      </button>
      {open && !phone && <div role="menu" style={pos} class="fixed z-[60] flex flex-col whitespace-nowrap text-left min-w-44 max-w-[calc(100vw-16px)] p-1 rounded-lg bg-c0 border border-line shadow-xl pop-in">{xs.map(row)}</div>}
      {phone && <Sheet open={open} onClose={() => setOpen(false)} title={label}><div role="menu" class="flex flex-col divide-y divide-line">{xs.map(row)}</div></Sheet>}
    </div>
  );
}

/** Long-press (touch) → callback; returns props to spread on the row. */
export function useLongPress(cb: () => void, ms = 450) {
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fired = useRef(false);
  const clear = () => clearTimeout(t.current);
  return {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== "touch") return; fired.current = false; t.current = setTimeout(() => { fired.current = true; navigator.vibrate?.(10); cb(); }, ms); },
    onPointerUp: clear, onPointerMove: clear, onPointerCancel: clear,
    onClickCapture: (e: MouseEvent) => { if (fired.current) { e.stopPropagation(); e.preventDefault(); fired.current = false; } },
  };
}

/* ── Stepper: tactile ± with debounced commit (stock audit). ── */
export function Stepper({ value, onCommit, step = 1, min = 0, label, delay = 500 }: { value: number; onCommit: (v: number) => void; step?: number; min?: number; label: string; delay?: number }) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setV(value), [value]);
  useEffect(() => () => clearTimeout(t.current), []);
  const bump = (d: number) => {
    const n = Math.max(min, +(v + d).toFixed(3));
    setV(n);
    clearTimeout(t.current);
    t.current = setTimeout(() => n !== value && onCommit(n), delay);
  };
  const b = "w-11 h-11 md:w-8 md:h-8 rounded-lg bg-c1 text-c4 text-lg font-semibold flex items-center justify-center cursor-pointer select-none";
  return (
    <div class="inline-flex items-center gap-1" role="group" aria-label={label}>
      <button class={b} onClick={() => bump(-step)} disabled={v <= min} aria-label={`Decrease ${label}`}>−</button>
      <span class="min-w-10 text-center num" aria-live="polite">{v}</span>
      <button class={b} onClick={() => bump(step)} aria-label={`Increase ${label}`}>+</button>
    </div>
  );
}
