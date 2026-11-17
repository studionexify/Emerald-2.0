/** Nexder: the studio's library of designs. Originals live in Google Drive, previews in Supabase Storage; Emerald keeps no files. */
import type { ComponentChildren } from "preact";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { ask, Button, DetailHead, Empty, Field, Icon, inputCls, Page, Sheet } from "../ui";
import { inr, log, me, ordersSig, shortDate, usersSig, can, type Order } from "../data";
import { calculateNexcal, emptyNexcalInputs, NEXCAL_MATERIALS } from "../data/nexcal/engine";
import { nexcalSig } from "../data/pricing";
import {
  addCategory, assignable, assignToOrder, blankDraft, buildPack, canStream, catName, checkDrive, deleteDesign, downloadFile, draftOf, draftReady, driveSpace, fmtBytes, LIMITS, markSeen, materialUsage, MAX_PER_CAT,
  MEMORY_ZIP, newBytes, nexderCatsSig, nexderDesignsSig, nexderReady, nextNo, openSink, packBytes, packPlan, previewBytes, previewUrl, saveDraft, sharedWithMe, shareDesigns, sweepOrphans, syncTrash, unseenShares,
  type Check, type Draft, type DraftItem, type NxDesign, type NxSize, type Progress, type Space,
} from "../data/nexder";
import { uid } from "../data/store";

/* ---------------------------------------------------------------- small helpers */
/** Object URL of one photo's small preview ("" until it arrives). */
function usePreview(id?: string): string {
  const [u, setU] = useState("");
  useEffect(() => { let live = true; setU(""); if (id) previewUrl(id).then((x) => live && setU(x)); return () => { live = false; }; }, [id]);
  return u;
}
const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const kind = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? "file").toUpperCase();
const g = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
const chipCls = "inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold whitespace-nowrap";
const Ph = () => <span class="w-full h-full flex items-center justify-center text-c2"><Icon name="image" size={22} /></span>;

/** A stored photo's small preview, or a placeholder. */
function Pic({ id, alt, class: cls = "" }: { id?: string; alt: string; class?: string }) {
  const src = usePreview(id);
  return src ? <img src={src} alt={alt} loading="lazy" class={`w-full h-full object-cover ${cls}`} /> : <Ph />;
}
function Local({ item, alt }: { item: DraftItem; alt: string }) {
  const url = useMemo(() => (item.file ? URL.createObjectURL(item.file) : ""), [item.file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  const stored = usePreview(item.file ? undefined : item.id), src = url || stored;
  return src ? <img src={src} alt={alt} class="w-full h-full object-cover" /> : <Ph />;
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
type Dlg = null | "pack" | "share" | "assign";

export default function Nexder() {
  const designs = nexderDesignsSig.value, cats = nexderCatsSig.value;
  const [q, setQ] = useState(""), [cat, setCat] = useState(""), [view, setView] = useState<"all" | "shared">("all");
  const [panel, setPanel] = useState<Panel>(null), [dlg, setDlg] = useState<Dlg>(null);
  const [selecting, setSelecting] = useState(false), [sel, setSel] = useState<string[]>([]);
  const writable = can("nexder", "full") && nexderReady;
  const shared = sharedWithMe(), unseen = unseenShares().length;
  useEffect(() => { if (nexderReady) { syncTrash(); if (can("nexder", "full")) sweepOrphans(); } }, []);
  useEffect(() => { if (view === "shared") markSeen(); }, [view, shared.length]);
  const pool = view === "shared" ? designs.filter((d) => shared.some((s) => s.designIds.includes(d.id))) : designs;
  const list = pool.filter((d) => (!cat || d.catId === cat) && (!q.trim() || d.name.toLowerCase().includes(q.trim().toLowerCase()) || d.no.includes(q.trim())));
  const by = (id: string) => designs.find((d) => d.id === id);
  const picked = sel.map(by).filter(Boolean) as NxDesign[];
  const open = panel && panel.k !== "new" ? by(panel.id) : undefined;
  useEffect(() => { if (panel && panel.k !== "new" && !open) setPanel(null); }, [panel, open]);
  const stopSelect = () => { setSelecting(false); setSel([]); };
  const tap = (d: NxDesign) => (selecting ? setSel((s) => (s.includes(d.id) ? s.filter((x) => x !== d.id) : [...s, d.id])) : setPanel({ k: "view", id: d.id }));

  const detail = !panel ? null : panel.k === "view" && open
    ? <ViewPanel d={open} writable={writable} onClose={() => setPanel(null)} onEdit={() => setPanel({ k: "edit", id: open.id })}
        onShare={() => { setSel([open.id]); setDlg("share"); }} onAssign={() => { setSel([open.id]); setDlg("assign"); }} />
    : panel.k === "new" || panel.k === "edit"
      ? <FormPanel key={panel.k === "edit" ? panel.id : "new"} editId={panel.k === "edit" ? panel.id : undefined} presetCat={cat} onClose={() => setPanel(panel.k === "edit" ? { k: "view", id: panel.id } : null)} onSaved={(d) => setPanel({ k: "view", id: d.id })} />
      : null;

  return (
    <Page title="Nexder" sub="Designs, photos and files. Photos and files are kept in Google Drive; Emerald shows small copies."
      actions={<>{designs.length > 0 && <Button variant="outline" icon={selecting ? "check" : undefined} onClick={() => (selecting ? stopSelect() : setSelecting(true))}>{selecting ? "Done" : "Select"}</Button>}
        {writable && <Button icon="plus" onClick={() => { setPanel({ k: "new" }); stopSelect(); }}>New design</Button>}</>}
      toolbar={<>
        <label class="relative w-full md:w-[260px]"><span class="sr-only">Search designs</span><span class="absolute left-3 top-2.5 text-c2 pointer-events-none"><Icon name="search" size={13} /></span>
          <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Name or number" class={`${inputCls} !pl-8`} /></label>
        <select aria-label="Category" value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value)} class={`${inputCls} !w-auto cursor-pointer`}>
          <option value="">All categories</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name} · {designs.filter((d) => d.catId === c.id).length}</option>)}</select>
        {shared.length > 0 && <Seg value={view} on={setView} items={[["all", "All"], ["shared", `Shared with me${unseen ? ` · ${unseen} new` : ""}`]]} />}
      </>}
      detail={detail}>
      {view === "shared" && shared.length > 0 && <div class="grid gap-1.5">{shared.map((s) => (
        <p key={s.id} class="rounded-xl bg-c0 px-3 py-2 text-[13px] break-words"><b>{usersSig.value.find((u) => u.id === s.by)?.name ?? "Someone"}</b> shared {s.designIds.length} design{s.designIds.length > 1 ? "s" : ""} · {shortDate(s.at)}{s.note ? <span class="text-c3"> · “{s.note}”</span> : null}</p>))}</div>}
      {!nexderReady && <p role="status" class="rounded-xl bg-amb-bg text-amb px-3 py-2 text-[13px]">Nexder keeps its files in Google Drive, so it needs cloud sync. Sign in to cloud sync to add or open files.</p>}
      {!designs.length
        ? <div class="rounded-[var(--radius-card)] bg-c0 p-8"><Empty title="No designs yet" action={writable ? <Button icon="plus" class="mt-2" onClick={() => setPanel({ k: "new" })}>New design</Button> : undefined} /></div>
        : !list.length ? <div class="rounded-[var(--radius-card)] bg-c0 p-8"><Empty title="Nothing matches" action={<button class="underline text-[13px]" onClick={() => { setQ(""); setCat(""); setView("all"); }}>Clear filters</button>} /></div>
        : <div class="grid gap-3 items-start grid-cols-[repeat(auto-fill,minmax(168px,1fr))]">{list.map((d) => {
          const on = sel.includes(d.id), cur = open?.id === d.id;
          return (
            <button type="button" key={d.id} onClick={() => tap(d)} aria-pressed={selecting ? on : undefined} aria-label={`${d.name}, ${d.no}`}
              class={`relative flex flex-col items-stretch justify-start text-left rounded-[20px] bg-c0 overflow-hidden min-w-0 cursor-pointer !p-0 ${on ? "ring-2 ring-c4" : cur ? "ring-2 ring-acc" : ""}`}>
              <span class="block aspect-[4/3] bg-c1"><Pic id={d.photos[0]?.id} alt="" /></span>
              {selecting && <span class={`absolute top-2.5 left-2.5 w-6 h-6 rounded-full flex items-center justify-center ${on ? "bg-c4 text-c0" : "bg-c0/90 border border-c2/40"}`}>{on && <Icon name="check" size={14} />}</span>}
              <span class="block px-3 pt-2.5 pb-3"><b class="block text-[13px] font-semibold leading-snug break-words">{d.name}</b><span class="block t-meta mt-0.5 break-words"><span class="num">{d.no}</span> · {catName(d.catId)}</span></span>
            </button>
          );
        })}</div>}
      {selecting && sel.length > 0 && (
        <div class="sticky bottom-2 flex justify-center pointer-events-none z-20">
          <div class="pointer-events-auto inline-flex flex-wrap justify-center items-center gap-1 min-h-12 pl-4 pr-1.5 py-1 rounded-3xl bg-c4 text-c0 shadow-xl max-w-full">
            <span class="text-[13px] font-semibold mr-2 whitespace-nowrap">{sel.length} selected</span>
            {([["share", "Share", "share"], ["zip", "Client pack", "pack"], ["link", "Assign to order", "assign"]] as const).filter(([, , k]) => k === "share" || writable).map(([i, l, k]) => (
              <button key={k} type="button" onClick={() => setDlg(k as Dlg)} class="h-9 px-3 !min-h-0 rounded-full inline-flex items-center gap-1.5 text-[13px] font-semibold whitespace-nowrap hover:bg-c0/15 cursor-pointer"><Icon name={i} size={15} />{l}</button>))}
            <button type="button" aria-label="Clear selection" onClick={() => setSel([])} class="w-9 h-9 !min-h-0 rounded-full inline-flex items-center justify-center hover:bg-c0/15 cursor-pointer"><Icon name="close" size={14} /></button>
          </div>
        </div>)}
      {designs.length > 0 && nexderReady && <Storage writable={can("nexder", "full")} />}
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
        <div class="text-right"><div class="t-meta">Category</div><div class="mt-1"><span class={`${chipCls} bg-c1 text-c3`}>{catName(d.catId)}</span></div></div></div>
      {(d.price || d.sizes?.length) && <div class="grid gap-1 text-[13px]">
        {d.price ? <div class="flex justify-between gap-3"><span class="text-c3">Price</span><b class="num">{inr(d.price)}</b></div> : null}
        {d.sizes?.map((s) => <div key={s.label} class="flex justify-between gap-3"><span class="text-c3">Size {s.label}{s.mm ? ` · ${s.mm} mm` : ""}</span><b class="num">{s.g} g</b></div>)}</div>}
      {d.desc && <p class="text-[13px] text-c3 whitespace-pre-wrap break-words">{d.desc}</p>}
      <div>
        <div class="flex items-center justify-between mb-1.5"><span class="t-section">Files</span>{writable && d.files.length > 1 && <button type="button" onClick={all} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Download all</button>}</div>
        {d.files.length ? <div class="grid gap-1.5">{d.files.map((f) => (
          <div key={f.id} class="flex items-center gap-2.5 rounded-xl bg-c1/60 px-2.5 py-2"><span class="text-c3"><Icon name="file" size={15} /></span>
            <span class="min-w-0 flex-1"><b class="block text-[13px] font-medium break-all">{f.name}</b><span class="t-meta">{kind(f.name)} · {mb(f.size)} · {f.drive ? "original in Google Drive" : "not in Drive"}</span></span>
            {writable && <Button variant="outline" icon="in" class="!h-7 !px-2.5 !text-[12px]" disabled={busy === f.id} onClick={() => get(f)}>{busy === f.id ? "…" : "Get"}</Button>}</div>))}</div>
          : <p class="t-meta">No design file yet.{writable ? " Edit the design to add one." : ""}</p>}
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
      {writable && <button type="button" onClick={async () => { if (await ask(`Delete “${d.name}”? It goes to the Bin, and its files to Google Drive's trash until the Bin is emptied.`, { ok: "Delete design" })) { const e = await deleteDesign(d); if (e) setMissing(e); else onClose(); } }} class="self-start text-[12px] text-red underline underline-offset-2 cursor-pointer !min-h-0">Delete design</button>}
      <div class="sticky -bottom-4 -mx-4 -mb-4 mt-auto border-t border-line bg-c0 px-4 py-3 flex gap-2 [&>*]:flex-1">
        <Button variant="outline" icon="share" onClick={onShare}>Share</Button>
        {writable && <Button variant="outline" icon="edit" onClick={onEdit}>Edit</Button>}
        {writable && <Button icon="link" onClick={onAssign}>Assign to order</Button>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- upload / edit panel */
/** The category used last, so adding several designs to one category needs no re-picking. */
let lastCat = "";
function FormPanel({ editId, presetCat, onClose, onSaved }: { editId?: string; presetCat: string; onClose: () => void; onSaved: (d: NxDesign) => void }) {
  const base = editId ? nexderDesignsSig.value.find((d) => d.id === editId) : undefined;
  const [multi, setMulti] = useState(false);
  const [drafts, setDrafts] = useState<Draft[]>(() => [base ? draftOf(base) : blankDraft()]);
  const [cur, setCur] = useState(0), [catId, setCatId] = useState(base?.catId ?? (nexderCatsSig.value.some((c) => c.id === (presetCat || lastCat)) ? presetCat || lastCat : ""));
  const [adding, setAdding] = useState(!nexderCatsSig.value.length), [newCat, setNewCat] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [prog, setProg] = useState<Progress | null>(null);
  const ctl = useRef<AbortController | null>(null);
  const [priceFor, setPriceFor] = useState<number | null>(null);
  const cats = nexderCatsSig.value, cat = cats.find((c) => c.id === catId);
  const set = (k: number, p: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === k ? { ...d, ...p } : d)));
  const first = cat ? (cat.last < MAX_PER_CAT ? nextNo(cat.id) : null) : null;
  const mk = () => { const r = addCategory(newCat); if (r.error) return setErr(r.error); setErr(""); setCatId(r.cat!.id); setAdding(false); setNewCat(""); };
  const ready = drafts.every(draftReady) && !!cat;
  const go = (m: boolean) => { setMulti(m); if (m && drafts.length < 2) setDrafts((d) => [...d, blankDraft()]); setCur(0); };
  const total = drafts.reduce((a, d) => a + newBytes(d), 0);
  const save = async () => {
    setBusy(true); setErr(""); const ac = (ctl.current = new AbortController()); let last: NxDesign | null = null;
    for (const d of drafts) {
      const r = await saveDraft(d, catId, setProg, ac.signal);
      if (typeof r === "string") { setErr(r); setBusy(false); setProg(null); return; }
      last = r; setDrafts((x) => x.filter((y) => y.key !== d.key));
    }
    setBusy(false); setProg(null); lastCat = catId; if (last) onSaved(last);
  };
  const stop = () => { ctl.current?.abort(); onClose(); };
  if (priceFor !== null) return <PricePanel grams={Number(drafts[priceFor].sizes[0]?.g) || 0} current={Number(drafts[priceFor].price) || 0} onBack={() => setPriceFor(null)} onUse={(v) => { set(priceFor, { price: v ? String(v) : "" }); setPriceFor(null); }} />;
  return (
    <div class="flex flex-col min-h-full gap-3.5">
      <DetailHead title={base ? "Edit design" : multi ? "New designs" : "New design"} onClose={onClose} />
      {!base && <Seg value={multi ? "m" : "s"} on={(v) => go(v === "m")} items={[["s", "Single product"], ["m", "Multiple products"]]} />}
      <div>
        <div class="flex items-center justify-between mb-1"><span class="text-[11px] font-medium text-c3">{multi ? "Category for all" : "Category"}</span>
          {!base && !adding && <button type="button" onClick={() => setAdding(true)} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">New category</button>}</div>
        {adding && !base
          ? <div class="flex gap-2"><input autofocus value={newCat} placeholder="Category name" aria-label="New category name" onInput={(e) => setNewCat((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && mk()} class={inputCls} />
              <Button onClick={mk}>Create</Button>{cats.length > 0 && <Button variant="outline" onClick={() => { setAdding(false); setErr(""); }}>Cancel</Button>}</div>
          : <select aria-label="Category" value={catId} disabled={!!base} onChange={(e) => setCatId((e.target as HTMLSelectElement).value)} class={`${inputCls} cursor-pointer`}><option value="">Choose a category</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {cat && <span class="block t-meta mt-1">{base ? <>Number <b class="num text-c4">{base.no}</b>{base.catId !== catId ? "" : ""} · category is fixed once saved</> : first ? multi ? <>Numbers start at <b class="num text-c4">{first}</b></> : <>Number <b class="num text-c4">{first}</b> will be assigned</> : "This category is full (999 designs)"}</span>}
        {adding && !cats.length && <span class="block t-meta mt-1">Numbers are grouped by category: the first category gets 10001, 10002…, the next 11001…</span>}
      </div>
      {drafts.map((d, k) => (!multi || cur === k)
        ? <Product key={d.key} d={d} n={multi ? k + 1 : 0} set={(p) => set(k, p)} onPrice={() => setPriceFor(k)} onRemove={multi && drafts.length > 1 ? () => { setDrafts((x) => x.filter((_, j) => j !== k)); setCur(0); } : undefined} />
        : <button type="button" key={d.key} onClick={() => setCur(k)} class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left rounded-xl border border-line bg-c0 cursor-pointer !min-h-0">
            <span class="w-5 h-5 rounded-full bg-c1 text-c3 text-[11px] font-bold flex items-center justify-center shrink-0">{k + 1}</span>
            <span class="min-w-0 flex-1"><b class="block text-[13px] font-semibold break-words">{d.name || "Untitled"}</b><span class="t-meta">{d.photos.length} photo{d.photos.length === 1 ? "" : "s"} · {d.files.length} file{d.files.length === 1 ? "" : "s"}</span></span><span class="text-c3"><Icon name="down" size={14} /></span></button>)}
      {multi && <button type="button" onClick={() => { setDrafts((x) => [...x, blankDraft()]); setCur(drafts.length); }} class="h-9 px-3 rounded-xl border border-dashed border-c2 text-[12px] font-medium text-c3 inline-flex items-center gap-1.5 justify-center cursor-pointer"><Icon name="plus" size={13} /> Add another product</button>}
      {err && <p role="alert" class="text-[12.5px] text-red">{err}</p>}
      {busy && prog && <div role="status" class="rounded-xl bg-c1/60 px-3 py-2.5 grid gap-1.5">
        <div class="flex justify-between gap-3 text-[12.5px]"><span class="min-w-0 break-all">{prog.label === "Previews" ? "Preparing previews…" : `Uploading ${prog.label}`}</span><span class="num whitespace-nowrap">{prog.total ? Math.min(100, Math.round((prog.sent / prog.total) * 100)) : 0}%</span></div>
        <div class="h-1.5 rounded-full bg-c1 overflow-hidden"><div class="h-full bg-acc" style={{ width: `${prog.total ? Math.min(100, (prog.sent / prog.total) * 100) : 0}%` }} /></div>
        <div class="t-meta">{fmtBytes(prog.sent)} of {fmtBytes(prog.total)} · straight to Google Drive. Keep this tab open until it finishes.</div></div>}
      {!busy && total > 0 && <p class="t-meta">{fmtBytes(total)} will be uploaded to Google Drive{total > 50 * 1048576 ? ". Keep this tab open while it uploads." : "."}</p>}
      <div class="sticky -bottom-4 -mx-4 -mb-4 mt-auto border-t border-line bg-c0 px-4 py-3 flex gap-2 justify-end">
        <Button variant="outline" onClick={busy ? stop : onClose}>{busy ? "Stop upload" : "Cancel"}</Button>
        <Button disabled={!ready || busy} onClick={save}>{busy ? "Saving…" : base ? "Save changes" : multi ? `Save ${drafts.length} designs` : "Save design"}</Button>
      </div>
    </div>
  );
}

function Product({ d, n, set, onPrice, onRemove }: { d: Draft; n: number; set: (p: Partial<Draft>) => void; onPrice: () => void; onRemove?: () => void }) {
  const [over, setOver] = useState(false);
  const pick = (fs: FileList | File[] | null, photo: boolean) => {
    const a = [...(fs ?? [])].filter((f) => !photo || f.type.startsWith("image/")); if (!a.length) return;
    const items = a.map((f) => ({ id: uid().replace(/[^A-Za-z0-9-]/g, ""), name: f.name, size: f.size, mime: f.type || "application/octet-stream", file: f }));
    set(photo ? { photos: [...d.photos, ...items] } : { files: [...d.files, ...items] });
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const fs = [...(e.dataTransfer?.files ?? [])]; pick(fs.filter((f) => f.type.startsWith("image/")), true); pick(fs.filter((f) => !f.type.startsWith("image/")), false); };
  const body = (
    <div class={`grid gap-3.5 ${n ? "rounded-xl border border-c4 bg-c0 p-3" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      {n > 0 && <div class="flex items-center gap-2"><span class="w-5 h-5 rounded-full bg-c4 text-c0 text-[11px] font-bold flex items-center justify-center">{n}</span><b class="text-[13px] flex-1">Product {n}</b>{onRemove && <button type="button" onClick={onRemove} class="text-[12px] text-red underline cursor-pointer !min-h-0">Remove</button>}</div>}
      <Field label="Name"><input value={d.name} placeholder="Product name" onInput={(e) => set({ name: (e.target as HTMLInputElement).value })} class={inputCls} /></Field>
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
        <span class="block t-meta mt-1">The original is kept. Emerald shows a small copy.</span>
      </div>
      <div>
        <span class="block t-meta mb-1">Files</span>
        {d.files.length > 0 && <div class="grid gap-1.5 mb-1.5">{d.files.map((f) => (
          <div key={f.id} class="flex items-center gap-2.5 rounded-xl bg-c1/60 px-2.5 py-2"><span class="text-c3"><Icon name="file" size={15} /></span><span class="min-w-0 flex-1"><b class="block text-[13px] font-medium break-all">{f.name}</b><span class="t-meta">{kind(f.name)} · {mb(f.size)}</span></span>
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => set({ files: d.files.filter((x) => x.id !== f.id) })} class="w-6 h-6 !min-h-0 rounded-full flex items-center justify-center text-c3 cursor-pointer"><Icon name="close" size={12} /></button></div>))}</div>}
        <label class="h-8 px-3 rounded-xl border border-dashed border-c2 text-[12px] font-medium text-c3 inline-flex items-center gap-1.5 w-full justify-center cursor-pointer"><Icon name="plus" size={13} /> Add file · STL, 3MF, STEP, any type
          <input type="file" multiple class="sr-only" onChange={(e) => { pick((e.target as HTMLInputElement).files, false); (e.target as HTMLInputElement).value = ""; }} /></label>
      </div>
      <div class="grid gap-1.5">
        <Row title="Description" meta={d.desc ? <span class="line-clamp-1">{d.desc}</span> : "optional"} open={!!d.desc}>
          <textarea value={d.desc} rows={3} aria-label="Description" onInput={(e) => set({ desc: (e.target as HTMLTextAreaElement).value })} class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" /></Row>
        <Row title="Sizes" meta={d.sizes.length ? `${d.sizes.length} size${d.sizes.length > 1 ? "s" : ""}` : "optional · for material use"} open={d.sizes.length > 0}>
          {d.sizes.map((s, k) => (
            <div key={k} class="grid grid-cols-[1fr_5rem_5rem_auto] gap-1.5 items-end">
              <Field label="Size"><input value={s.label} placeholder="M" onInput={(e) => set({ sizes: d.sizes.map((x, j) => (j === k ? { ...x, label: (e.target as HTMLInputElement).value } : x)) })} class={inputCls} /></Field>
              <Field label="Height mm"><input inputMode="numeric" value={s.mm} onInput={(e) => set({ sizes: d.sizes.map((x, j) => (j === k ? { ...x, mm: (e.target as HTMLInputElement).value } : x)) })} class={`${inputCls} num`} /></Field>
              <Field label="Grams / pc"><input inputMode="numeric" value={s.g} onInput={(e) => set({ sizes: d.sizes.map((x, j) => (j === k ? { ...x, g: (e.target as HTMLInputElement).value } : x)) })} class={`${inputCls} num`} /></Field>
              <button type="button" aria-label="Remove size" onClick={() => set({ sizes: d.sizes.filter((_, j) => j !== k) })} class="w-8 h-8 !min-h-0 rounded-full flex items-center justify-center text-c3 cursor-pointer"><Icon name="close" size={13} /></button></div>))}
          <button type="button" onClick={() => set({ sizes: [...d.sizes, { label: "", mm: "", g: "" }] })} class="text-[12px] font-semibold underline underline-offset-2 self-start cursor-pointer !min-h-0">Add a size</button></Row>
        <button type="button" onClick={onPrice} class="w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-xl border border-line bg-c0 cursor-pointer !min-h-0"><span class="text-[13px] font-semibold">Price</span><span class="t-meta min-w-0 flex-1 break-words">{Number(d.price) > 0 ? <b class="num text-c4">{inr(Number(d.price))}</b> : "optional · opens Nexcal"}</span><span class="text-c3"><Icon name="right" size={13} /></span></button>
      </div>
    </div>
  );
  return body;
}

/* ---------------------------------------------------------------- small Nexcal in the side panel */
function PricePanel({ grams, current, onBack, onUse }: { grams: number; current: number; onBack: () => void; onUse: (v: number) => void }) {
  const dflt = emptyNexcalInputs();
  const [f, setF] = useState({ g: grams ? String(grams) : "", h: "", min: "", kg: String(dflt.filamentCostPerKg), m: String(dflt.marginPercent), mat: dflt.material });
  const n = (s: string) => Number(s) || 0;
  const r = useMemo(() => calculateNexcal({ ...dflt, material: f.mat, filamentGrams: n(f.g), printHours: n(f.h), labourMinutes: n(f.min), filamentCostPerKg: n(f.kg), marginPercent: n(f.m), orderQty: 1 }, nexcalSig.value), [f]);
  const num = (k: "g" | "h" | "min" | "kg" | "m", label: string, unit: string) => <Field label={label}><span class="relative block"><input inputMode="decimal" value={f[k]} onInput={(e) => setF({ ...f, [k]: (e.target as HTMLInputElement).value })} class={`${inputCls} num !pr-9`} /><span class="absolute right-3 top-2 text-[12px] text-c2 pointer-events-none">{unit}</span></span></Field>;
  const ok = n(f.g) > 0 || n(f.h) > 0;
  return (
    <div class="flex flex-col min-h-full gap-3.5">
      <div class="flex items-center gap-2"><button type="button" aria-label="Back to design" onClick={onBack} class="w-7 h-7 !min-h-0 rounded-full bg-c1 flex items-center justify-center cursor-pointer"><Icon name="back" size={14} /></button><h2 class="text-[17px] font-semibold tracking-tight flex-1">Price<span class="t-meta font-normal ml-2">Nexcal · FDM</span></h2></div>
      <div class="rounded-xl bg-c1/60 p-3"><div class="t-section !text-c2">Suggested price per piece</div><div class="t-meta mt-1">incl. {nexcalSig.value.gstPercent}% GST</div><div class="num text-[32px] font-semibold leading-none mt-0.5">{ok ? inr(r.finalPriceRounded) : "—"}</div></div>
      <div class="grid grid-cols-2 gap-2.5">{num("g", "Filament", "g")}{num("h", "Print time", "h")}</div>
      <Field label="Material"><select value={f.mat} onChange={(e) => setF({ ...f, mat: (e.target as HTMLSelectElement).value })} class={`${inputCls} cursor-pointer`}>{NEXCAL_MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
      <div class="grid grid-cols-2 gap-2.5">{num("kg", "Filament price", "₹/kg")}{num("min", "Labour", "min")}</div>
      <div class="grid grid-cols-2 gap-2.5">{num("m", "Margin", "%")}</div>
      <Row title="Cost breakdown" meta="material, machine, labour">
        {([["Filament and parts", r.totalMaterialsCost], ["Machine time", r.machineCost], ["Labour", r.totalLabourCost], ["Landed cost", r.unitLandedCost], ["Price before GST", r.calcPrice], ["GST", r.gstAmount]] as const).map(([l, v]) => <div key={l} class="flex justify-between gap-3 text-[13px]"><span class="text-c3">{l}</span><span class="num">{inr(v)}</span></div>)}</Row>
      <p class="t-meta">Uses the Pricing settings from Nexcal, so a price here matches a quote.</p>
      <div class="sticky -bottom-4 -mx-4 -mb-4 mt-auto border-t border-line bg-c0 px-4 py-3 flex gap-2">
        {current > 0 && <Button variant="outline" onClick={() => onUse(0)}>Clear price</Button>}
        <Button class="flex-1" icon="check" disabled={!ok} onClick={() => onUse(r.finalPriceRounded)}>{ok ? `Use ${inr(r.finalPriceRounded)} as price` : "Fill in filament or time"}</Button>
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
        <select aria-label="Add a whole category" value="" onChange={(e) => { const c = (e.target as HTMLSelectElement).value; if (c) setIds([...new Set([...ids, ...all.filter((d) => d.catId === c).map((d) => d.id)])]); }} class="h-7 px-2 rounded-full border border-line bg-c0 text-[12px] font-semibold cursor-pointer">
          <option value="">+ Whole category</option>{nexderCatsSig.value.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
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
function Storage({ writable }: { writable: boolean }) {
  const [sp, setSp] = useState<Space | null>(null), [err, setErr] = useState(""), [res, setRes] = useState<Check[] | null>(null), [busy, setBusy] = useState(false);
  const pv = previewBytes();
  const load = () => driveSpace().then(setSp).catch((e) => setErr((e as Error).message));
  const bar = (v: number, max: number) => <div class="h-1.5 rounded-full bg-c1 overflow-hidden"><div class={`h-full ${v / max > 0.9 ? "bg-red" : "bg-acc"}`} style={{ width: `${Math.min(100, (v / max) * 100)}%` }} /></div>;
  return (
    <details class="rounded-[var(--radius-card)] bg-c0 min-w-0" onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open && !sp) load(); }}>
      <summary class="flex items-center gap-2 min-h-10 px-3 py-2 select-none"><span class="chev text-c2 inline-flex"><Icon name="right" size={12} /></span><span class="text-[13px] font-semibold">Storage</span><span class="ml-auto t-meta text-right">Google Drive and previews</span></summary>
      <div class="px-3 pb-3 grid gap-3">
        <div class="grid gap-1"><div class="flex justify-between gap-3 text-[13px]"><span>Google Drive</span><span class="num">{sp ? `${fmtBytes(sp.usage)}${sp.limit ? ` of ${fmtBytes(sp.limit)}` : ""}` : err ? "unavailable" : "…"}</span></div>
          {sp?.limit ? bar(sp.usage, sp.limit) : null}
          <span class="t-meta">{err || `Shared with Gmail and Docs on the same account. Uploads stop ${fmtBytes(LIMITS.driveReserve)} before it is full.`}</span></div>
        <div class="grid gap-1"><div class="flex justify-between gap-3 text-[13px]"><span>Previews (Supabase)</span><span class="num">{fmtBytes(pv)} of {fmtBytes(LIMITS.previewBytes)}</span></div>{bar(pv, LIMITS.previewBytes)}</div>
        {writable && <div class="grid gap-2"><div><Button variant="outline" disabled={busy} onClick={async () => { setBusy(true); setRes(null); setRes(await checkDrive().catch((e) => [{ step: "Check", ok: false, note: (e as Error).message }])); setBusy(false); load(); }}>{busy ? "Checking…" : "Check Google Drive"}</Button></div>
          {res && <ul class="grid gap-1">{res.map((c) => <li key={c.step} class="text-[12.5px] break-words"><b class={c.ok ? "text-grn" : "text-red"}>{c.ok ? "OK" : "Failed"}</b> · {c.step}{c.note ? <span class="text-c3"> · {c.note}</span> : null}</li>)}</ul>}</div>}
      </div>
    </details>
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
