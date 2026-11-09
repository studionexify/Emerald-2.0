import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useLocation } from "../router";
import { Icon } from "./icon";
import { FilterSheet, isPhone, Sheet } from "./sheet";

export { Icon };
export { ask, AskHost, FilterSheet, isPhone, Sheet } from "./sheet";

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; icon?: string };
export function Button({ variant = "primary", icon, children, class: c, ...rest }: Btn) {
  const v = {
    primary: "bg-c4 text-c0 border-c4 hover:opacity-90",
    outline: "bg-c0 text-c4 border-line hover:bg-c1",
    ghost: "bg-transparent text-c4 border-transparent hover:bg-c1",
  }[variant];
  return (
    <button {...rest} class={`inline-flex items-center justify-center gap-1.5 h-8 px-3.5 rounded-full border text-[13px] font-semibold whitespace-nowrap cursor-pointer disabled:opacity-100 disabled:bg-c1 disabled:text-c2 disabled:border-line ${v} ${c ?? ""}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </button>
  );
}

export function Card({ children, class: c, dark, dashed }: { children: ComponentChildren; class?: string; dark?: boolean; dashed?: boolean }) {
  const base = dark ? "bg-c0 border border-c4" : dashed ? "bg-transparent border border-dashed border-c2" : "bg-c0 border border-transparent";
  return <section class={`rounded-[var(--radius-card)] p-3 md:p-4 min-w-0 ${base} ${c ?? ""}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="flex items-center justify-between gap-2 mb-2">
      <h2 class="text-[15px] font-bold text-c4 min-w-0">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ value, label }: { value: string | number; label: string; dark?: boolean }) {
  return (
    <div class={`rounded-2xl px-3 py-2 min-w-0 flex flex-col justify-center bg-c0`}>
      <div class="t-meta truncate">{label}</div>
      <div class="num text-[17px] font-semibold leading-tight mt-0.5">{value}</div>
    </div>
  );
}

export function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div class="num text-3xl md:text-5xl 2xl:text-6xl font-semibold leading-none">{value}</div>
      <div class="text-xs md:text-sm mt-1.5 opacity-80">{label}</div>
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ComponentChildren; onClick?: () => void }) {
  return (
    <button onClick={onClick} class={`h-7 px-3 inline-flex items-center rounded-full text-xs cursor-pointer whitespace-nowrap ${active ? "bg-acc text-on-acc font-semibold" : "bg-transparent text-c3 font-medium hover:text-c4"}`}>
      {children}
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const { path, route } = useLocation();
  const current = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => path === t.href || path.startsWith(t.href + "/"));
  return (
    <label class="relative block">
      <span class="sr-only">Section</span>
      <select value={current?.href} onChange={(e) => route((e.target as HTMLSelectElement).value)}
        class="appearance-none cursor-pointer w-full h-8 pl-4 pr-8 rounded-full truncate bg-acc-bg border border-transparent text-c4 font-semibold text-[13px]">
        {tabs.map((t) => <option key={t.href} value={t.href}>{t.label}</option>)}
      </select>
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-c2"><Icon name="down" size={12} /></span>
    </label>
  );
}

/** Filter control: chips for up to 3 options, a dropdown beyond that. */
export function Pick<T extends string>({ value, on, items, label, title }: { value: T; on: (v: T) => void; items: readonly T[] | T[]; label?: (v: T) => string; title?: string }) {
  const L = label ?? ((x: T) => x[0].toUpperCase() + x.slice(1));
  if (items.length <= 3) return <div class="inline-flex flex-wrap max-w-full items-center gap-0.5 p-1 rounded-full bg-c0">{items.map((x) => <Chip key={x} active={value === x} onClick={() => on(x)}>{L(x)}</Chip>)}</div>;
  return (
    <label class="relative inline-block min-w-0">
      <span class="sr-only">{title ?? "Filter"}</span>
      <select value={value} onChange={(e) => on((e.target as HTMLSelectElement).value as T)} aria-label={title ?? "Filter"}
        class="appearance-none cursor-pointer h-7 pl-3 pr-8 rounded-full bg-c0 border border-transparent text-xs font-medium max-w-full truncate">
        {items.map((x) => <option key={x} value={x}>{title ? `${title}: ${L(x)}` : L(x)}</option>)}
      </select>
      <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-c3"><Icon name="down" size={12} /></span>
    </label>
  );
}

/** Status without colour: shape + label. */
export type Tone = "done" | "active" | "waiting" | "blocked" | "idle";
export function Status({ tone, children }: { tone: Tone; children: ComponentChildren }) {
  const mark = {
    done: <Icon name="check" size={11} />,
    active: <span class="w-1.5 h-1.5 rounded-full bg-current" />,
    waiting: <Icon name="hourglass" size={11} />,
    blocked: <Icon name="alert" size={11} />,
    idle: <span class="w-1.5 h-1.5 rounded-full bg-current opacity-60" />,
  }[tone];
  const pill = { done: "bg-grn-bg text-grn", active: "bg-c1 text-c4", waiting: "bg-amb-bg text-amb", blocked: "bg-red-bg text-red", idle: "bg-c1 text-c2" }[tone];
  return (
    <span class={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold whitespace-nowrap ${pill}`}>
      {mark}
      {children}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div class="h-1.5 rounded-full bg-c1 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div class="h-full bg-c4 rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ComponentChildren }) {
  return (
    <div class="flex flex-col items-center justify-center text-center py-4 gap-1.5">
      <div class="text-[13px] font-semibold">{title}</div>
      {hint && <div class="t-meta max-w-xs">{hint}</div>}
      {action}
    </div>
  );
}

/** Height-animated collapse with no layout jump: grid rows 0fr → 1fr. Content stays mounted only while open. */
export function Collapse({ open, children, id }: { open: boolean; children: ComponentChildren; id?: string }) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => { if (open) setMounted(true); }, [open]);
  return (
    <div id={id} class="disc-x grid min-w-0" data-open={open ? "" : undefined} aria-hidden={!open} {...{ inert: !open || undefined }}
      onTransitionEnd={(e) => e.target === e.currentTarget && !open && setMounted(false)}>
      <div class="min-h-0 overflow-hidden">{(open || mounted) && children}</div>
    </div>
  );
}

/** card: where the column goes in the phone record card. Default = split key/value row; "status" = pill beside the title; "foot" = bottom meta line; "hide" = desktop only.
    level 2 = secondary data: hidden from the scannable row, revealed by the row's + toggle (desktop/tablet) and in the record sheet (phone). */
export type Col<T> = { key: string; label: string; render: (row: T) => ComponentChildren; align?: "right"; hideTablet?: boolean; card?: "status" | "foot" | "hide"; level?: 2 };
/** Table on iPad/desktop; vertical record cards on phone. Never scrolls sideways.
    act = the single contextual action for the row's current state; expand = extra Level-2 content under the row. */
export function Table<T>({ cols: all, rows, rowKey, onRow, act, expand }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void; act?: (r: T) => ComponentChildren; expand?: (r: T) => ComponentChildren }) {
  const [openRows, setOpenRows] = useState<Set<string>>(new Set());
  if (!rows.length) return <Empty title="Nothing here yet" />;
  const cols = all.filter((c) => c.level !== 2), l2 = all.filter((c) => c.level === 2);
  const canExpand = l2.length > 0 || !!expand;
  const toggle = (k: string) => setOpenRows((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const [head, ...rest] = cols;
  const hid = (c: Col<T>) => (c.hideTablet ? "hidden xl:table-cell" : "");
  const status = rest.filter((c) => c.card === "status"), foot = rest.filter((c) => c.card === "foot");
  const body = rest.filter((c) => !c.card);
  const span = cols.length + (canExpand ? 1 : 0) + (act ? 1 : 0);
  /* Row keyboard: ↑/↓ move, → expand, ← collapse, Enter open. */
  const key = (r: T, k: string) => (e: KeyboardEvent) => {
    const tr = e.currentTarget as HTMLElement;
    const sib = (d: 1 | -1) => { let x = tr as Element | null; do x = d > 0 ? x!.nextElementSibling : x!.previousElementSibling; while (x && !(x as HTMLElement).dataset.row); return x as HTMLElement | null; };
    if (e.key === "ArrowDown") { e.preventDefault(); sib(1)?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); sib(-1)?.focus(); }
    else if (e.key === "ArrowRight" && canExpand && !openRows.has(k)) toggle(k);
    else if (e.key === "ArrowLeft" && openRows.has(k)) toggle(k);
    else if (e.key === "Enter" && e.target === tr) onRow?.(r);
  };
  const stop = (e: Event) => e.stopPropagation();
  return (
    <>
      <ul class="md:hidden flex flex-col divide-y divide-line">
        {rows.map((r) => (
          <li key={rowKey(r)}>
            <div role={onRow ? "button" : undefined} tabIndex={onRow ? 0 : undefined} onClick={onRow && (() => onRow(r))} onKeyDown={onRow && ((e) => e.key === "Enter" && e.target === e.currentTarget && onRow(r))}
              class={`block -mx-1 px-1 py-3 rounded-lg text-[14px] ${onRow ? "cursor-pointer active:bg-c1" : ""}`}>
              <div class="flex items-start gap-2 min-h-6">
                <div class="flex-1 min-w-0 text-[15px] font-semibold leading-snug break-words">{head.render(r)}</div>
                {status.map((c) => <div key={c.key} class="shrink-0 rounded-full bg-c1 px-2 py-0.5">{c.render(r)}</div>)}
                {onRow && !act && <span class="shrink-0 text-c2 mt-0.5"><Icon name="right" size={14} /></span>}
              </div>
              {body.length > 0 && (
                <dl class="mt-2 flex flex-col">
                  {body.map((c) => c.label ? (
                    <div key={c.key} class="flex items-baseline justify-between gap-3 py-1 min-w-0">
                      <dt class="text-c2 text-[13px] shrink-0">{c.label}</dt>
                      <dd class={`min-w-0 text-right break-words ${c.align === "right" ? "num" : ""}`}>{c.render(r)}</dd>
                    </div>
                  ) : <dd key={c.key} class="py-1 break-words">{c.render(r)}</dd>)}
                </dl>
              )}
              {foot.length > 0 && <div class="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 t-meta">{foot.map((c) => <span key={c.key}>{c.label && `${c.label} `}{c.render(r)}</span>)}</div>}
              {act && <div class="mt-2.5 flex items-center gap-2 [&_button]:h-11 [&>*:first-child]:flex-1" onClick={stop}>{act(r)}</div>}
            </div>
          </li>
        ))}
      </ul>
      <table class="hidden md:table w-full text-[13px] table-auto">
        <thead>
          <tr class="text-left text-c3 text-xs bg-thead [&>th:first-child]:rounded-l-xl [&>th:last-child]:rounded-r-xl [&>th:first-child]:pl-3">
            {canExpand && <th class="w-7"><span class="sr-only">Expand</span></th>}
            {cols.map((c) => <th key={c.key} class={`py-1.5 pr-4 ${c.align === "right" ? "text-right" : ""} ${hid(c)}`}>{c.label}</th>)}
            {act && <th class="text-right pr-1"><span class="sr-only">Action</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r), open = openRows.has(k);
            return [
              <tr key={k} data-row="1" tabIndex={0} onKeyDown={key(r, k)} onClick={onRow && (() => onRow(r))} aria-expanded={canExpand ? open : undefined}
                class={`h-10 border-t border-line align-middle outline-none focus-visible:bg-c1 ${onRow ? "cursor-pointer hover:bg-c1/60" : ""}`}>
                {canExpand && <td class="pl-0.5 w-7" onClick={stop}><button tabIndex={-1} aria-label={open ? "Hide details" : "Show details"} aria-expanded={open} onClick={() => toggle(k)} class="w-6 h-6 rounded-md inline-flex items-center justify-center text-c3 hover:bg-c1 hover:text-c4 cursor-pointer"><span class={`inline-flex transition-transform ${open ? "rotate-90" : ""}`}><Icon name="right" size={12} /></span></button></td>}
                {cols.map((c) => <td key={c.key} class={`py-1.5 pr-4 break-words ${c.align === "right" ? "text-right num whitespace-nowrap" : ""} ${hid(c)}`}>{c.render(r)}</td>)}
                {act && <td class="py-1 pr-1 text-right whitespace-nowrap" onClick={stop}><span class="inline-flex items-center gap-1">{act(r)}</span></td>}
              </tr>,
              canExpand && (
                <tr key={k + ":x"} class={open ? "" : "border-0"}>
                  <td colSpan={span} class="p-0">
                    <Collapse open={open}>
                      <div class="pl-8 pr-3 pb-3 pt-0.5 flex flex-col gap-2">
                        {l2.length > 0 && <dl class="flex flex-wrap gap-x-6 gap-y-1.5">{l2.map((c) => <div key={c.key} class="min-w-0"><dt class="t-meta">{c.label}</dt><dd class="text-[13px] font-medium num">{c.render(r)}</dd></div>)}</dl>}
                        {expand?.(r)}
                      </div>
                    </Collapse>
                  </td>
                </tr>
              ),
            ];
          })}
        </tbody>
      </table>
    </>
  );
}

/** Detail: iPad/desktop put it in a fixed right column; phone slides it up as a full-height bottom sheet over the list.
    The sheet closes through the detail's own DetailHead close button, so routes need no phone-specific code. */
export function Split({ detail, children }: { detail: ComponentChildren | null; children: ComponentChildren }) {
  const phone = isPhone.value;
  const ref = useRef<HTMLDivElement>(null);
  const close = () => ref.current?.querySelector<HTMLButtonElement>("[data-close]")?.click();
  const [hide, setHide] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "i") { e.preventDefault(); setHide((h) => !h); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => setHide(false), [!!detail]);
  if (hide && !phone) detail = null;
  return (
    <div class={`min-h-0 h-full ${detail && !phone ? "md:grid md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]" : ""}`}>
      <div class="min-w-0 min-h-0 h-full overflow-y-auto overscroll-contain px-3 md:px-5 2xl:px-6 py-3 md:py-4">
        <div class="flex flex-col gap-4">{children}</div>
      </div>
      {detail && !phone && <aside aria-label="Inspector (⌘I to hide)" class="sheet-fade min-w-0 min-h-0 h-full overflow-y-auto overscroll-contain bg-c0 border-l border-line p-4">{detail}</aside>}
      {detail && phone && <Sheet full onClose={close}><div ref={ref} class="pt-1">{detail}</div></Sheet>}
    </div>
  );
}

export function DetailHead({ title, onClose }: { title: ComponentChildren; onClose: () => void }) {
  return (
    <div class="flex items-center gap-2 mb-3">
      <button data-close class="w-11 h-11 md:w-7 md:h-7 -ml-2 md:ml-0 shrink-0 rounded-full flex items-center justify-center cursor-pointer" onClick={onClose} aria-label="Close details"><span class="w-7 h-7 rounded-full bg-c1 flex items-center justify-center"><Icon name="close" size={16} /></span></button>
      <h2 class="text-[17px] font-semibold tracking-tight min-w-0 break-words">{title}</h2>
    </div>
  );
}

/** In-page sub-sections: chips for ≤3, dropdown beyond. */
export function SubTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  const m = new Map(items);
  return <Pick value={value} on={onChange} items={items.map(([k]) => k)} label={(k) => m.get(k) ?? k} />;
}

/** A page: fixed head (title, actions, tabs, toolbar) + its own scroll area. Nothing scrolls under the head. */
export function Page({ title, sub, actions, tabs, toolbar, strip, detail, children }: {
  title: string; sub?: string; actions?: ComponentChildren; tabs?: { href: string; label: string }[]; toolbar?: ComponentChildren; /** Always-visible band under the toolbar (outside the scroll area). */ strip?: ComponentChildren;
  /** Pass to show an inline detail column (undefined = plain page). */ detail?: ComponentChildren | null; children: ComponentChildren;
}) {
  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="shrink-0 flex flex-col gap-2 px-3 md:px-5 2xl:px-6 pt-3 pb-2.5 bg-canvas">
        <header class="flex items-center gap-2 md:gap-3 min-w-0">
          <div class="min-w-0 flex-1 flex items-baseline gap-3">
            <h1 class="t-title whitespace-nowrap shrink-0 flex items-center gap-2.5"><span aria-hidden="true" class="w-1.5 h-6 rounded-full bg-acc shrink-0" />{title}</h1>
            {sub && <p class="hidden lg:block t-meta truncate">{sub}</p>}
          </div>
          {tabs && <div class="w-[46%] md:w-48 shrink-0"><Tabs tabs={tabs} /></div>}
          {actions && <div class="hidden md:flex flex-wrap justify-end gap-2 shrink-0">{actions}</div>}
        </header>
        {toolbar && (isPhone.value ? <FilterSheet>{toolbar}</FilterSheet> : <div class="flex flex-wrap items-center gap-2 min-w-0">{toolbar}</div>)}
        {strip}
      </div>
      <div class="flex-1 min-h-0">
        {detail !== undefined ? (
          <Split detail={detail}>{children}</Split>
        ) : (
          <div class="h-full overflow-y-auto overscroll-contain px-3 md:px-5 2xl:px-6 py-3 md:py-4">
            <div class="flex flex-col gap-4">
              {children}
            </div>
          </div>
        )}
      </div>
      {actions && <ActionDock>{actions}</ActionDock>}
    </div>
  );
}

/** Phone-only sticky action bar at the foot of a page, directly above the dock: primary CTAs in thumb reach. */
export function ActionDock({ children }: { children: ComponentChildren }) {
  return (
    <div class="md:hidden shrink-0 border-t border-line bg-c0/90 backdrop-blur-md px-3 py-2 flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0 [&_button]:h-12 [&_a]:min-h-12 [&>*:last-child]:flex-1">
      {children}
    </div>
  );
}

/** Section divider: label, count, a rule that runs to the edge, optional action. */
export function Section({ title, note, action, children }: { title: string; note?: string; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="flex flex-col gap-2 min-w-0">
      <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
        <h2 class="t-section whitespace-nowrap">{title}</h2>
        {note && <span class="t-meta whitespace-nowrap num">{note}</span>}
        <span class="flex-1" aria-hidden="true" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Fact({ label, value }: { label: string; value: ComponentChildren }) {
  return (
    <div>
      <div class="t-meta">{label}</div>
      <div class="text-[13px] font-semibold mt-0.5 num">{value}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="flex flex-col gap-1 text-[13px] min-w-0">
      <span class="text-[11px] font-medium text-c3">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-8 px-3 rounded-xl border border-line bg-c0 text-c4 text-[13px] placeholder:text-c2 w-full focus:border-c4 outline-none";

/** Split-row key/value: label left, value right on one baseline. */
export function KV({ label, value, strong }: { label: ComponentChildren; value: ComponentChildren; strong?: boolean }) {
  return (
    <div class="flex items-baseline justify-between gap-3 py-1.5 border-t border-line first:border-0 min-w-0">
      <span class="text-[13px] text-c3 min-w-0 truncate">{label}</span>
      <span class={`num text-[13px] whitespace-nowrap ${strong ? "font-bold" : "font-medium"}`}>{value}</span>
    </div>
  );
}

/** Disclosure triangle: collapsed detail behind a summary row. */
export function Disclosure({ title, meta, open, children, class: c }: { title: ComponentChildren; meta?: ComponentChildren; open?: boolean; children: ComponentChildren; class?: string }) {
  return (
    <details open={open} class={`rounded-[var(--radius-card)] bg-c0 border border-transparent min-w-0 ${c ?? ""}`}>
      <summary class="flex items-center gap-2 h-10 px-3 select-none">
        <span class="chev text-c2 inline-flex"><Icon name="right" size={12} /></span>
        <span class="text-[13px] font-semibold min-w-0 truncate">{title}</span>
        {meta && <span class="ml-auto t-meta num whitespace-nowrap">{meta}</span>}
      </summary>
      <div class="px-3 pb-3">{children}</div>
    </details>
  );
}

/** Inline meter: thin bar + figure. */
export function Meter({ value, label }: { value: number; label?: ComponentChildren }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span class="inline-flex items-center gap-2 min-w-0 w-full">
      <span class="flex-1 h-1 rounded-full bg-c1 overflow-hidden min-w-[40px]"><span class={`block h-full rounded-full ${v < 20 ? "bg-warn" : "bg-c4"}`} style={{ width: `${v}%` }} /></span>
      {label !== undefined && <span class="num text-[11px] text-c3 whitespace-nowrap">{label}</span>}
    </span>
  );
}

/** Waterfall (masonry): items go, in order, into whichever column is shortest; column count follows the available width. */
export function Waterfall({ items, min = 340, max = 4, gap = "gap-4" }: { items: [number, ComponentChildren][]; min?: number; max?: number; gap?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [n, setN] = useState(1);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setN(Math.max(1, Math.min(max, Math.floor((e.contentRect.width + 16) / (min + 16))))));
    ro.observe(el); return () => ro.disconnect();
  }, [min, max]);
  const cols: ComponentChildren[][] = Array.from({ length: n }, () => []); const h = Array(n).fill(0);
  items.forEach(([w, node]) => { const i = h.indexOf(Math.min(...h)); cols[i].push(node); h[i] += w; });
  return <div ref={ref} class={`flex items-start ${gap}`}>{cols.map((c, i) => <div key={i} class={`flex-1 min-w-0 flex flex-col ${gap}`}>{c}</div>)}</div>;
}
