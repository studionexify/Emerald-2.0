/** Records: every list row opens an inline pane — facts, edit form, retire/restore, duplicate, delete to Bin. */
import type { Signal } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { ask, Button, DetailHead, Field, inputCls } from "./index";
import { Menu, Reveal } from "./disclose";
import { log, me, toBin, uid, type LogKind } from "../data";

export type FType = "text" | "number" | "date" | "select" | "textarea" | "color";
export type FDef<T> = { k: keyof T & string; label: string; type?: FType; options?: string[] | (() => string[]); wide?: boolean; show?: (r: T) => ComponentChildren; hide?: boolean; suffix?: string;
  /** Form chunk. The first group is open; later groups sit behind a toggle. */ group?: string;
  /** Conditional input: rendered only when true for the current draft. */ when?: (r: T) => boolean };

/** Action row: one height, centred, evenly spaced. */
export const Actions = ({ children, end }: { children: ComponentChildren; end?: boolean }) => (
  <div class={`flex flex-wrap items-center gap-2 ${end ? "justify-end" : ""}`}>{children}</div>
);

/** Labelled values in an even two-column grid. */
export function Facts({ items }: { items: [string, ComponentChildren][] }) {
  return (
    <dl class="grid grid-cols-2 gap-x-4 gap-y-3">
      {items.map(([l, v]) => (
        <div key={l} class="min-w-0">
          <dt class="text-[11px] uppercase tracking-[0.08em] font-medium text-c3">{l}</dt>
          <dd class="text-sm font-semibold mt-0.5 break-words">{v === "" || v === undefined || v === null ? <span class="text-c2 font-normal">—</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Pane sub-heading. */
export const PaneSection = ({ title, children }: { title: string; children: ComponentChildren }) => (
  <section class="flex flex-col gap-2 pt-4 mt-4 border-t border-line">
    <h3 class="text-[11px] font-extrabold uppercase tracking-[0.14em]">{title}</h3>
    {children}
  </section>
);

export function Input<T>({ f, value, on }: { f: FDef<T>; value: unknown; on: (v: unknown) => void }) {
  const t = f.type ?? "text";
  const v = value ?? "";
  if (t === "select") {
    const opts = typeof f.options === "function" ? f.options() : f.options ?? [];
    return <select class={inputCls} value={String(v)} onChange={(e) => on((e.target as HTMLSelectElement).value)}>{!opts.includes(String(v)) && <option value={String(v)}>{String(v) || "—"}</option>}{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
  }
  if (t === "textarea") return <textarea class={`${inputCls} h-20 py-2`} value={String(v)} onInput={(e) => on((e.target as HTMLTextAreaElement).value)} />;
  if (t === "color") return <div class="flex items-center gap-2"><input type="color" class="h-10 w-12 rounded-lg border border-c3 bg-c0 shrink-0 cursor-pointer" value={String(v) || "#000000"} onInput={(e) => on((e.target as HTMLInputElement).value)} aria-label={f.label} /><input class={inputCls} value={String(v)} onInput={(e) => on((e.target as HTMLInputElement).value)} /></div>;
  const im = t === "number" ? { inputMode: (/qty|count|units|pcs|no$/i.test(f.k) ? "numeric" : "decimal") as "decimal", step: "any" }
    : /email/i.test(f.k) ? { type: "email" as const, inputMode: "email" as const, autoComplete: "email" }
    : /phone|mobile|whatsapp/i.test(f.k) ? { type: "tel" as const, inputMode: "tel" as const, autoComplete: "tel" }
    : /pin(code)?$|zip/i.test(f.k) ? { inputMode: "numeric" as const } : {};
  return <input class={inputCls} enterKeyHint="next" {...im} type={("type" in im ? im.type : t) as "text"} value={t === "number" && v === "" ? "" : String(v)} onInput={(e) => { const x = (e.target as HTMLInputElement).value; on(t === "number" ? (x === "" ? 0 : Number(x)) : x); }} />;
}

const groupsOf = <T,>(fields: FDef<T>[], r: T) => {
  const m = new Map<string, FDef<T>[]>();
  for (const f of fields) if (!f.hide && (!f.when || f.when(r))) { const g = f.group ?? ""; m.set(g, [...(m.get(g) ?? []), f]); }
  return [...m.entries()];
};

export function FormGrid<T>({ fields, draft, set }: { fields: FDef<T>[]; draft: T; set: (p: Partial<T>) => void }) {
  const grid = (fs: FDef<T>[]) => (
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fs.map((f) => (
        <div key={f.k} class={f.wide || f.type === "textarea" ? "sm:col-span-2" : ""}>
          <Field label={f.suffix ? `${f.label} (${f.suffix})` : f.label}><Input f={f} value={(draft as Record<string, unknown>)[f.k]} on={(v) => set({ [f.k]: v } as Partial<T>)} /></Field>
        </div>
      ))}
    </div>
  );
  const gs = groupsOf(fields, draft);
  if (gs.length < 2) return grid(gs[0]?.[1] ?? []);
  return (
    <div class="flex flex-col gap-1">
      {gs.map(([g, fs], i) => i === 0
        ? <div key={g}>{g && <h3 class="t-section mb-2">{g}</h3>}{grid(fs)}</div>
        : <div key={g} class="border-t border-line pt-1"><Reveal label={g} meta={`${fs.length} fields`}>{grid(fs)}</Reveal></div>)}
    </div>
  );
}

type Cfg<T> = {
  sig: Signal<T[]>; kind: string; title: (r: T) => string; fields: FDef<T>[]; blank: () => T;
  /** Read-only facts shown above the editable ones (derived figures). */ facts?: (r: T) => [string, ComponentChildren][];
  /** Extra sections in view mode (weigh-in, history…). */ extra?: (r: T, put: (p: Partial<T>, why?: string) => void) => ComponentChildren;
  /** Extra buttons in the action row. */ actions?: (r: T, put: (p: Partial<T>, why?: string) => void) => ComponentChildren;
  logKind?: LogKind; noDelete?: boolean; noDuplicate?: boolean; onSave?: (r: T, isNew: boolean) => void;
};

/** Hook: returns the open pane plus open/add handlers. Pass `detail` to <Page detail>. */
export function useRecord<T extends { id: string; active?: boolean }>(c: Cfg<T>) {
  const [id, setId] = useState<string | null>(null);
  const [draft, setDraft] = useState<T | null>(null);
  const [isNew, setNew] = useState(false);
  const cur = id ? c.sig.value.find((r) => r.id === id) ?? null : null;
  const close = () => { setId(null); setDraft(null); setNew(false); };
  const put = (r: T) => (p: Partial<T>, why?: string) => {
    c.sig.value = c.sig.value.map((x) => (x.id === r.id ? { ...x, ...p } : x));
    if (why) log(why, c.title({ ...r, ...p }), c.logKind ?? "stock");
  };
  const save = () => {
    if (!draft) return;
    if (isNew) { c.sig.value = [draft, ...c.sig.value]; log(`Added ${c.kind.toLowerCase()}`, c.title(draft), c.logKind ?? "stock"); }
    else { c.sig.value = c.sig.value.map((x) => (x.id === draft.id ? draft : x)); log(`Edited ${c.kind.toLowerCase()}`, c.title(draft), c.logKind ?? "stock"); }
    c.onSave?.(draft, isNew);
    setId(draft.id); setDraft(null); setNew(false);
  };
  const set = (p: Partial<T>) => setDraft((d) => (d ? { ...d, ...p } : d));

  let detail: ComponentChildren | null = null;
  if (draft) {
    detail = (
      <div>
        <DetailHead title={isNew ? `New ${c.kind.toLowerCase()}` : `Edit · ${c.title(draft)}`} onClose={close} />
        <FormGrid fields={c.fields} draft={draft} set={set} />
        <div class="mt-4"><Actions><Button icon="check" onClick={save}>Save</Button><Button variant="outline" onClick={() => (isNew ? close() : setDraft(null))}>Cancel</Button></Actions></div>
      </div>
    );
  } else if (cur) {
    const p = put(cur);
    const retired = cur.active === false;
    detail = (
      <div>
        <DetailHead title={c.title(cur)} onClose={close} />
        {retired && <p class="text-xs font-semibold bg-c1 rounded-lg px-3 py-2 mb-3">Retired — off every picker. Old records keep the name.</p>}
        <div class="mb-4 flex flex-wrap items-center gap-2">
          <Button icon="edit" onClick={() => setDraft({ ...cur })}>Edit</Button>
          {c.actions?.(cur, p)}
          <span class="flex-1" />
          <Menu label={`More for ${c.title(cur)}`} items={[
            { label: "Duplicate", hidden: !!c.noDuplicate, on: () => { const n = { ...cur, id: uid() }; c.sig.value = [n, ...c.sig.value]; log(`Duplicated ${c.kind.toLowerCase()}`, c.title(n), c.logKind ?? "stock"); setId(n.id); } },
            { label: retired ? "Restore" : "Retire", hidden: !("active" in cur), on: () => p({ active: retired } as Partial<T>, retired ? `Restored ${c.kind.toLowerCase()}` : `Retired ${c.kind.toLowerCase()}`) },
            { label: "Delete", danger: true, hidden: !!c.noDelete, on: () => { ask(`Delete ${c.title(cur)}? It goes to the Bin for 7 days.`, { ok: "Delete" }).then((ok) => { if (!ok) return; toBin(c.kind, cur, c.title(cur), me.value?.name ?? "You"); log(`Deleted ${c.kind.toLowerCase()}`, c.title(cur), c.logKind ?? "stock"); close(); }); } },
          ]} />
        </div>
        {c.facts && <Facts items={c.facts(cur)} />}
        {c.extra?.(cur, p)}
        <div class="mt-4 border-t border-line pt-1">
          {groupsOf(c.fields, cur).map(([g, fs]) => (
            <Reveal key={g} label={g || "All details"} meta={`${fs.length}`}>
              <Facts items={fs.map((f) => [f.label, f.show ? f.show(cur) : fmt((cur as Record<string, unknown>)[f.k], f.suffix)] as [string, ComponentChildren])} />
            </Reveal>
          ))}
        </div>
      </div>
    );
  }
  return {
    detail, cur, close,
    open: (r: T) => { setDraft(null); setNew(false); setId(r.id); },
    add: (init?: Partial<T>) => { setId(null); setNew(true); setDraft({ ...c.blank(), ...init }); },
  };
}

const fmt = (v: unknown, suffix?: string): ComponentChildren => (v === undefined || v === null || v === "" ? "" : typeof v === "number" ? `${v.toLocaleString("en-IN")}${suffix ? ` ${suffix}` : ""}` : String(v));

/** Read-only inspector for any row (ledgers, logs). */
export function Inspect({ title, row, onClose, children }: { title: string; row: Record<string, unknown>; onClose: () => void; children?: ComponentChildren }) {
  const items = Object.entries(row).filter(([k, v]) => k !== "id" && (typeof v !== "object" || v === null)).map(([k, v]) => [k.replace(/([A-Z])/g, " $1").replace(/^./, (x) => x.toUpperCase()), fmt(v)] as [string, ComponentChildren]);
  return <div><DetailHead title={title} onClose={onClose} />{children && <div class="mb-4">{children}</div>}<Facts items={items} /></div>;
}

/** Page-wide quick inspector: any table row can `peek` itself into the page's detail column. */
import { signal } from "@preact/signals";
export const inspectSig = signal<{ title: string; row: Record<string, unknown> } | null>(null);
export const peek = (r: unknown) => {
  const o = r as Record<string, unknown>;
  inspectSig.value = { title: String(o.no ?? o.note ?? o.party ?? o.head ?? o.name ?? o.title ?? o.item ?? o.label ?? o.m ?? "Entry"), row: o };
};
export const Peeked = () => inspectSig.value && <Inspect title={inspectSig.value.title} row={inspectSig.value.row} onClose={() => (inspectSig.value = null)} />;
