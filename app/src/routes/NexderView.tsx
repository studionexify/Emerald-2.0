/** The design view: a side column on desktop, a centred window on tablet and phone. Loaded only when a design is opened. */
import { useEffect, useRef, useState } from "preact/hooks";
import { ask, Button, DetailHead, Icon, Sheet } from "../ui";
import { inr, shortDate } from "../data";
import { buildPack, catName, catsOf, cleanLink, deleteDesign, downloadFile, downloadPhoto, materialUsage, openSink, reupload, usedIn, type NxDesign } from "../data/nexder";
import { isQueued } from "../data/nexder-queue";
import { chipCls, g, kind, mb, mins, Pic } from "./nexder-ui";

export function ViewPanel({ d, writable, inline, hidden, onClose, onEdit, onShare, onAssign }: { d: NxDesign; writable: boolean; /** shown in the side column on desktop (several designs can be compared by clicking one after another); otherwise a centred window */ inline?: boolean; /** another dialog (share, assign) is open on top */ hidden?: boolean; onClose: () => void; onEdit: () => void; onShare: () => void; onAssign: () => void }) {
  const [i, setI] = useState(0), [busy, setBusy] = useState(""), [missing, setMissing] = useState(""), asking = useRef(false);
  const ph = d.photos[Math.min(i, d.photos.length - 1)];
  const usage = materialUsage(d.id), total = usage.reduce((a, u) => a + u.total, 0), link = d.source ? cleanLink(d.source) : null;
  useEffect(() => { setI(0); setMissing(""); }, [d.id]);
  const get = async (f: { id: string; name: string; drive?: string }) => { setBusy(f.id); setMissing(""); setMissing((await downloadFile(f)) ?? ""); setBusy(""); };
  const getPhoto = async (p: { id: string; name: string; drive?: string }) => { setBusy("ph" + p.id); setMissing(""); setMissing((await downloadPhoto(p)) ?? ""); setBusy(""); };
  const all = async () => { for (const f of d.files) { await get(f); await new Promise((r) => setTimeout(r, 600)); } };
  /* the browser asks where to save first (needs the click), then the photos are fetched from Drive one by one into the zip */
  const zipPhotos = async () => {
    const sink = await openSink(`${d.name} photos.zip`); if (!sink) return;
    setBusy("zip"); setMissing("");
    try { const r = await buildPack([d], { images: "all" }, sink, () => {}); if (r.missing) setMissing(`${r.missing} photo${r.missing > 1 ? "s" : ""} could not be fetched from Google Drive.`); } catch (e) { setMissing((e as Error).message); }
    setBusy("");
  };
  const del = async () => { asking.current = true; const yes = await ask(`Delete “${d.name}”? It goes to the Bin, and its files to Google Drive's trash until the Bin is emptied. ${usedIn(d).length ? `It is used in ${usedIn(d).join(", ")}, so the number ${d.no} is retired: it stays blank and is never given to another design.` : `It is not used anywhere, so the number ${d.no} goes to the next design added.`}`, { ok: "Delete design" }); asking.current = false; if (yes) { const e = await deleteDesign(d); if (e) setMissing(e); else onClose(); } };
  const pend = d.photos.filter((p) => p.pend && !p.drive);
  const photos = (
        <div class={`min-w-0 flex flex-col gap-2 ${inline ? "" : "md:min-h-0"}`}>
          <div class={`rounded-2xl overflow-hidden bg-c1 ${inline ? "aspect-[4/3]" : "aspect-square md:aspect-auto md:flex-1 md:min-h-0"}`}><div class="relative w-full h-full"><Pic id={ph?.id} alt={d.name} class="!object-contain" />
            {ph && writable && <button type="button" aria-label={`Download photo ${i + 1}`} title="Download this photo" disabled={busy === "ph" + ph.id} onClick={() => getPhoto(ph)} class="absolute right-2 bottom-2 h-8 px-3 !min-h-0 rounded-full bg-c0/90 border border-line text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer shadow"><Icon name="in" size={13} />{busy === "ph" + ph.id ? "…" : "Download"}</button>}</div></div>
          {d.photos.length > 1 && <div class="flex gap-1.5 overflow-x-auto shrink-0">{d.photos.map((p, k) => (
            <button key={p.id} type="button" onClick={() => setI(k)} aria-label={`Photo ${k + 1}`} aria-pressed={k === i} class={`w-11 h-11 !min-h-0 shrink-0 rounded-lg overflow-hidden bg-c1 p-0 cursor-pointer ${k === i ? "ring-2 ring-c4" : ""}`}><Pic id={p.id} alt="" /></button>))}</div>}
        </div>
  );
  const details = (
        <div class={`min-w-0 flex flex-col gap-3 text-[13px] ${inline ? "" : "md:min-h-0 md:overflow-y-auto overscroll-contain"}`}>
          <div class="flex items-end gap-3 flex-wrap shrink-0"><div><div class="t-meta">Number</div><div class="num text-[22px] font-semibold leading-none mt-0.5">{d.no}</div></div>
            <div class="ml-auto flex flex-wrap justify-end gap-1">{catsOf(d).length ? catsOf(d).map((id) => <span key={id} class={`${chipCls} bg-c1 text-c3`}>{catName(id)}</span>) : <span class="t-meta">No category</span>}</div></div>
          {(d.price || d.designer || link || d.sizes?.length) ? <div class="grid gap-1 rounded-xl bg-c1/50 px-3 py-2 shrink-0">
            {d.price ? <div class="flex justify-between gap-3"><span class="text-c3">Price</span><b class="num">{inr(d.price)}</b></div> : null}
            {d.sizes?.map((s) => <div key={s.label} class="flex justify-between gap-3"><span class="text-c3 min-w-0">{s.label}{s.mm ? ` · ${s.mm} mm` : ""} <span class={`text-[11px] font-semibold ${s.sliced ? "text-grn" : "text-amb"}`}>{s.sliced ? "sliced" : "est."}</span></span><b class="num shrink-0">{s.g} g{s.min ? ` · ${mins(s.min)}` : ""}</b></div>)}
            {d.designer && <div class="flex justify-between gap-3"><span class="text-c3">Designer</span><b class="min-w-0 truncate text-right" title={d.designer}>{d.designer}</b></div>}
            {link && <div class="flex justify-between gap-3"><span class="text-c3">Original page</span><a href={link} target="_blank" rel="noopener noreferrer" class="min-w-0 truncate text-right underline underline-offset-2 font-semibold">{new URL(link).hostname.replace(/^www\./, "")} ↗</a></div>}</div> : null}
          {d.desc && <p class="text-c3 line-clamp-2 break-words shrink-0" title={d.desc}>{d.desc}</p>}
          <div class="shrink-0">
            <div class="flex items-center justify-between mb-1"><span class="t-section">Files</span><span class="flex gap-3">
              {writable && d.files.length > 1 && <button type="button" onClick={all} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Download all</button>}
              {writable && d.photos.length > 0 && <button type="button" disabled={busy === "zip"} onClick={zipPhotos} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">{busy === "zip" ? "Preparing…" : "Photos (zip)"}</button>}</span></div>
            {d.files.length ? <div class="grid gap-1 max-h-[7.5rem] overflow-y-auto">{d.files.map((f) => (
              <div key={f.id} class="flex items-center gap-2 rounded-lg bg-c1/60 px-2.5 py-1.5"><span class="text-c3"><Icon name="file" size={14} /></span>
                <span class="min-w-0 flex-1"><b class="block text-[13px] font-medium truncate" title={f.name}>{f.name}</b><span class="t-meta">{kind(f.name)} · {mb(f.size)} · {f.drive ? "in Google Drive" : isQueued(d.id, f.id) ? "uploading…" : f.pend ? "not uploaded yet" : "not in Drive"}</span></span>
                {writable && f.pend && !f.drive ? (isQueued(d.id, f.id) ? null : <Reup d={d} kind="file" id={f.id} />) : writable && <Button variant="outline" icon="in" class="!h-7 !px-2.5 !text-[12px]" disabled={busy === f.id} onClick={() => get(f)}>{busy === f.id ? "…" : "Get"}</Button>}</div>))}</div>
              : <p class="t-meta">No design file. Photos alone are fine.{writable ? " Edit the design to add one." : ""}</p>}
            {writable && pend.length > 0 && <div class="mt-1 grid gap-1">{pend.map((p) => (
              <div key={p.id} class="flex items-center gap-2 rounded-lg bg-amb-bg/50 px-2.5 py-1.5"><span class="text-c3"><Icon name="image" size={14} /></span><span class="min-w-0 flex-1"><b class="block text-[13px] font-medium truncate" title={p.name}>{p.name}</b><span class="t-meta">{isQueued(d.id, p.id) ? "original uploading…" : "original photo not uploaded yet"}</span></span>
                {!isQueued(d.id, p.id) && <Reup d={d} kind="photo" id={p.id} />}</div>))}</div>}
            {!writable && d.files.length > 0 && <p class="t-meta mt-1">Your role can view designs but not download files.</p>}
            {missing && <p role="status" class="t-meta mt-1 text-amb">{missing}</p>}
          </div>
          <details class="rounded-xl border border-line bg-c0 min-w-0 shrink-0">
            <summary class="flex items-center gap-2 px-3 py-2"><span class="font-semibold">Material in live orders</span><span class="t-meta min-w-0 flex-1 text-right truncate">{usage.length ? `${usage.length} order${usage.length > 1 ? "s" : ""} · ${g(total)} to print` : "none"}</span><span class="chev text-c3 inline-flex"><Icon name="right" size={13} /></span></summary>
            <div class="border-t border-line p-2 grid gap-1.5 max-h-40 overflow-y-auto">{usage.length ? usage.map((u) => (
              <div key={u.orderNo} class="rounded-lg bg-c1/60 px-3 py-2"><div class="flex items-baseline gap-2"><b class="min-w-0 flex-1 break-words">{u.orderNo}<span class="t-meta font-normal"> · {u.customer || "In-house"}</span></b><b class="num">{u.gEach ? `${u.estimated ? "~" : ""}${g(u.total)}` : "no grams"}</b></div>
                <div class="t-meta mt-0.5 break-words">{u.pending} pcs left{u.heightMm ? ` · ${u.heightMm} mm` : ""}{u.gEach ? ` · ${u.estimated ? "~" : ""}${Math.round(u.gEach)} g each` : ""}{u.colours.length ? ` · ${u.colours.join(", ")}` : ""}</div></div>))
              : <p class="t-meta">No live order uses this design. Assign it to an order and the grams still to print show here.</p>}</div>
          </details>
          <div class="mt-auto flex items-center justify-between gap-3 pt-1 shrink-0"><span class="t-meta">Added {shortDate(d.created)} by {d.by}</span>
            {writable && <button type="button" onClick={del} class="text-[12px] text-red underline underline-offset-2 cursor-pointer !min-h-0">Delete design</button>}</div>
        </div>
  );
  if (inline) return (
    <div class="flex flex-col min-h-full gap-3.5">
      <DetailHead title={d.name} onClose={onClose} />
      {photos}
      {details}
      <div class="sticky -bottom-4 -mx-4 -mb-4 mt-auto border-t border-line bg-c0 px-4 py-3 flex gap-2 [&>*]:flex-1">{<><Button variant="outline" icon="share" onClick={onShare}>Share</Button>
        {writable && <Button variant="outline" icon="edit" onClick={onEdit}>Edit</Button>}
        {writable && <Button icon="link" onClick={onAssign}>Assign to order</Button>}</>}</div>
    </div>
  );
  return (
    <Sheet win open={!hidden} onClose={() => { if (!asking.current) onClose(); }} title={<span title={d.name}>{d.name}</span>}
      footer={<div class="flex-1 min-w-0 !h-auto flex gap-2 [&>*]:flex-1 [&_button]:!h-9 pb-1">{<><Button variant="outline" icon="share" onClick={onShare}>Share</Button>
        {writable && <Button variant="outline" icon="edit" onClick={onEdit}>Edit</Button>}
        {writable && <Button icon="link" onClick={onAssign}>Assign to order</Button>}</>}</div>}>
      <div class="md:h-full grid md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-x-5 gap-y-3 px-4 pb-3 md:pb-2">
        {photos}
        {details}
      </div>
    </Sheet>
  );
}

/** Pick the original again for something that never finished uploading. */
function Reup({ d, kind, id }: { d: NxDesign; kind: "photo" | "file"; id: string }) {
  return <label class="h-7 px-2.5 rounded-full border border-line bg-c0 text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"><Icon name="in" size={12} /> Upload again
    <input type="file" class="sr-only" accept={kind === "photo" ? "image/*" : undefined} onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) reupload(d, kind, id, f); (e.target as HTMLInputElement).value = ""; }} /></label>;
}

