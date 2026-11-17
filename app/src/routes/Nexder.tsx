/** Nexder: the studio's library of designs. Originals live in Google Drive, previews in Supabase Storage; Emerald keeps no files. */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { lazy } from "../router";
import { ask, Button, DetailHead, Empty, Field, Icon, inputCls, Page, Sheet } from "../ui";
import { inr, log, me, ordersSig, shortDate, usersSig, can, type Order } from "../data";
import {
  addCategory, assignable, catsOf, assignToOrder, blankDraft, buildPack, canStream, catName, checkDrive, deleteDesign, downloadFile, draftOf, draftReady, driveSpace, fmtBytes, incomplete, reupload, usedIn, LIMITS, markSeen, materialUsage,
  MEMORY_ZIP, newBytes, nexderCatsSig, nexderDesignsSig, nexderReady, nextCode, nextNo, openSink, packBytes, packPlan, previewBytes, previewUrl, saveDraft, sharedWithMe, shareDesigns, sweepOrphans, syncTrash, unseenShares,
  type Check, type Draft, type DraftItem, type NxDesign, type NxSize, type Progress, type Space,
} from "../data/nexder";
import { uid } from "../data/store";
import { isQueued, uploadsSig } from "../data/nexder-queue";
import type { Use, WorkbenchProps } from "./nexcal/Workbench";

/* ---------------------------------------------------------------- small helpers */
/** Object URL of one photo's small preview ("" until it arrives). */
function usePreview(id?: string, ref?: { current: Element | null }): string {
  const [u, setU] = useState(""), [near, setNear] = useState(!ref);
  /* a card far below the fold fetches nothing until it is about to scroll into view */
  useEffect(() => {
    if (near || !ref?.current) return;
    if (typeof IntersectionObserver !== "function") { setNear(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(ref.current); return () => io.disconnect();
  }, [near, id]);
  useEffect(() => { let live = true; setU(""); if (id && near) previewUrl(id).then((x) => live && setU(x)); return () => { live = false; }; }, [id, near]);
  return u;
}
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const kind = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? "file").toUpperCase();
const g = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
const chipCls = "inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold whitespace-nowrap";
const Ph = () => <span class="w-full h-full flex items-center justify-center text-c2"><Icon name="image" size={22} /></span>;

/** A stored photo's small preview, or a placeholder. */
function Pic({ id, alt, class: cls = "" }: { id?: string; alt: string; class?: string }) {
  const box = useRef<HTMLSpanElement>(null), src = usePreview(id, box);
  return <span ref={box} class="block w-full h-full">{src ? <img src={src} alt={alt} loading="lazy" decoding="async" class={`w-full h-full object-cover ${cls}`} /> : <Ph />}</span>;
}
function Local({ item, alt }: { item: DraftItem; alt: string }) {
  const url = useMemo(() => (item.file ? URL.createObjectURL(item.file) : ""), [item.file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const stored = usePreview(item.file ? undefined : item.id), src = url || stored;
  return src ? <img src={src} alt={alt} class="w-full h-full object-cover" /> : <Ph />;
}
/** A text field that grows with what is typed, so a long name is always fully visible. */
function Grow({ value, placeholder, onInput }: { value: string; placeholder?: string; onInput: (v: string) => void }) {
  const r = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const t = r.current; if (t) { t.style.height = "auto"; t.style.height = t.scrollHeight + 2 + "px"; } };
  useEffect(fit, [value]);
  return <textarea ref={r} rows={1} value={value} placeholder={placeholder} aria-label="Name" onInput={(e) => { onInput((e.target as HTMLTextAreaElement).value.replace(/\n/g, " ")); fit(); }} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()}
    class="w-full min-h-8 px-3 py-[5px] rounded-xl border border-line bg-c0 text-c4 text-[13px] placeholder:text-c2 focus:border-c4 outline-none resize-none overflow-hidden leading-snug" />;
}
const Row = ({ title, meta, open, children }: { title: string; meta?: ComponentChildren; open?: boolean; children: ComponentChildren }) => (
  <details open={open} class="rounded-xl border border-line bg-c0 min-w-0">
    <summary class="flex items-center gap-2 px-3 py-2.5"><span class="text-[13px] font-semibold">{title}</span><span class="t-meta min-w-0 flex-1 break-words">{meta}</span><span class="chev text-c3 inline-flex"><Icon name="right" size={13} /></span></summary>
    <div class="px-3 pb-3 grid gap-2.5">{children}</div>
  </details>
);
const Seg = <T extends string>({ value, on, items }: { value: T; on: (v: T) => void; items: [T, string][] }) => (
  <div class="inline-flex rounded-full bg-c1 p-0.5 max-w-full flex-wrap">{items.map(([k, l]) => <button type="button" key={k} aria-pressed={value === k} onClick={() => on(k)} class={`h-7 px-3 !min-h-0 rounded-full text-[12px] cursor-pointer ${value === k ? "bg-c4 text-c0 font-semibold" : "text-c3 font-medium"}`}>{l}</button>)}</div>
);

/* ---------------------------------------------------------------- page */
type Panel = null | { k: "new" } | { k: "edit"; id: string } | { k: "view"; id: string };
type Dlg = null | "pack" | "share" | "assign" | "storage" | "cats" | "manage" | "price" | "dup" | "del";
const AssignCats = lazy<{ ds: NxDesign[]; onClose: (done?: boolean) => void }>(() => import("./NexderCats").then((m) => m.AssignCats));
const BulkDialog = lazy<{ kind: "price" | "dup" | "del"; ds: NxDesign[]; onClose: (done?: boolean) => void }>(() => import("./NexderCats").then((m) => m.BulkDialog));
const csv = (ds: NxDesign[]) => import("../data/nexder-cats").then((m) => m.exportCsv(ds));
const ManageCats = lazy<{ onClose: () => void }>(() => import("./NexderCats").then((m) => m.ManageCats));

/* ---- how the page is laid out and ordered (remembered on this device) ---- */
type SortKey = "no" | "name" | "cat" | "price" | "size" | "g" | "min" | "added" | "files";
const SORTS: [SortKey, string][] = [["no", "Number"], ["name", "Name"], ["cat", "Category"], ["price", "Price"], ["size", "Size (mm)"], ["g", "Weight"], ["min", "Print time"], ["added", "Date added"], ["files", "File size"]];
type ColKey = "no" | "cats" | "price" | "size" | "g" | "min" | "files" | "added";
/** The columns of the list view, in this order after the always-present Name. */
const COLDEFS: { k: ColKey; label: string; w: string; sort: SortKey; right?: boolean }[] = [
  { k: "no", label: "No.", w: "64px", sort: "no" }, { k: "cats", label: "Categories", w: "minmax(0,1.4fr)", sort: "cat" }, { k: "price", label: "Price", w: "76px", sort: "price", right: true },
  { k: "size", label: "Size", w: "80px", sort: "size", right: true }, { k: "g", label: "Weight", w: "80px", sort: "g", right: true }, { k: "min", label: "Time", w: "88px", sort: "min", right: true },
  { k: "files", label: "File size", w: "84px", sort: "files", right: true }, { k: "added", label: "Added", w: "92px", sort: "added", right: true },
];
const DEFAULT_COLS: ColKey[] = ["no", "cats", "price", "g", "min"];
type Prefs = { layout: "cards" | "list"; sort: SortKey; dir: 1 | -1; group: boolean; cols: ColKey[] };
const PREFS = "nexderView";
const loadPrefs = (): Prefs => { const d: Prefs = { layout: "cards", sort: "no", dir: 1, group: true, cols: DEFAULT_COLS }; try { const x = JSON.parse(localStorage.getItem(PREFS) ?? "{}"); return { layout: x.layout === "list" ? "list" : "cards", sort: SORTS.some(([k]) => k === x.sort) ? x.sort : d.sort, dir: x.dir === -1 ? -1 : 1, group: x.group !== false, cols: Array.isArray(x.cols) ? COLDEFS.map((c) => c.k).filter((k) => x.cols.includes(k)) : DEFAULT_COLS }; } catch { return d; } };
const top = (n: (number | undefined)[]) => { const v = n.filter((x): x is number => !!x); return v.length ? Math.max(...v) : undefined; };
/** What a design is ordered by. Several sizes count as the largest one. */
const metric = (d: NxDesign, k: SortKey): number | string | undefined => {
  switch (k) {
    case "no": return d.no; case "name": return d.name.toLowerCase(); case "added": return d.created; case "price": return d.price || undefined;
    case "cat": return catsOf(d).map(catName).sort((a, b) => a.localeCompare(b))[0]?.toLowerCase();
    case "size": return top(d.sizes?.map((s) => s.mm) ?? []); case "g": return top(d.sizes?.map((s) => s.g) ?? []); case "min": return top(d.sizes?.map((s) => s.min) ?? []);
    case "files": return d.files.reduce((a, f) => a + f.size, 0) || undefined;
  }
};
/** Missing values go last whichever way the list is turned, like a file manager. */
const order = (k: SortKey, dir: 1 | -1) => (a: NxDesign, b: NxDesign) => {
  const x = metric(a, k), y = metric(b, k);
  if (x === undefined || y === undefined) return x === y ? a.no.localeCompare(b.no) : x === undefined ? 1 : -1;
  const r = typeof x === "string" ? x.localeCompare(y as string, undefined, { numeric: true }) : x - (y as number);
  return dir * r || a.no.localeCompare(b.no);
};
const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
/** The grid template for the chosen columns: thumbnail, number, name (the one that grows), then the rest. */
const tpl = (cols: ColKey[]) => ["44px", ...(cols.includes("no") ? ["64px"] : []), "minmax(0,2fr)", ...COLDEFS.filter((c) => c.k !== "no" && cols.includes(c.k)).map((c) => c.w)].join(" ");
function Cell({ d, k }: { d: NxDesign; k: ColKey }) {
  const mm = top(d.sizes?.map((x) => x.mm) ?? []), gr = top(d.sizes?.map((x) => x.g) ?? []), mn = top(d.sizes?.map((x) => x.min) ?? []), fs = d.files.reduce((a, f) => a + f.size, 0);
  const num = "hidden md:block text-right num text-[13px]";
  switch (k) {
    case "no": return <span class="hidden md:block num text-[13px] text-c3">{d.no}</span>;
    case "cats": { const ids = catsOf(d); return <span class="hidden md:flex flex-wrap gap-1 min-w-0">{ids.length ? ids.map((id) => <span key={id} class={`${chipCls} bg-c1 text-c3 max-w-full truncate`}>{catName(id)}</span>) : <span class="t-meta">—</span>}</span>; }
    case "price": return <span class={num}>{d.price ? inr(d.price) : "—"}</span>;
    case "size": return <span class={num}>{mm ? `${mm} mm` : "—"}</span>;
    case "g": return <span class={num}>{gr ? `${gr} g` : "—"}</span>;
    case "min": return <span class={num}>{mn ? mins(mn) : "—"}</span>;
    case "files": return <span class={num}>{fs ? mb(fs) : "—"}</span>;
    case "added": return <span class="hidden md:block text-right t-meta">{shortDate(d.created)}</span>;
  }
}

export default function Nexder() {
  const designs = nexderDesignsSig.value, cats = nexderCatsSig.value.filter((c) => !c.archived);
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [view, setView] = useState<"all" | "shared">("all");
  useEffect(() => { if (cat && cat !== "__none" && !cats.some((c) => c.id === cat)) setCat(""); }, [cat, cats.length]);
  const [pf, setPf] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>) => setPf((o) => { const n = { ...o, ...p }; try { localStorage.setItem(PREFS, JSON.stringify(n)); } catch { /* private mode: the choice just isn't remembered */ } return n; });
  /** Clicking a column: same column flips the direction, another column starts ascending. */
  const sortBy = (k: SortKey) => setPrefs(pf.sort === k ? { dir: (pf.dir * -1) as 1 | -1 } : { sort: k, dir: 1 });
  const [panel, setPanel] = useState<Panel>(null), [dlg, setDlg] = useState<Dlg>(null);
  /** off → pick (tapping cards ticks them, nothing is lost by searching or changing category) → act (Finish selection: share, pack, assign) */
  const [mode, setMode] = useState<"off" | "pick" | "act">("off"), [sel, setSel] = useState<string[]>([]);
  const selecting = mode === "pick";
  const writable = can("nexder", "full") && nexderReady;
  const shared = sharedWithMe(), unseen = unseenShares().length;
  useEffect(() => { if (nexderReady) { syncTrash(); if (can("nexder", "full")) sweepOrphans(); } }, []);
  useEffect(() => { if (view === "shared") markSeen(); }, [view, shared.length]);
  const pool = view === "shared" ? designs.filter((d) => shared.some((s) => s.designIds.includes(d.id))) : designs;
  const list = pool.filter((d) => (!cat || (cat === "__none" ? !catsOf(d).length : catsOf(d).includes(cat))) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()) || d.no.includes(q.trim())));
  const by = (id: string) => designs.find((d) => d.id === id);
  const picked = sel.map(by).filter(Boolean) as NxDesign[];
  const open = panel && panel.k !== "new" ? by(panel.id) : undefined;
  useEffect(() => { if (panel && panel.k !== "new" && !open) setPanel(null); }, [panel, open]);
  const stopSelect = () => { setMode("off"); setSel([]); };
  const flip = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const tap = (d: NxDesign) => (selecting ? flip(d.id) : setPanel({ k: "view", id: d.id }));
  /* designs by category, every category open, the way the Filament tab groups by material. A design in two categories shows in both. */
  const sorted = [...list].sort(order(pf.sort, pf.dir));
  const named = cats.filter((c) => !cat || c.id === cat).map((c) => ({ c: c as { id: string; name: string } | null, ds: sorted.filter((d) => catsOf(d).includes(c.id)) })).sort((a, b) => a.c!.name.localeCompare(b.c!.name) * (pf.sort === "cat" ? pf.dir : 1));
  const loose = cat && cat !== "__none" ? [] : sorted.filter((d) => !catsOf(d).length);
  const groups = (pf.group ? [...named, { c: null, ds: loose }] : [{ c: { id: "all", name: "All designs" }, ds: sorted }]).filter((g) => g.ds.length);
  const allIds = sorted.map((d) => d.id), everyShown = allIds.length > 0 && allIds.every((id) => sel.includes(id));

  const detail = !panel ? null : panel.k === "view" && open
    ? <ViewPanel d={open} writable={writable} onClose={() => setPanel(null)} onEdit={() => setPanel({ k: "edit", id: open.id })}
        onShare={() => { setSel([open.id]); setDlg("share"); }} onAssign={() => { setSel([open.id]); setDlg("assign"); }} />
    : null;
  const windowOpen = panel && (panel.k === "new" || panel.k === "edit");

  return (
    <Page title="Nexder" sub="Designs, photos and files. Photos and files are kept in Google Drive; Emerald shows small copies."
      actions={<>{writable && <Button variant="outline" icon="folder" onClick={() => setDlg("manage")}>Categories</Button>}{sorted.length > 0 && <Button variant="outline" icon="out" onClick={() => csv(sorted)}>Export CSV</Button>}{nexderReady && designs.length > 0 && <Button variant="outline" icon="archive" onClick={() => setDlg("storage")}>Storage</Button>}
        {designs.length > 0 && (mode === "off" ? <Button variant="outline" onClick={() => { setMode("pick"); setPanel(null); }}>Select</Button> : <Button variant="outline" onClick={stopSelect}>Cancel selection</Button>)}
        {writable && <Button icon="plus" onClick={() => { setPanel({ k: "new" }); }}>New design</Button>}</>}
      toolbar={<>
        <label class="relative w-full md:w-[260px]"><span class="sr-only">Search designs</span><span class="absolute left-3 top-2.5 text-c2 pointer-events-none"><Icon name="search" size={13} /></span>
          <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Name or number" class={`${inputCls} !pl-8`} /></label>
        <select aria-label="Category" value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)} class={`${inputCls} !w-auto cursor-pointer`}>
          <option value="">All categories</option><option value="__none">Uncategorized · {designs.filter((d) => !catsOf(d).length).length}</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name} · {designs.filter((d) => catsOf(d).includes(c.id)).length}</option>)}</select>
        <select aria-label="Sort by" value={pf.sort} onChange={(e) => setPrefs({ sort: (e.target as HTMLSelectElement).value as SortKey, dir: 1 })} class={`${inputCls} !w-auto cursor-pointer`}>{SORTS.map(([k, l]) => <option key={k} value={k}>Sort: {l}</option>)}</select>
        <button type="button" aria-label={pf.dir === 1 ? "Ascending. Press for descending" : "Descending. Press for ascending"} title={pf.dir === 1 ? "Ascending (A→Z, low→high, old→new)" : "Descending (Z→A, high→low, new→old)"} onClick={() => setPrefs({ dir: (pf.dir * -1) as 1 | -1 })} class="h-8 w-8 !min-h-0 shrink-0 rounded-lg border border-line bg-c0 inline-flex items-center justify-center cursor-pointer"><span class={`inline-flex ${pf.dir === -1 ? "rotate-180" : ""}`}><Icon name="down" size={14} /></span></button>
        <select aria-label="Group by" value={pf.group ? "cat" : "none"} onChange={(e) => setPrefs({ group: (e.target as HTMLSelectElement).value === "cat" })} class={`${inputCls} !w-auto cursor-pointer`}><option value="cat">Group: Category</option><option value="none">Group: None</option></select>
        <Seg value={pf.layout} on={(v) => setPrefs({ layout: v })} items={[["cards", "Cards"], ["list", "List"]]} />
        {pf.layout === "list" && <details class="relative hidden md:block"><summary class="h-8 px-3 rounded-lg border border-line bg-c0 text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer list-none"><Icon name="rows" size={13} /> Columns</summary>
          <div class="absolute z-30 mt-1 w-48 rounded-xl border border-line bg-c0 shadow-xl p-2 grid gap-0.5">
            <label class="flex items-center gap-2 px-2 h-8 text-[13px] text-c3"><input type="checkbox" checked disabled /> Name</label>
            {COLDEFS.map((c) => <label key={c.k} class="flex items-center gap-2 px-2 h-8 text-[13px] cursor-pointer"><input type="checkbox" checked={pf.cols.includes(c.k)} onChange={() => setPrefs({ cols: pf.cols.includes(c.k) ? pf.cols.filter((x) => x !== c.k) : COLDEFS.map((d) => d.k).filter((k) => k === c.k || pf.cols.includes(k)) })} /> {c.label}</label>)}
            <button type="button" onClick={() => setPrefs({ cols: DEFAULT_COLS })} class="text-[12px] underline text-c3 text-left px-2 h-7 !min-h-0 cursor-pointer">Reset</button></div></details>}
        {shared.length > 0 && <Seg value={view} on={setView} items={[["all", "All"], ["shared", `Shared with me${unseen ? ` · ${unseen} new` : ""}`]]} />}
      </>}
      detail={detail}>
      {view === "shared" && shared.length > 0 && <div class="grid gap-1.5">{shared.map((s) => (
        <p key={s.id} class="rounded-xl bg-c0 px-3 py-2 text-[13px] break-words"><b>{usersSig.value.find((u) => u.id === s.by)?.name ?? "Someone"}</b> shared {s.designIds.length} design{s.designIds.length > 1 ? "s" : ""} · {shortDate(s.at)}{s.note ? <span class="text-c3"> · “{s.note}”</span> : null}</p>))}</div>}
      {writable && !uploadsSig.value.length && designs.some((d) => incomplete(d).length) && <p role="status" class="rounded-xl bg-amb-bg text-amb px-3 py-2 text-[13px]">Some files were saved but never reached Google Drive, because the tab was closed or the upload was stopped. Open a design marked “Upload incomplete” and press Upload again for each file.</p>}
      {!nexderReady && <p role="status" class="rounded-xl bg-amb-bg text-amb px-3 py-2 text-[13px]">Nexder keeps its files in Google Drive, so it needs cloud sync. Sign in to cloud sync to add or open files.</p>}
      {!designs.length
        ? <div class="rounded-[var(--radius-card)] bg-c0 p-8"><Empty title="No designs yet" action={writable ? <Button icon="plus" class="mt-2" onClick={() => setPanel({ k: "new" })}>New design</Button> : undefined} /></div>
        : !list.length ? <div class="rounded-[var(--radius-card)] bg-c0 p-8"><Empty title="Nothing matches" action={<button class="underline text-[13px]" onClick={() => { setQ(""); setCat(""); setView("all"); }}>Clear filters</button>} /></div>
        : <div class="grid gap-6">
          {pf.layout === "list" && <div role="row" style={{ "--cols": tpl(pf.cols) } as never} class="hidden md:grid md:[grid-template-columns:var(--cols)] items-center gap-3 px-3 -mb-3 text-[12px] font-semibold text-c3">
            <span />
            {[...(pf.cols.includes("no") ? [COLDEFS[0]] : []), { k: "name" as const, label: "Name", w: "", sort: "name" as SortKey, right: false }, ...COLDEFS.filter((c) => c.k !== "no" && pf.cols.includes(c.k))].map((c) => (
              <button key={c.k} type="button" onClick={() => sortBy(c.sort)} aria-label={`Sort by ${c.label}`} class={`!min-h-0 h-7 inline-flex items-center gap-1 cursor-pointer hover:text-c4 ${c.right ? "justify-end" : ""} ${pf.sort === c.sort ? "text-c4" : ""}`}>{c.label}{pf.sort === c.sort && <span class={`inline-flex ${pf.dir === -1 ? "rotate-180" : ""}`}><Icon name="down" size={11} /></span>}</button>))}
          </div>}
          {groups.map(({ c, ds }) => { const all = ds.every((d) => sel.includes(d.id)); return (
          <section key={c?.id ?? "none"} aria-label={c?.name ?? "Uncategorized"} style={{ contentVisibility: "auto", containIntrinsicSize: "auto 260px" }}>
            <div class="flex items-center gap-2 pb-2 border-b-2 border-c4/25">
              <b class="text-[14px] tracking-[0.04em]">{c?.name ?? "Uncategorized"}</b><span class="t-meta">{ds.length} design{ds.length > 1 ? "s" : ""}</span>
              {selecting && <button type="button" onClick={() => setSel((x) => (all ? x.filter((id) => !ds.some((d) => d.id === id)) : [...new Set([...x, ...ds.map((d) => d.id)])]))} class="ml-auto text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">{all ? (c?.id === "all" ? "Unselect all" : "Unselect category") : (c?.id === "all" ? "Select all" : "Select category")}</button>}
            </div>
            {pf.layout === "list"
              ? <div class="mt-2 grid divide-y divide-line rounded-2xl bg-c0 overflow-hidden">{ds.map((d) => {
                  const on = sel.includes(d.id), cur = open?.id === d.id, gr = top(d.sizes?.map((x) => x.g) ?? []), mn = top(d.sizes?.map((x) => x.min) ?? []);
                  return (
                    <button type="button" key={d.id} onClick={() => tap(d)} aria-pressed={mode !== "off" ? on : undefined} aria-label={`${d.name}, ${d.no}`} style={{ "--cols": tpl(pf.cols) } as never}
                      class={`grid grid-cols-[44px_minmax(0,1fr)] md:[grid-template-columns:var(--cols)] items-center gap-3 px-3 py-2 text-left cursor-pointer !min-h-0 ${on ? "bg-c1" : cur ? "bg-c1/60" : ""}`}>
                      <span class="relative block w-11 h-11 rounded-lg overflow-hidden bg-c1"><Pic id={d.photos[0]?.id} alt="" />
                        {mode !== "off" && <span class={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full flex items-center justify-center ${on ? "bg-c4 text-c0" : "bg-c0/90 border border-c2/40"}`}>{on && <Icon name="check" size={10} />}</span>}</span>
                      {pf.cols.includes("no") && <Cell d={d} k="no" />}
                      <span class="min-w-0"><b class="block text-[13px] font-semibold leading-snug break-words">{d.name}</b>
                        <span class="md:hidden block t-meta mt-0.5"><span class="num">{d.no}</span>{d.price ? ` · ${inr(d.price)}` : ""}{gr ? ` · ${gr} g` : ""}{mn ? ` · ${mins(mn)}` : ""}</span>
                        {incomplete(d).length > 0 && <span class={`${chipCls} bg-amb-bg text-amb mt-1`}>Upload incomplete</span>}
                        <span class="md:hidden flex flex-wrap gap-1 mt-1">{catsOf(d).map((id) => <span key={id} class={`${chipCls} bg-c1 text-c3 max-w-full truncate`}>{catName(id)}</span>)}</span></span>
                      {COLDEFS.filter((c) => c.k !== "no" && pf.cols.includes(c.k)).map((c) => <Cell key={c.k} d={d} k={c.k} />)}
                    </button>);
                })}</div>
              : <div class="grid gap-3 items-start grid-cols-[repeat(auto-fill,minmax(160px,1fr))] mt-3">{ds.map((d) => {
                  const on = sel.includes(d.id), cur = open?.id === d.id;
                  return (
                    <button type="button" key={d.id} onClick={() => tap(d)} aria-pressed={mode !== "off" ? on : undefined} aria-label={`${d.name}, ${d.no}`}
                      class={`relative flex flex-col items-stretch justify-start text-left rounded-[20px] bg-c0 overflow-hidden min-w-0 cursor-pointer !p-0 ${on ? "ring-2 ring-c4" : cur ? "ring-2 ring-acc" : ""}`}>
                      <span class="block aspect-[4/3] bg-c1"><Pic id={d.photos[0]?.id} alt="" /></span>
                      {incomplete(d).length > 0 && <span class="absolute top-2.5 right-2.5 rounded-full bg-amb-bg text-amb text-[11px] font-semibold px-2 h-5 inline-flex items-center">Upload incomplete</span>}
                      {mode !== "off" && <span class={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full flex items-center justify-center ${on ? "bg-c4 text-c0" : "bg-c0/90 border border-c2/40"}`}>{on && <Icon name="check" size={14} />}</span>}
                      <span class="block px-3 pt-2.5 pb-3"><b class="block text-[13px] font-semibold leading-snug break-words">{d.name}</b><span class="block t-meta mt-0.5 break-words"><span class="num">{d.no}</span>{catsOf(d).length > 1 ? ` · ${catsOf(d).length} categories` : ""}</span></span>
                    </button>);
                })}</div>}
          </section>); })}</div>}
      {mode !== "off" && (
        <div class="sticky bottom-2 flex justify-center pointer-events-none z-20">
          <div class="pointer-events-auto inline-flex flex-wrap justify-center items-center gap-1 min-h-12 pl-4 pr-1.5 py-1 rounded-3xl bg-c4 text-c0 shadow-xl max-w-full">
            <span class="text-[13px] font-semibold mr-2 whitespace-nowrap">{sel.length} selected{mode === "pick" ? " · tap cards, search and filter freely" : ""}</span>
            {mode === "pick" ? <>
              <button type="button" onClick={() => setSel(everyShown ? sel.filter((id) => !allIds.includes(id)) : [...new Set([...sel, ...allIds])])} class="h-9 px-3 !min-h-0 rounded-full text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer">{everyShown ? "Unselect shown" : `Select all shown (${allIds.length})`}</button>
              {sel.length > 0 && <button type="button" onClick={() => setSel([])} class="h-9 px-3 !min-h-0 rounded-full text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer">Clear</button>}
              <button type="button" disabled={!sel.length} onClick={() => setMode("act")} class="h-9 px-4 !min-h-0 rounded-full bg-c0 text-c4 text-[13px] font-semibold whitespace-nowrap cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"><Icon name="check" size={14} /> Finish selection</button>
            </> : <>
              {([["share", "Share", "share"], ["zip", "Client pack", "pack"], ["link", "Assign to order", "assign"], ["folder", "Categories", "cats"], ["money", "Price", "price"], ["copy", "Duplicate", "dup"], ["bin", "Delete", "del"]] as const).filter(([, , k]) => k === "share" || writable).map(([i, l, k]) => (
                <button key={k} type="button" onClick={() => setDlg(k as Dlg)} class="h-9 px-3 !min-h-0 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer"><Icon name={i} size={15} />{l}</button>))}
              <button type="button" onClick={() => csv(picked)} class="h-9 px-3 !min-h-0 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer"><Icon name="out" size={15} />CSV</button>
              <button type="button" onClick={() => setMode("pick")} class="h-9 px-3 !min-h-0 rounded-full text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer">Change selection</button>
              <button type="button" aria-label="Clear selection" onClick={stopSelect} class="w-9 h-9 !min-h-0 rounded-full inline-flex items-center justify-center hover:bg-c0/15 cursor-pointer"><Icon name="close" size={14} /></button>
            </>}
          </div>
        </div>)}
      {dlg === "storage" && <StorageSheet writable={can("nexder", "full")} onClose={() => setDlg(null)} />}
      {windowOpen && <DesignWindow key={panel.k === "edit" ? panel.id : "new"} editId={panel.k === "edit" ? panel.id : undefined} presetCat={cat} onClose={() => setPanel(panel.k === "edit" ? { k: "view", id: panel.id } : null)} onSaved={(d) => setPanel({ k: "view", id: d.id })} />}
      {(dlg === "price" || dlg === "dup" || dlg === "del") && <BulkDialog kind={dlg} ds={picked} onClose={(done) => { setDlg(null); if (done) stopSelect(); }} />}
      {dlg === "manage" && <ManageCats onClose={() => setDlg(null)} />}
      {dlg === "cats" && <AssignCats ds={picked} onClose={() => setDlg(null)} />}
      {dlg === "pack" && <PackModal initial={picked} onClose={() => setDlg(null)} />}
      {dlg === "share" && <ShareModal ds={picked} onClose={(done) => { setDlg(null); if (done) stopSelect(); }} />}
      {dlg === "assign" && <AssignModal ds={picked} onClose={(done) => { setDlg(null); if (done) stopSelect(); }} />}
    </Page>
  );
}

/* ---------------------------------------------------------------- view panel */
function ViewPanel({ d, writable, onClose, onEdit, onShare, onAssign }: { d: NxDesign; writable: boolean; onClose: () => void; onEdit: () => void; onShare: () => void; onAssign: () => void }) {
  const [i, setI] = useState(0), [busy, setBusy] = useState(""), [missing, setMissing] = useState("");
  const ph = d.photos[Math.min(i, d.photos.length - 1)];
  const usage = materialUsage(d.id), total = usage.reduce((a, u) => a + u.total, 0);
  useEffect(() => { setI(0); setMissing(""); }, [d.id]);
  const get = async (f: { id: string; name: string; drive?: string }) => { setBusy(f.id); setMissing(""); setMissing((await downloadFile(f)) ?? ""); setBusy(""); };
  const all = async () => { for (const f of d.files) { await get(f); await new Promise((r) => setTimeout(r, 600)); } };
  /* the browser asks where to save first (needs the click), then the photos are fetched from Drive one by one into the zip */
  const zipPhotos = async () => {
    const sink = await openSink(`${d.name} photos.zip`); if (!sink) return;
    setBusy("zip"); setMissing("");
    try { const r = await buildPack([d], { images: "all" }, sink, () => {}); if (r.missing) setMissing(`${r.missing} photo${r.missing > 1 ? "s" : ""} could not be fetched from Google Drive.`); } catch (e) { setMissing((e as Error).message); }
    setBusy("");
  };
  return (
    <div class="flex flex-col min-h-full gap-3.5">
      <DetailHead title={d.name} onClose={onClose} />
      <div>
        <div class="aspect-[5/3] rounded-2xl overflow-hidden bg-c1"><Pic id={ph?.id} alt={d.name} /></div>
        {d.photos.length > 1 && <div class="flex gap-2 mt-2 flex-wrap">{d.photos.map((p, k) => (
          <button key={p.id} type="button" onClick={() => setI(k)} aria-label={`Photo ${k + 1}`} aria-pressed={k === i} class={`w-11 h-11 !min-h-0 rounded-lg overflow-hidden bg-c1 p-0 cursor-pointer ${k === i ? "ring-2 ring-c4" : ""}`}><Pic id={p.id} alt="" /></button>))}</div>}
      </div>
      <div class="flex items-end gap-3 flex-wrap"><div class="min-w-0 flex-1"><div class="t-meta">Number</div><div class="num text-[24px] font-semibold leading-none mt-0.5">{d.no}</div></div>
        <div class="text-right min-w-0"><div class="t-meta">{catsOf(d).length > 1 ? "Categories" : "Category"}</div><div class="mt-1 flex flex-wrap justify-end gap-1">{catsOf(d).length ? catsOf(d).map((id) => <span key={id} class={`${chipCls} bg-c1 text-c3`}>{catName(id)}</span>) : <span class="t-meta">None</span>}</div></div></div>
      {(d.price || d.sizes?.length) && <div class="grid gap-1 text-[13px]">
        {d.price ? <div class="flex justify-between gap-3"><span class="text-c3">Price</span><b class="num">{inr(d.price)}</b></div> : null}
        {d.sizes?.map((s) => <div key={s.label} class="flex justify-between gap-3"><span class="text-c3">Size {s.label}{s.mm ? ` · ${s.mm} mm` : ""} <span class={`text-[11px] font-semibold ${s.sliced ? "text-grn" : "text-amb"}`}>{s.sliced ? "sliced" : "estimated"}</span></span><b class="num">{s.g} g{s.min ? ` · ${s.min >= 60 ? `${Math.floor(s.min / 60)} h ${s.min % 60} min` : `${s.min} min`}` : ""}</b></div>)}</div>}
      {d.desc && <p class="text-[13px] text-c3 whitespace-pre-wrap break-words">{d.desc}</p>}
      <div>
        <div class="flex items-center justify-between mb-1.5"><span class="t-section">Files</span>{writable && d.files.length > 1 && <button type="button" onClick={all} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Download all</button>}</div>
        {d.files.length ? <div class="grid gap-1.5">{d.files.map((f) => (
          <div key={f.id} class="flex items-center gap-2.5 rounded-xl bg-c1/60 px-2.5 py-2"><span class="text-c3"><Icon name="file" size={15} /></span>
            <span class="min-w-0 flex-1"><b class="block text-[13px] font-medium break-all">{f.name}</b><span class="t-meta">{kind(f.name)} · {mb(f.size)} · {f.drive ? "original in Google Drive" : isQueued(d.id, f.id) ? "uploading…" : f.pend ? "not uploaded yet" : "not in Drive"}</span></span>
            {writable && f.pend && !f.drive ? (isQueued(d.id, f.id) ? null : <Reup d={d} kind="file" id={f.id} />) : writable && <Button variant="outline" icon="in" class="!h-7 !px-2.5 !text-[12px]" disabled={busy === f.id} onClick={() => get(f)}>{busy === f.id ? "…" : "Get"}</Button>}</div>))}</div>
          : <p class="t-meta">No design file yet.{writable ? " Edit the design to add one." : ""}</p>}
        {writable && d.photos.some((p) => p.pend && !p.drive) && <div class="mt-1.5 grid gap-1.5">{d.photos.filter((p) => p.pend && !p.drive).map((p) => (
          <div key={p.id} class="flex items-center gap-2.5 rounded-xl bg-amb-bg/50 px-2.5 py-2"><span class="text-c3"><Icon name="image" size={15} /></span><span class="min-w-0 flex-1"><b class="block text-[13px] font-medium break-all">{p.name}</b><span class="t-meta">{isQueued(d.id, p.id) ? "original uploading…" : "original photo not uploaded yet"}</span></span>
            {!isQueued(d.id, p.id) && <Reup d={d} kind="photo" id={p.id} />}</div>))}</div>}
        {writable && d.photos.length > 0 && <button type="button" disabled={busy === "zip"} onClick={zipPhotos} class="mt-1.5 text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">{busy === "zip" ? "Preparing photos…" : "Download original photos (zip)"}</button>}
        {!writable && d.files.length > 0 && <p class="t-meta mt-1.5">Your role can view designs but not download files.</p>}
        {missing && <p role="status" class="t-meta mt-1.5 text-amb">{missing}</p>}
      </div>
      <details class="rounded-xl border border-line bg-c0 min-w-0" open={usage.length > 0}>
        <summary class="flex items-center gap-2 px-3 py-2.5"><span class="text-[13px] font-semibold">Material in live orders</span><span class="t-meta min-w-0 flex-1 text-right break-words">{usage.length ? `${usage.length} order${usage.length > 1 ? "s" : ""} · ${g(total)} to print` : "none"}</span><span class="chev text-c3 inline-flex"><Icon name="right" size={13} /></span></summary>
        <div class="border-t border-line p-2.5 grid gap-1.5">{usage.length ? usage.map((u) => (
          <div key={u.orderNo} class="rounded-xl bg-c1/60 px-3 py-2.5"><div class="flex items-baseline gap-2"><b class="text-[13px] min-w-0 flex-1 break-words">{u.orderNo}<span class="t-meta font-normal"> · {u.customer || "In-house"}</span></b><b class="num text-[13px]">{u.gEach ? `${u.estimated ? "~" : ""}${g(u.total)}` : "no grams"}</b></div>
            <div class="t-meta mt-0.5 break-words">{u.pending} pcs left{u.heightMm ? ` · ${u.heightMm} mm` : ""}{u.gEach ? ` · ${u.estimated ? "~" : ""}${Math.round(u.gEach)} g each` : ""}{u.colours.length ? ` · ${u.colours.join(", ")}` : ""}</div></div>))
          : <p class="t-meta">No live order uses this design. Assign it to an order and the grams still to print show here, from the same numbers as the filament panel.</p>}</div>
      </details>
      <div class="t-meta">Added {shortDate(d.created)} by {d.by}</div>
      {writable && <button type="button" onClick={async () => { if (await ask(`Delete “${d.name}”? It goes to the Bin, and its files to Google Drive's trash until the Bin is emptied. ${usedIn(d).length ? `It is used in ${usedIn(d).join(", ")}, so the number ${d.no} is retired: it stays blank and is never given to another design.` : `It is not used anywhere, so the number ${d.no} goes to the next design added.`}`, { ok: "Delete design" })) { const e = await deleteDesign(d); if (e) setMissing(e); else onClose(); } }} class="self-start text-[12px] text-red underline underline-offset-2 cursor-pointer !min-h-0">Delete design</button>}
      <div class="sticky -bottom-4 -mx-4 -mb-4 mt-auto border-t border-line bg-c0 px-4 py-3 flex gap-2 [&>*]:flex-1">
        <Button variant="outline" icon="share" onClick={onShare}>Share</Button>
        {writable && <Button variant="outline" icon="edit" onClick={onEdit}>Edit</Button>}
        {writable && <Button icon="link" onClick={onAssign}>Assign to order</Button>}
      </div>
    </div>
  );
}

/** Pick the original again for something that never finished uploading. */
function Reup({ d, kind, id }: { d: NxDesign; kind: "photo" | "file"; id: string }) {
  return <label class="h-7 px-2.5 rounded-full border border-line bg-c0 text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"><Icon name="in" size={12} /> Upload again
    <input type="file" class="sr-only" accept={kind === "photo" ? "image/*" : undefined} onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) reupload(d, kind, id, f); (e.target as HTMLInputElement).value = ""; }} /></label>;
}

/* ---------------------------------------------------------------- the design window: form on the left, the whole calculator on the right */
/** The category used last, so adding several designs to one category needs no re-picking. */
let lastCat = "";
const Calc = lazy<WorkbenchProps>(() => import("./nexcal/Workbench").then((m) => m.Workbench));
const CALCULABLE = /\.(stl|obj|step|stp|3mf)$/i;
const SIZE_NAMES = ["Small", "Medium", "Large", "Extra large"];

function DesignWindow({ editId, presetCat, onClose, onSaved }: { editId?: string; presetCat: string; onClose: () => void; onSaved: (d: NxDesign) => void }) {
  const base = editId ? nexderDesignsSig.value.find((d) => d.id === editId) : undefined;
  const [multi, setMulti] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => [base ? draftOf(base) : blankDraft()]);
  const [extra, setExtra] = useState<string[]>(() => (base ? catsOf(base).filter((id) => id !== base.catId) : []));
  const [cur, setCur] = useState(0), [catId, setCatId] = useState(base?.catId ?? (nexderCatsSig.value.some((c) => c.id === (presetCat || lastCat)) ? presetCat || lastCat : ""));
  const [adding, setAdding] = useState(!nexderCatsSig.value.length), [newCat, setNewCat] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [prog, setProg] = useState<Progress | null>(null);
  const [tab, setTab] = useState<"form" | "calc">("form"), [calcOpen, setCalcOpen] = useState(false), [seen, setSeen] = useState<string[]>([drafts[0].key]), [feed, setFeed] = useState<Record<string, { n: number; files: File[] }>>({});
  const ctl = useRef<AbortController | null>(null), asking = useRef(false), woke = useRef(false);
  const cats = nexderCatsSig.value.filter((c) => !c.archived || c.id === base?.catId), cat = cats.find((c) => c.id === catId);
  /* categories hidden by Archive stay on the design when it is edited */
  const hidden = base ? (base.cats ?? [base.catId]).filter((id) => id !== base.catId && nexderCatsSig.value.some((c) => c.id === id && c.archived)) : [];
  const set = (k: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === k ? { ...d, ...p } : d)));
  const first = cat ? nextNo(cat.id) : adding && newCat.trim() ? String(nextCode() * 1000 + 1) : null;
  const mk = () => { const r = addCategory(newCat); if (r.error) { setErr(r.error); return null; } setErr(""); setCatId(r.cat!.id); setAdding(false); setNewCat(""); return r.cat!; };
  const ready = drafts.every(draftReady) && (!!cat || (adding && !!newCat.trim()));
  const filled = (d: Draft) => !!(d.name || d.photos.length || d.files.length || d.desc || d.price || d.sizes.length);
  /* back to a single product drops the extra cards, asking first when they hold something */
  const go = async (m: boolean) => {
    if (m === multi) return;
    if (!m && drafts.slice(1).some(filled) && !(await ask("Go back to a single product? The other products you filled in will be removed.", { ok: "Remove them", danger: true }))) return;
    setMulti(m); setDrafts((d) => (m ? (d.length < 2 ? [...d, blankDraft()] : d) : d.slice(0, 1))); setCur(0); setSeen((x) => x.filter((k) => m || k === drafts[0].key));
  };
  const shown = multi ? drafts : drafts.slice(0, 1);
  const total = drafts.reduce((a, d) => a + newBytes(d), 0);
  const dirty = drafts.some((d) => !d.editId && (d.name || d.photos.length || d.files.length || d.desc || d.price || d.sizes.length)) || (!base && !!newCat.trim()) || (!!base && (JSON.stringify(drafts[0]) !== JSON.stringify(draftOf(base)) || extra.join() !== catsOf(base).filter((id) => id !== base.catId).join())) || (!base && extra.length > 0);
  const pick = (k: number) => { setCur(k); setSeen((s) => (s.includes(drafts[k].key) ? s : [...s, drafts[k].key])); };

  /* closing never throws work away without asking, and never leaves an upload running behind the window */
  const leave = async () => {
    if (asking.current) return;
    if (busy || dirty) {
      asking.current = true;
      const ok = await ask(busy ? "The design is still being saved. Stop and discard it?" : "Close this window? What you typed and picked is not saved yet.", { ok: busy ? "Stop and discard" : "Discard", danger: true });
      asking.current = false; if (!ok) return;
    }
    ctl.current?.abort(); onClose();
  };
  const save = async () => {
    setBusy(true); setErr("");
    let cid = catId; if (!cid && adding && newCat.trim()) { const c = mk(); if (!c) { setBusy(false); return; } cid = c.id; }
    const ac = (ctl.current = new AbortController()); let last: NxDesign | null = null;
    for (const d of drafts) {
      const r = await saveDraft(d, cid, [...(base && !(base.cats ?? [base.catId]).includes(base.catId) ? [] : [cid]), ...extra.filter((x) => x !== cid), ...hidden], setProg, ac.signal);
      if (typeof r === "string") { setErr(r); setBusy(false); setProg(null); return; }
      last = r; setDrafts((x) => x.filter((y) => y.key !== d.key));
    }
    setBusy(false); setProg(null); lastCat = cid; if (last) onSaved(last);
  };

  /* what the calculator hands back */
  const use = (k: number) => (u: Use) => {
    const d = drafts[k];
    if (u.kind === "price") set(k, { price: String(u.price) });
    else set(k, { sizes: [...d.sizes.filter((s) => !(s.mm === String(u.sizeMm) && s.g === String(u.grams))), { label: SIZE_NAMES[d.sizes.length] ?? `Size ${d.sizes.length + 1}`, mm: String(u.sizeMm), g: String(u.grams), min: String(u.minutes), sliced: false }] });
  };
  const gotFiles = (k: number) => (fs: File[]) => setDrafts((ds) => ds.map((d, j) => (j !== k ? d : { ...d, files: [...d.files, ...fs.filter((f) => !d.files.some((x) => x.name === f.name && x.size === f.size)).map((f) => ({ id: uid().replace(/[^A-Za-z0-9-]/g, ""), name: f.name, size: f.size, mime: f.type || "application/octet-stream", file: f }))] })));
  const calculate = (k: number, f: DraftItem) => { if (!f.file) return; setFeed((m) => ({ ...m, [drafts[k].key]: { n: (m[drafts[k].key]?.n ?? 0) + 1, files: [f.file!] } })); setTab("calc"); setCalcOpen(true); };

  if (calcOpen || tab === "calc") woke.current = true;
  const form = (
    <div class="p-4 grid gap-4 content-start">
      <div class="flex flex-wrap items-start gap-x-6 gap-y-3">
      {!base && <div class="pt-5"><Seg value={multi ? "m" : "s"} on={(v) => go(v === "m")} items={[["s", "Single product"], ["m", "Multiple products"]]} /></div>}
      <div class="flex-1 min-w-[300px] max-w-[640px]">
        <div class="flex items-center justify-between mb-1"><span class="text-[11px] font-medium text-c3">{multi ? "Category for all" : "Category"}</span>
          {!base && !adding && <button type="button" onClick={() => setAdding(true)} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">New category</button>}</div>
        {adding && !base
          ? <div class="flex gap-2"><input value={newCat} placeholder="Category name, for example Desk" aria-label="New category name" onInput={(e) => setNewCat((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && mk()} class={inputCls} />
              {cats.length > 0 && <Button variant="outline" onClick={() => { setAdding(false); setNewCat(""); setErr(""); }}>Cancel</Button>}</div>
          : <select aria-label="Category" value={catId} disabled={!!base} onChange={(e) => setCatId((e.target as HTMLSelectElement).value)} class={`${inputCls} cursor-pointer`}><option value="">Choose a category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <span class="block t-meta mt-1">{base ? <>Number <b class="num text-c4">{base.no}</b> · the category is fixed once saved</> : adding && !cat ? <>A new category is created when you save{first ? <>. Numbers start at <b class="num text-c4">{first}</b></> : ""}</> : cat ? (first ? multi ? <>Numbers start at <b class="num text-c4">{first}</b></> : <>Number <b class="num text-c4">{first}</b> will be assigned</> : "This category is full (999 designs)") : "Numbers are grouped by category."}</span>
      </div>
      </div>
      {cats.length > 1 && <div class="max-w-[640px]"><span class="block text-[11px] font-medium text-c3 mb-1">Also list in</span>
        <div class="flex flex-wrap gap-1.5">{cats.filter((c) => c.id !== catId).map((c) => { const on = extra.includes(c.id); return (
          <button key={c.id} type="button" aria-pressed={on} onClick={() => setExtra((x) => (on ? x.filter((i) => i !== c.id) : [...x, c.id]))} class={`h-7 px-3 !min-h-0 rounded-full border text-[12px] cursor-pointer ${on ? "bg-c4 text-c0 border-c4 font-semibold" : "border-line bg-c0 text-c3 font-medium"}`}>{on ? "✓ " : "+ "}{c.name}</button>); })}</div></div>}
      {shown.map((d, k) => (!multi || cur === k)
        ? <Product key={d.key} d={d} n={multi ? k + 1 : 0} set={(p) => set(k, p)} onCalc={(f) => calculate(k, f)} onRemove={multi && drafts.length > 1 ? () => { setDrafts((x) => x.filter((_, j) => j !== k)); setCur(0); } : undefined} />
        : <button type="button" key={d.key} onClick={() => pick(k)} class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl border border-line bg-c0 cursor-pointer !min-h-0">
            <span class="w-5 h-5 rounded-full bg-c1 text-c3 text-[11px] font-bold flex items-center justify-center shrink-0">{k + 1}</span>
            <span class="min-w-0 flex-1"><b class="block text-[13px] font-semibold break-words">{d.name || "Untitled"}</b><span class="t-meta">{d.photos.length} photo{d.photos.length === 1 ? "" : "s"} · {d.files.length} file{d.files.length === 1 ? "" : "s"}</span></span><span class="text-c3"><Icon name="down" size={14} /></span></button>)}
      {multi && <button type="button" onClick={() => { setDrafts((x) => [...x, blankDraft()]); pick(drafts.length); setSeen((s) => s); }} class="h-9 px-3 rounded-xl border border-dashed border-c2 text-[12px] font-medium text-c3 inline-flex items-center gap-1.5 justify-center cursor-pointer"><Icon name="plus" size={13} /> Add another product</button>}
    </div>
  );
  /* one calculator per product, kept alive while you switch between products, opened only when first needed */
  const calc = (
    <div class="p-4">
      {shown.map((d, k) => seen.includes(d.key) || k === cur ? (
        <div key={d.key} class={k === cur ? "" : "hidden"}>{multi && <p class="t-meta mb-2">Calculator for <b class="text-c4">{d.name || `product ${k + 1}`}</b></p>}<Calc mode="embed" onUse={use(k)} onFiles={gotFiles(k)} feed={feed[d.key]} /></div>) : null)}
    </div>
  );

  return (
    <Sheet xl onClose={leave} title={<>{base ? "Edit design" : multi ? "New designs" : "New design"}</>}
      footer={<div class="flex-1 min-w-0 !h-auto flex items-center gap-3 flex-wrap [&_button]:!h-9">
        <div class="min-w-0 flex-1 text-[12.5px]">
          {err ? <p role="alert" class="text-red break-words">{err}</p>
            : busy && prog ? <div role="status" class="grid gap-1"><span>Saving the design and preparing previews… {prog.total ? `${Math.min(prog.total, prog.sent + 1)} of ${prog.total}` : ""}</span>
              <div class="h-1.5 rounded-full bg-c1 overflow-hidden"><div class="h-full bg-acc" style={{ width: `${prog.total ? Math.min(100, (prog.sent / prog.total) * 100) : 0}%` }} /></div></div>
            : total > 0 ? <span class="t-meta">{fmtBytes(total)} goes to Google Drive in the background after you save. You can keep working; keep this tab open until it finishes.</span> : null}
        </div>
        <Button variant="outline" onClick={leave}>{busy ? "Stop saving" : "Cancel"}</Button>
        <Button disabled={!ready || busy} onClick={save}>{busy ? "Saving…" : base ? "Save changes" : multi ? `Save ${drafts.length} designs` : "Save design"}</Button>
      </div>}>
      <div class="lg:hidden px-4 pb-2"><Seg value={tab} on={setTab} items={[["form", "Details"], ["calc", "Calculator"]]} /></div>
      <div class={`h-full min-h-0 lg:grid ${calcOpen ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,1fr)_3.5rem]"}`}>
        <div class={`${tab === "form" ? "" : "max-lg:hidden"} h-full min-h-0 overflow-y-auto overscroll-contain`}>{form}</div>
        <div class={`${tab === "calc" ? "" : "max-lg:hidden"} h-full min-h-0 bg-canvas lg:border-l lg:border-line flex flex-col`}>
          {!calcOpen && <button type="button" onClick={() => setCalcOpen(true)} aria-label="Open the calculator" aria-expanded={false} class="hidden lg:flex flex-1 w-full flex-col items-center justify-center gap-3 text-c4 cursor-pointer !min-h-0 hover:bg-c1/60">
            <span class="w-8 h-8 rounded-full bg-c4 text-c0 flex items-center justify-center"><Icon name="back" size={14} /></span>
            <span class="text-[13px] font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">Open calculator</span></button>}
          <div class={`${calcOpen ? "" : "lg:hidden"} flex-1 min-h-0 overflow-y-auto overscroll-contain`}>
            <div class="hidden lg:flex items-center justify-between gap-2 px-4 pt-3"><span class="text-[13px] font-semibold">Calculator</span>
              <button type="button" onClick={() => setCalcOpen(false)} aria-expanded aria-label="Collapse the calculator" class="h-8 px-3 !min-h-0 rounded-full border border-line bg-c0 text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">Collapse <Icon name="right" size={12} /></button></div>
            {woke.current ? calc : null}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

function Product({ d, n, set, onCalc, onRemove }: { d: Draft; n: number; set: (p: Partial<Draft>) => void; onCalc: (f: DraftItem) => void; onRemove?: () => void }) {
  const [over, setOver] = useState(false);
  const pick = (fs: FileList | File[] | null, photo: boolean) => {
    const a = [...(fs ?? [])].filter((f) => !photo || f.type.startsWith("image/")); if (!a.length) return;
    const items = a.map((f) => ({ id: uid().replace(/[^A-Za-z0-9-]/g, ""), name: f.name, size: f.size, mime: f.type || "application/octet-stream", file: f }));
    set(photo ? { photos: [...d.photos, ...items] } : { files: [...d.files, ...items] });
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const fs = [...(e.dataTransfer?.files ?? [])]; pick(fs.filter((f) => f.type.startsWith("image/")), true); pick(fs.filter((f) => !f.type.startsWith("image/")), false); };
  const size = (k: number, p: Partial<Draft["sizes"][number]>) => set({ sizes: d.sizes.map((x, j) => (j === k ? { ...x, ...p } : x)) });
  return (
    <div class={`grid gap-x-6 gap-y-4 grid-cols-[repeat(auto-fit,minmax(340px,1fr))] items-start ${n ? "rounded-xl border border-c4 bg-c0 p-3" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {n > 0 && <div class="col-span-full flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-c4 text-c0 text-[11px] font-bold flex items-center justify-center">{n}</span><b class="text-[13px] flex-1">Product {n}</b>{onRemove && <button type="button" onClick={onRemove} class="text-[12px] text-red underline cursor-pointer !min-h-0">Remove</button>}</div>}
      <div class="grid gap-4 content-start">
      <Field label="Name"><Grow value={d.name} placeholder="Product name" onInput={(v) => set({ name: v })} /></Field>
      <Field label="Description (optional)"><textarea value={d.desc} rows={3} onInput={(e) => set({ desc: (e.target as HTMLTextAreaElement).value })} class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" /></Field>
      </div>
      <div class="grid gap-4 content-start">
      <div>
        <span class="block t-meta mb-1">Photos</span>
        <div class={`flex gap-2 flex-wrap rounded-xl ${over ? "ring-2 ring-c4 ring-offset-2 ring-offset-c0" : ""}`}>
          {d.photos.map((p, k) => (
            <span key={p.id} class="relative w-16 h-16 rounded-xl overflow-hidden bg-c1 shrink-0"><Local item={p} alt={p.name} />
              {k === 0 && <span class="absolute left-1 bottom-1 rounded bg-c0/90 text-[9px] font-bold px-1">Cover</span>}
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => set({ photos: d.photos.filter((x) => x.id !== p.id) })} class="absolute top-0.5 right-0.5 w-5 h-5 !min-h-0 rounded-full bg-c0/90 flex items-center justify-center cursor-pointer"><Icon name="close" size={10} /></button></span>))}
          <label class="w-16 h-16 rounded-xl border border-dashed border-c2 flex items-center justify-center text-c2 cursor-pointer shrink-0" title="Add photos"><Icon name="plus" size={18} /><span class="sr-only">Add photos</span>
            <input type="file" accept="image/*" multiple class="sr-only" onChange={(e) => { pick((e.target as HTMLInputElement).files, true); (e.target as HTMLInputElement).value = ""; }} /></label>
        </div>
        <span class="block t-meta mt-1">The original is kept in Google Drive. Emerald shows a small copy.</span>
      </div>
      <div>
        <span class="block t-meta mb-1">Files</span>
        {d.files.length > 0 && <div class="grid gap-1.5 mb-1.5">{d.files.map((f) => (
          <div key={f.id} class="flex items-center gap-2 rounded-xl bg-c1/60 px-2.5 py-2"><span class="text-c3"><Icon name="file" size={15} /></span><span class="min-w-0 flex-1"><b class="block text-[13px] font-medium break-all">{f.name}</b><span class="t-meta">{kind(f.name)} · {mb(f.size)}</span></span>
            {f.file && CALCULABLE.test(f.name) && <button type="button" onClick={() => onCalc(f)} class="h-7 px-2.5 !min-h-0 rounded-full border border-line bg-c0 text-[12px] font-semibold cursor-pointer whitespace-nowrap">Calculate</button>}
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set({ files: d.files.filter((x) => x.id !== f.id) })} class="w-6 h-6 !min-h-0 rounded-full flex items-center justify-center text-c3 cursor-pointer"><Icon name="close" size={12} /></button></div>))}</div>}
        <label class="h-8 px-3 rounded-xl border border-dashed border-c2 text-[12px] font-medium text-c3 inline-flex items-center gap-1.5 w-full justify-center cursor-pointer"><Icon name="plus" size={13} /> Add file · STL, 3MF, STEP, any type
          <input type="file" multiple class="sr-only" onChange={(e) => { pick((e.target as HTMLInputElement).files, false); (e.target as HTMLInputElement).value = ""; }} /></label>
      </div>
      </div>
      <div class="grid gap-4 content-start">
      <div class="grid grid-cols-2 gap-3">
        <Field label="Price (₹, optional)"><span class="relative block"><span class="pointer-events-none absolute left-3 top-1.5 text-[13px] text-c2">₹</span><input inputMode="decimal" value={d.price} placeholder="from the calculator" onInput={(e) => set({ price: (e.target as HTMLInputElement).value })} class={`${inputCls} num !pl-6`} /></span></Field>
        <div class="flex items-end"><span class="t-meta">Use the calculator on the right to work it out, then press “Use ₹… as price”.</span></div>
      </div>
      <div>
        <div class="flex items-center justify-between mb-1"><span class="t-meta">Sizes <span class="text-c2">· optional, used for material in orders</span></span><button type="button" onClick={() => set({ sizes: [...d.sizes, { label: "", mm: "", g: "", min: "", sliced: false }] })} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Add a size</button></div>
        {d.sizes.length > 0 ? <div class="grid gap-2.5">{d.sizes.map((s, k) => (
          <div key={k} class="rounded-xl border border-line bg-c0 p-2.5 grid gap-2">
            <div class="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem_4.75rem_auto] gap-1.5 items-end">
              <Field label="Name"><input value={s.label} placeholder="Medium" onInput={(e) => size(k, { label: (e.target as HTMLInputElement).value })} class={inputCls} /></Field>
              <Field label="Longest"><span class="relative block"><input inputMode="decimal" value={s.mm} onInput={(e) => size(k, { mm: (e.target as HTMLInputElement).value })} class={`${inputCls} num !pr-8`} /><span class="pointer-events-none absolute right-2 top-2 text-[11px] text-c2">mm</span></span></Field>
              <Field label="Weight"><span class="relative block"><input inputMode="decimal" value={s.g} onInput={(e) => size(k, { g: (e.target as HTMLInputElement).value })} class={`${inputCls} num !pr-6`} /><span class="pointer-events-none absolute right-2 top-2 text-[11px] text-c2">g</span></span></Field>
              <Field label="Print time"><span class="relative block"><input inputMode="numeric" value={s.min} onInput={(e) => size(k, { min: (e.target as HTMLInputElement).value })} class={`${inputCls} num !pr-9`} /><span class="pointer-events-none absolute right-2 top-2 text-[11px] text-c2">min</span></span></Field>
              <button type="button" aria-label="Remove size" onClick={() => set({ sizes: d.sizes.filter((_, j) => j !== k) })} class="w-8 h-8 !min-h-0 rounded-full flex items-center justify-center text-c3 cursor-pointer"><Icon name="close" size={13} /></button></div>
            <label class="flex items-start gap-2 text-[12px] cursor-pointer"><input type="checkbox" class="mt-0.5" checked={s.sliced} onChange={(e) => size(k, { sliced: (e.target as HTMLInputElement).checked })} />
              <span class="min-w-0"><b class={s.sliced ? "text-grn" : "text-amb"}>{s.sliced ? "Sliced values" : "Estimated values"}</b><span class="text-c3"> · {s.sliced ? "weight and time came from the slicer." : "tick this once you have sliced it and typed the real weight and time. Colour changes add a lot of time that only the slicer shows."}</span></span></label>
          </div>))}</div>
          : <p class="t-meta">None yet. “Save as a size” in the calculator adds one with its weight, time and longest side. Edit it any time with the real sliced figures.</p>}
      </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- client pack */
function PackModal({ initial, onClose }: { initial: NxDesign[]; onClose: () => void }) {
  const [ids, setIds] = useState(initial.map((d) => d.id)), [images, setImages] = useState<"all" | "first3" | "cover">("all"), [busy, setBusy] = useState(false), [note, setNote] = useState(""), [done, setDone] = useState<[number, number]>([0, 0]);
  const all = nexderDesignsSig.value, ds = ids.map((id) => all.find((d) => d.id === id)).filter(Boolean) as NxDesign[];
  const o = { images }, plan = packPlan(ds, o), nImg = plan.reduce((a, p) => a + p.photos.length, 0), bytes = packBytes(ds, o);
  const cats = [...new Set(plan.map((p) => p.cat))], tooBig = !canStream && bytes > MEMORY_ZIP;
  const run = async () => {
    setNote("");
    const sink = await openSink(`client-pack-${new Date().toISOString().slice(0, 10)}.zip`); if (!sink) return; // asks where to save, straight from the click
    setBusy(true);
    try {
      const r = await buildPack(ds, o, sink, (a, b) => setDone([a, b])); log("Client pack", `${ds.length} designs`);
      if (r.missing) setNote(`${r.missing} photo${r.missing > 1 ? "s were" : " was"} not available from Google Drive and left out.`); else onClose();
    } catch (e) { setNote((e as Error).message || "Could not build the zip"); }
    setBusy(false);
  };
  return (
    <Sheet onClose={onClose} title="Client pack" footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button icon="in" disabled={busy || !nImg || tooBig} onClick={run}>{busy ? `Building ${done[0]} of ${done[1]}…` : "Download zip"}</Button></>}>
      <p class="t-meta mb-3">One zip: a folder per category, a folder per product, photos named after the product. Each photo is fetched from Google Drive in its original quality.</p>
      <div class="flex items-center gap-2 flex-wrap mb-3"><span class="t-meta">Designs</span><span class={`${chipCls} bg-c4 text-c0`}>{ds.length} selected</span>
        <select aria-label="Add a whole category" value="" onChange={(e) => { const c = (e.target as HTMLSelectElement).value; if (c) setIds([...new Set([...ids, ...all.filter((d) => catsOf(d).includes(c)).map((d) => d.id)])]); }} class="h-7 px-2 rounded-full border border-line bg-c0 text-[12px] font-semibold cursor-pointer">
          <option value="">+ Whole category</option>{nexderCatsSig.value.filter((c) => !c.archived).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
      {ds.length ? <div class="rounded-xl bg-c1/60 p-3 grid gap-2 mb-3">{cats.map((c) => (
        <div key={c}><div class="flex items-center gap-2 text-[13px] font-semibold py-0.5"><Icon name="folder" size={15} /><span class="break-words min-w-0">{c}</span></div>
          <div class="ml-[7px] pl-4 border-l border-line grid gap-0.5">{plan.filter((p) => p.cat === c).map((p) => (
            <div key={p.d.id} class="flex items-center gap-2 text-[13px] py-0.5"><span class="text-c3"><Icon name="folder" size={14} /></span><span class="flex-1 min-w-0 break-words">{p.name}</span><span class="t-meta whitespace-nowrap">{p.photos.length} photo{p.photos.length === 1 ? "" : "s"}</span>
              <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setIds(ids.filter((x) => x !== p.d.id))} class="w-6 h-6 !min-h-0 rounded-full flex items-center justify-center text-c3 cursor-pointer"><Icon name="close" size={12} /></button></div>))}</div></div>))}</div>
        : <p class="t-meta mb-3">Nothing selected.</p>}
      <Row title="Options" meta={images === "all" ? "all photos" : images === "first3" ? "first 3 photos" : "cover only"}>
        <div><span class="block t-meta mb-1">Photos per product</span><Seg value={images} on={setImages} items={[["all", "All"], ["first3", "First 3"], ["cover", "Cover only"]]} /></div>
        <p class="t-meta">Design files (STL, 3MF…) are not put in the zip, because they can be gigabytes. Download them one by one from each design.</p></Row>
      <p class="t-meta mt-3">{nImg} photo{nImg === 1 ? "" : "s"} · about {mb(bytes)}</p>
      {tooBig && <p role="status" class="text-[12.5px] text-amb mt-1.5">This browser cannot save big zips to disk. Pick fewer photos (under {mb(MEMORY_ZIP)}) or use Chrome or Edge on a computer.</p>}
      {note && <p role="status" class="text-[12.5px] text-amb mt-1.5">{note}</p>}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- storage meter and Drive check */
function StorageSheet({ writable, onClose }: { writable: boolean; onClose: () => void }) {
  const [sp, setSp] = useState<Space | null>(null), [err, setErr] = useState(""), [res, setRes] = useState<Check[] | null>(null), [busy, setBusy] = useState(false);
  const pv = previewBytes();
  useEffect(() => { load(); }, []);
  const load = () => driveSpace().then(setSp).catch((e) => setErr((e as Error).message));
  const bar = (v: number, max: number) => <div class="h-1.5 rounded-full bg-c1 overflow-hidden"><div class={`h-full ${v / max > 0.9 ? "bg-red" : "bg-acc"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>;
  return (
    <Sheet onClose={onClose} title="Storage">
      <div class="px-3 pb-3 grid gap-3">
        <div class="grid gap-1"><div class="flex justify-between gap-3 text-[13px]"><span>Google Drive</span><span class="num">{sp ? `${fmtBytes(sp.usage)}${sp.limit ? ` of ${fmtBytes(sp.limit)}` : ""}` : err ? "unavailable" : "…"}</span></div>
          {sp?.limit ? bar(sp.usage, sp.limit) : null}
          <span class="t-meta">{err || `Shared with Gmail and Docs on the same account. Uploads stop ${fmtBytes(LIMITS.driveReserve)} before it is full.`}</span></div>
        <div class="grid gap-1"><div class="flex justify-between gap-3 text-[13px]"><span>Previews (Supabase)</span><span class="num">{fmtBytes(pv)} of {fmtBytes(LIMITS.previewBytes)}</span></div>{bar(pv, LIMITS.previewBytes)}</div>
        {writable && <div class="grid gap-2"><div><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setRes(null); setRes(await checkDrive().catch((e) => [{ step: "Check", ok: false, note: (e as Error).message }])); setBusy(false); load(); }}>{busy ? "Checking…" : "Check Google Drive"}</Button></div>
          {res && <ul class="grid gap-1">{res.map((c) => <li key={c.step} class="text-[12.5px] break-words"><b class={c.ok ? "text-grn" : "text-red"}>{c.ok ? "OK" : "Failed"}</b> · {c.step}{c.note ? <span class="text-c3"> · {c.note}</span> : null}</li>)}</ul>}</div>}
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- share, assign */
function ShareModal({ ds, onClose }: { ds: NxDesign[]; onClose: (done?: boolean) => void }) {
  const people = usersSig.value.filter((u) => u.active && u.id !== me.value?.id);
  const [to, setTo] = useState<string[]>([]), [note, setNote] = useState("");
  return (
    <Sheet onClose={() => onClose()} title={`Share ${ds.length} design${ds.length > 1 ? "s" : ""}`} footer={<><Button variant="outline" onClick={() => onClose()}>Cancel</Button><Button icon="share" disabled={!to.length} onClick={() => { shareDesigns(ds.map((d) => d.id), to, note); onClose(true); }}>{to.length ? `Share with ${to.length}` : "Choose people"}</Button></>}>
      <p class="t-meta mb-2">They see the cards under “Shared with me”. Nothing is copied.</p>
      <div class="grid gap-1">{people.map((u) => { const on = to.includes(u.id);
        return <button type="button" key={u.id} aria-pressed={on} onClick={() => setTo(on ? to.filter((x) => x !== u.id) : [...to, u.id])} class={`flex items-center gap-3 rounded-xl px-2 py-2 text-left cursor-pointer !min-h-0 ${on ? "bg-c1" : ""}`}>
          <span class="w-8 h-8 rounded-full bg-avatar flex items-center justify-center text-[13px] font-semibold shrink-0">{u.name[0]}</span><span class="min-w-0 flex-1"><b class="block text-[13px] break-words">{u.name}</b><span class="t-meta">{u.job || u.role}</span></span>
          <span class={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${on ? "bg-c4 text-c0" : "border border-c2/50"}`}>{on && <Icon name="check" size={12} />}</span></button>; })}
        {!people.length && <p class="t-meta">There is nobody else on the team yet. Add people in Settings → Team.</p>}</div>
      <div class="mt-3"><Field label="Note"><input value={note} placeholder="Optional" onInput={(e) => setNote((e.target as HTMLInputElement).value)} class={inputCls} /></Field></div>
    </Sheet>
  );
}
function AssignModal({ ds, onClose }: { ds: NxDesign[]; onClose: (done?: boolean) => void }) {
  const orders = assignable(), [q, setQ] = useState(""), [pick, setPick] = useState(""), [size, setSize] = useState<Record<string, NxSize | undefined>>({});
  const shown = orders.filter((o) => !q.trim() || (o.no + " " + o.customer).toLowerCase().includes(q.trim().toLowerCase()));
  const o = ordersSig.value.find((x) => x.id === pick);
  return (
    <Sheet onClose={() => onClose()} title={`Assign ${ds.length} design${ds.length > 1 ? "s" : ""} to an order`} footer={<><Button variant="outline" onClick={() => onClose()}>Cancel</Button><Button icon="link" disabled={!o} onClick={() => { assignToOrder(o as Order, ds, size); onClose(true); }}>{o ? `Assign to ${o.no}` : "Choose an order"}</Button></>}>
      <p class="t-meta mb-2">Each design is added to the order as a line of 1 piece. Set the quantity on the order.</p>
      <input type="search" value={q} placeholder="Find order or client" aria-label="Find order or client" onInput={(e) => setQ((e.target as HTMLInputElement).value)} class={`${inputCls} mb-2`} />
      <div class="grid gap-1 max-h-[40dvh] overflow-y-auto">{shown.map((x) => { const on = pick === x.id;
        return <button type="button" key={x.id} aria-pressed={on} onClick={() => setPick(x.id)} class={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left cursor-pointer !min-h-0 ${on ? "bg-c1" : ""}`}>
          <span class={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${on ? "bg-c4 text-c0" : "border border-c2/50"}`}>{on && <Icon name="check" size={12} />}</span>
          <span class="min-w-0 flex-1"><b class="block text-[13px] num">{x.no}</b><span class="t-meta break-words">{x.customer || "In-house"}</span></span><span class={`${chipCls} ${x.stage === "production" ? "bg-grn-bg text-grn" : "bg-amb-bg text-amb"}`}>{x.stage === "production" ? "Production" : "Quotation"}</span></button>; })}
        {!shown.length && <p class="t-meta">{orders.length ? "No order matches." : "No open order to assign to. Create an order first."}</p>}</div>
      {ds.some((d) => (d.sizes?.length ?? 0) > 1) && <div class="mt-3 grid gap-2"><span class="t-meta">Size</span>{ds.filter((d) => (d.sizes?.length ?? 0) > 1).map((d) => (
        <Field key={d.id} label={d.name}><select value={size[d.id]?.label ?? ""} onChange={(e) => { const s = d.sizes!.find((x) => x.label === (e.target as HTMLSelectElement).value); setSize({ ...size, [d.id]: s }); }} class={`${inputCls} cursor-pointer`}>
          <option value="">Not set</option>{d.sizes!.map((s) => <option key={s.label} value={s.label}>{s.label}{s.mm ? ` · ${s.mm} mm` : ""} · {s.g} g</option>)}</select></Field>))}</div>}
    </Sheet>
  );
}
