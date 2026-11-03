import type { ButtonHTMLAttributes, ComponentChildren } from "preact";
import { useLocation } from "../router";
import { Icon } from "./icon";

export { Icon };

type Btn = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "outline" | "ghost"; icon?: string };
export function Button({ variant = "primary", icon, children, class: c, ...rest }: Btn) {
  const v = {
    primary: "bg-c4 text-c0 border-c4",
    outline: "bg-c0 text-c4 border-c4",
    ghost: "bg-transparent text-c4 border-transparent hover:bg-c1",
  }[variant];
  return (
    <button {...rest} class={`inline-flex items-center justify-center gap-2 h-10 px-5 rounded-full border text-sm font-medium cursor-pointer disabled:opacity-100 disabled:bg-c1 disabled:text-c2 disabled:border-c1 ${v} ${c ?? ""}`}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export function Card({ children, class: c, dark, dashed }: { children: ComponentChildren; class?: string; dark?: boolean; dashed?: boolean }) {
  const base = dark ? "bg-c4 text-c0" : dashed ? "bg-transparent border-2 border-dashed border-c2" : "bg-c0";
  return <section class={`rounded-[var(--radius-card)] p-4 xl:p-5 min-w-0 ${base} ${c ?? ""}`}>{children}</section>;
}

export function CardTitle({ children, action }: { children: ComponentChildren; action?: ComponentChildren }) {
  return (
    <div class="flex items-center justify-between gap-2 mb-3">
      <h2 class="text-base font-semibold min-w-0">{children}</h2>
      {action}
    </div>
  );
}

export function Stat({ value, label, dark }: { value: string | number; label: string; dark?: boolean }) {
  return (
    <div class={`rounded-2xl px-1 py-2.5 xl:py-3 text-center min-w-0 ${dark ? "bg-c0 text-c4" : "bg-c1"}`}>
      <div class="num text-xl xl:text-2xl font-semibold">{value}</div>
      <div class="text-[11px] xl:text-xs mt-1 text-c3 leading-tight [overflow-wrap:normal] [word-break:keep-all]">{label}</div>
    </div>
  );
}

export function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div class="num text-5xl md:text-6xl font-semibold leading-none">{value}</div>
      <div class="text-sm mt-2 opacity-80">{label}</div>
    </div>
  );
}

export function Chip({ active, children, onClick }: { active?: boolean; children: ComponentChildren; onClick?: () => void }) {
  return (
    <button onClick={onClick} class={`h-8 px-4 rounded-full text-sm cursor-pointer whitespace-nowrap ${active ? "bg-c4 text-c0" : "bg-c1 text-c3"}`}>
      {children}
    </button>
  );
}

export function Tabs({ tabs }: { tabs: { href: string; label: string }[] }) {
  const { path, route } = useLocation();
  const current = [...tabs].sort((a, b) => b.href.length - a.href.length).find((t) => path === t.href || path.startsWith(t.href + "/"));
  return (
    <>
      {/* Phone: one compact switcher, nothing cropped */}
      <label class="md:hidden relative block">
        <span class="sr-only">Section</span>
        <select value={current?.href} onChange={(e) => route((e.target as HTMLSelectElement).value)}
          class="appearance-none w-full h-9 pl-3 pr-8 rounded-full truncate bg-c4 text-c0 font-medium text-sm">
          {tabs.map((t) => <option key={t.href} value={t.href}>{t.label}</option>)}
        </select>
        <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-c0 text-xs">▼</span>
      </label>
      {/* iPad + desktop: wrapping pills */}
      <nav class="hidden md:flex flex-wrap gap-2" aria-label="Sections">
        {tabs.map((t) => (
          <a key={t.href} href={t.href} aria-current={current?.href === t.href ? "page" : undefined}
            class={`h-8 xl:h-9 px-3 xl:px-4 inline-flex items-center rounded-full text-sm ${current?.href === t.href ? "bg-c4 text-c0" : "bg-c0 text-c3 hover:text-c4"}`}>
            {t.label}
          </a>
        ))}
      </nav>
    </>
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
    <span class={`inline-flex items-center gap-2 text-xs ${tone === "blocked" ? "font-semibold" : ""}`}>
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
    <div class="flex flex-col items-center justify-center text-center py-12 gap-3">
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
          <li key={rowKey(r)} onClick={onRow && (() => onRow(r))} class={`bg-c1 rounded-2xl p-3 ${onRow ? "cursor-pointer" : ""}`}>
            <div class="font-semibold mb-2 break-words">{head.render(r)}</div>
            <dl class="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {rest.map((c) => (
                <div key={c.key} class={`min-w-0 ${c.label ? "" : "col-span-2"}`}>
                  {c.label && <dt class="text-xs text-c3">{c.label}</dt>}
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
            {cols.map((c) => <th key={c.key} class={`font-medium py-2 pr-3 ${c.align === "right" ? "text-right" : ""} ${hid(c)}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} onClick={onRow && (() => onRow(r))} class={`border-t border-c1 align-top ${onRow ? "cursor-pointer hover:bg-c1" : ""}`}>
              {cols.map((c) => <td key={c.key} class={`py-2.5 pr-3 break-words ${c.align === "right" ? "text-right num whitespace-nowrap" : ""} ${hid(c)}`}>{c.render(r)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function Drawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ComponentChildren }) {
  if (!open) return null;
  return (
    <div class="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div class="absolute inset-0 bg-c4 opacity-40" onClick={onClose} />
      <aside class="relative bg-c0 w-full md:max-w-lg h-full overflow-y-auto p-4 md:p-6">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-xl font-semibold">{title}</h2>
          <button class="w-10 h-10 rounded-full bg-c1 flex items-center justify-center cursor-pointer" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        {children}
      </aside>
    </div>
  );
}

/** A page: fixed head (title, actions, tabs, toolbar) + its own scroll area. Nothing scrolls under the head. */
export function Page({ title, sub, actions, tabs, toolbar, children }: {
  title: string; sub?: string; actions?: ComponentChildren; tabs?: { href: string; label: string }[]; toolbar?: ComponentChildren; children: ComponentChildren;
}) {
  return (
    <div class="flex flex-col h-full min-h-0">
      {/* Fixed head. Phone: one row (title + section switcher). iPad/desktop: title, actions, tabs, toolbar kept compact. */}
      <div class="shrink-0 flex flex-col gap-2 xl:gap-2.5 px-3 md:px-5 2xl:px-7 py-2 md:py-3 border-b border-c2/40 bg-c1">
        <header class="flex items-center gap-3 min-w-0">
          <div class="min-w-0 flex-1 flex items-baseline gap-3">
            <h1 class="text-lg md:text-xl 2xl:text-2xl font-semibold leading-tight truncate">{title}</h1>
            {sub && <p class="hidden lg:block text-sm text-c3 truncate">{sub}</p>}
          </div>
          {tabs && <div class="md:hidden w-[48%] shrink-0"><Tabs tabs={tabs} /></div>}
          {actions && <div class="hidden md:flex flex-wrap justify-end gap-2 shrink-0">{actions}</div>}
        </header>
        {(tabs || toolbar) && (
          <div class="hidden md:flex flex-wrap items-center gap-x-4 gap-y-2">
            {tabs && <Tabs tabs={tabs} />}
            {toolbar && <div class="flex flex-wrap items-center gap-2 lg:ml-auto">{toolbar}</div>}
          </div>
        )}
      </div>
      {/* Only this area scrolls. On phone, actions + toolbar live here and scroll away. */}
      <div class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-5 2xl:px-7 py-3 md:py-4">
        <div class="flex flex-col gap-4 2xl:gap-6">
          {(actions || toolbar) && (
            <div class="md:hidden flex flex-col gap-2">
              {actions && <div class="flex flex-wrap gap-2">{actions}</div>}
              {toolbar}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

/** Section divider: label, count, a rule that runs to the edge, optional action. */
export function Section({ title, note, action, children }: { title: string; note?: string; action?: ComponentChildren; children: ComponentChildren }) {
  return (
    <section class="flex flex-col gap-3 min-w-0">
      <div class="flex items-center gap-3">
        <h2 class="text-xs font-semibold uppercase tracking-[0.12em] text-c3 whitespace-nowrap">{title}</h2>
        {note && <span class="num text-xs text-c3 whitespace-nowrap">{note}</span>}
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
      <div class="text-xs text-c3">{label}</div>
      <div class="font-semibold mt-0.5">{value}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ComponentChildren }) {
  return (
    <label class="flex flex-col gap-1.5 text-sm">
      <span class="text-c3">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "h-11 px-4 rounded-xl border border-c3 bg-c0 text-c4 placeholder:text-c2 w-full";
