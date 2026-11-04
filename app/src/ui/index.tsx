import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useLocation } from "../router";
import { Icon } from "./icon";

export { Icon };

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; icon?: string };
export function Button({ variant = "primary", icon, children, class: c, ...rest }: Btn) {
  const v = {
    primary: "bg-c4 text-c0 border-c4",
    outline: "bg-c0 text-c4 border-c4",
    ghost: "bg-transparent text-c4 border-transparent hover:border-c2",
  }[variant];
  return (
    <button {...rest} class={`inline-flex items-center justify-center gap-2 h-9 md:h-10 px-4 md:px-5 rounded-full border text-[13px] md:text-sm font-semibold whitespace-nowrap cursor-pointer disabled:opacity-100 disabled:bg-c1 disabled:text-c2 disabled:border-c1 ${v} ${c ?? ""}`}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function Card({ children, class: c, dark, dashed }: { children: ComponentChildren; class?: string; dark?: boolean; dashed?: boolean }) {
  const base = dark ? "bg-c4 text-c0" : dashed ? "bg-transparent border-2 border-dashed border-c2" : "bg-c0";
  return <section class={`rounded-[var(--radius-card)] p-3 md:p-4 xl:p-5 min-w-0 ${base} ${c ?? ""}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="flex items-center justify-between gap-2 mb-2 md:mb-3">
      <h2 class="text-[15px] md:text-base font-bold tracking-tight min-w-0">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ value, label, dark }: { value: string | number; label: string; dark?: boolean }) {
  return (
    <div class={`rounded-2xl px-1 py-2 xl:py-3 text-center min-w-0 ${dark ? "bg-c0 text-c4" : "bg-c1"}`}>
      <div class="num text-lg md:text-xl xl:text-2xl font-extrabold">{value}</div>
      <div class="text-[10px] xl:text-[11px] uppercase tracking-[0.08em] font-medium mt-1 text-c3 leading-tight [overflow-wrap:normal] [word-break:keep-all]">{label}</div>
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
    <button onClick={onClick} class={`h-8 px-3.5 inline-flex items-center rounded-full text-xs cursor-pointer whitespace-nowrap ${active ? "bg-c4 text-c0 font-semibold border border-c4" : "bg-c0 text-c4 font-normal border border-c2"}`}>
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
        class="appearance-none cursor-pointer w-full h-9 pl-4 pr-9 rounded-full truncate bg-c4 text-c0 font-semibold text-[13px]">
        {tabs.map((t) => <option key={t.href} value={t.href}>{t.label}</option>)}
      </select>
      <span class="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-c0"><Icon name="down" size={14} /></span>
    </label>
  );
}

/** Filter control: chips for up to 3 options, a dropdown beyond that. */
export function Pick<T extends string>({ value, on, items, label, title }: { value: T; on: (v: T) => void; items: readonly T[] | T[]; label?: (v: T) => string; title?: string }) {
  const L = label ?? ((x: T) => x[0].toUpperCase() + x.slice(1));
  if (items.length <= 3) return <div class="inline-flex flex-wrap items-center gap-2">{items.map((x) => <Chip key={x} active={value === x} onClick={() => on(x)}>{L(x)}</Chip>)}</div>;
  return (
    <label class="relative inline-block min-w-0">
      <span class="sr-only">{title ?? "Filter"}</span>
      <select value={value} onChange={(e) => on((e.target as HTMLSelectElement).value as T)} aria-label={title ?? "Filter"}
        class="appearance-none cursor-pointer h-8 pl-3.5 pr-8 rounded-full bg-c0 border border-c2 text-xs font-semibold max-w-full truncate">
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
    done: <span class="w-2.5 h-2.5 rounded-full bg-c4" />,
    active: <span class="w-2.5 h-2.5 rounded-full border-2 border-c4" />,
    waiting: <span class="w-2.5 h-2.5 rounded-full border-2 border-dashed border-c3" />,
    blocked: <span class="w-2.5 h-2.5 bg-c4 rotate-45" />,
    idle: <span class="w-2.5 h-2.5 rounded-full bg-c2" />,
  }[tone];
  return (
    <span class={`inline-flex items-center gap-2 text-xs ${tone === "blocked" ? "font-bold" : tone === "done" ? "font-medium" : "font-normal"}`}>
      {mark}
      {children}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div class="h-2 rounded-full bg-c1 overflow-hidden" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <div class="h-full bg-c4 rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ComponentChildren }) {
  return (
    <div class="flex flex-col items-center justify-center text-center py-6 md:py-10 gap-2">
      <div class="w-12 h-12 rounded-full bg-c4 text-c0 flex items-center justify-center"><Icon name="plus" /></div>
      <div class="font-semibold">{title}</div>
      {hint && <div class="text-sm text-c3 max-w-xs">{hint}</div>}
      {action}
    </div>
  );
}

export type Col<T> = { key: string; label: string; render: (row: T) => ComponentChildren; align?: "right"; hideTablet?: boolean };
/** Table on iPad/desktop; stacked cards on phone. Never scrolls sideways. */
export function Table<T>({ cols, rows, rowKey, onRow }: { cols: Col<T>[]; rows: T[]; rowKey: (r: T) => string; onRow?: (r: T) => void }) {
  if (!rows.length) return <Empty title="Nothing here yet" />;
  const [head, ...rest] = cols;
  const hid = (c: Col<T>) => (c.hideTablet ? "hidden xl:table-cell" : "");
  return (
    <>
      <ul class="md:hidden flex flex-col gap-2">
        {rows.map((r) => (
          <li key={rowKey(r)} onClick={onRow && (() => onRow(r))} class={`bg-c1 rounded-xl p-2.5 text-[13px] ${onRow ? "cursor-pointer" : ""}`}>
            <div class="text-sm font-bold mb-1.5 break-words">{head.render(r)}</div>
            <dl class="grid grid-cols-3 gap-x-2 gap-y-1">
              {rest.map((c) => (
                <div key={c.key} class={`min-w-0 ${c.label ? "" : "col-span-3"}`}>
                  {c.label && <dt class="text-[10px] uppercase tracking-[0.08em] font-medium text-c3">{c.label}</dt>}
                  <dd class="break-words">{c.render(r)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <table class="hidden md:table w-full text-sm table-auto">
        <thead>
          <tr class="text-left text-c3 text-xs">
            {cols.map((c) => <th key={c.key} class={`font-medium py-2 pr-4 ${c.align === "right" ? "text-right" : ""} ${hid(c)}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow && (() => onRow(r))} class={`border-t border-c1 align-top ${onRow ? "cursor-pointer hover:bg-c1" : ""}`}>
              {cols.map((c) => <td key={c.key} class={`py-2.5 pr-4 break-words ${c.align === "right" ? "text-right num whitespace-nowrap" : ""} ${hid(c)}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Inline detail: phone shows the detail in place of the list; iPad/desktop put it in a fixed right column. Nothing overlays. */
export function Split({ detail, children }: { detail: ComponentChildren | null; children: ComponentChildren }) {
  return (
    <div class={`min-h-0 h-full ${detail ? "md:grid md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px] 2xl:grid-cols-[minmax(0,1fr)_460px]" : ""}`}>
      <div class={`min-w-0 min-h-0 h-full overflow-y-auto overscroll-contain px-3 md:px-5 2xl:px-7 py-3 md:py-4 ${detail ? "hidden md:block" : ""}`}>
        <div class="flex flex-col gap-4 2xl:gap-6">{children}</div>
      </div>
      {detail && <aside class="min-w-0 min-h-0 h-full overflow-y-auto overscroll-contain bg-c0 md:border-l border-c2/40 p-3 md:p-4 xl:p-5">{detail}</aside>}
    </div>
  );
}

export function DetailHead({ title, onClose }: { title: ComponentChildren; onClose: () => void }) {
  return (
    <div class="flex items-center gap-2 mb-3">
      <button class="w-8 h-8 shrink-0 rounded-full bg-c1 flex items-center justify-center cursor-pointer" onClick={onClose} aria-label="Close details"><Icon name="close" size={16} /></button>
      <h2 class="text-base md:text-xl font-extrabold tracking-tight min-w-0 break-words">{title}</h2>
    </div>
  );
}

/** In-page sub-sections: chips for ≤3, dropdown beyond. */
export function SubTabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: [T, string][] }) {
  const m = new Map(items);
  return <Pick value={value} on={onChange} items={items.map(([k]) => k)} label={(k) => m.get(k) ?? k} />;
}

/** A page: fixed head (title, actions, tabs, toolbar) + its own scroll area. Nothing scrolls under the head. */
export function Page({ title, sub, actions, tabs, toolbar, detail, children }: {
  title: string; sub?: string; actions?: ComponentChildren; tabs?: { href: string; label: string }[]; toolbar?: ComponentChildren;
  /** Pass to show an inline detail column (undefined = plain page). */ detail?: ComponentChildren | null; children: ComponentChildren;
}) {
  return (
    <div class="flex flex-col h-full min-h-0">
      <div class="shrink-0 flex flex-col gap-2 md:gap-2 px-3 md:px-5 2xl:px-7 py-2 md:py-2.5 border-b border-c2/40 bg-c1">
        <header class="flex items-center gap-2 md:gap-3 min-w-0">
          <div class="min-w-0 flex-1 flex items-baseline gap-3">
            <h1 class="text-lg md:text-2xl 2xl:text-[28px] font-extrabold tracking-tight leading-tight truncate">{title}</h1>
            {sub && <p class="hidden lg:block text-[13px] text-c3 font-normal truncate">{sub}</p>}
          </div>
          {tabs && <div class="w-[46%] md:w-56 shrink-0"><Tabs tabs={tabs} /></div>}
          {actions && <div class="hidden md:flex flex-wrap justify-end gap-2 shrink-0">{actions}</div>}
        </header>
        {toolbar && <div class="flex flex-wrap items-center gap-2 min-w-0">{toolbar}</div>}
      </div>
      <div class="flex-1 min-h-0">
        {detail !== undefined ? (
          <Split detail={detail}>{actions && <div class="md:hidden flex flex-wrap gap-2">{actions}</div>}{children}</Split>
        ) : (
          <div class="h-full overflow-y-auto overscroll-contain px-3 md:px-5 2xl:px-7 py-3 md:py-4">
            <div class="flex flex-col gap-4 2xl:gap-6">
              {actions && <div class="md:hidden flex flex-wrap gap-2">{actions}</div>}
              {children}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Section divider: label, count, a rule that runs to the edge, optional action. */
export function Section({ title, note, action, children }: { title: string; note?: string; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="flex flex-col gap-2 md:gap-3 min-w-0">
      <div class="flex items-center gap-3">
        <h2 class="text-[11px] md:text-xs font-extrabold uppercase tracking-[0.14em] text-c4 whitespace-nowrap">{title}</h2>
        {note && <span class="text-xs font-normal text-c3 whitespace-nowrap">{note}</span>}
        <span class="flex-1 h-px bg-c2 opacity-60" aria-hidden="true" />
        {action}
      </div>
      {children}
    </section>
  );
}

export function Fact({ label, value }: { label: string; value: ComponentChildren }) {
  return (
    <div>
      <div class="text-[11px] uppercase tracking-[0.08em] font-medium text-c3">{label}</div>
      <div class="text-[15px] font-bold mt-0.5">{value}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-[0.06em] font-semibold text-c3">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-10 md:h-11 px-3 md:px-4 rounded-xl border border-c3 bg-c0 text-c4 placeholder:text-c2 w-full";
