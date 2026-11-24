/**
 * Create / edit a quotation. A quote is the start of an order: saving makes (or updates) the order and its quote together.
 * Left: client and items (each with its product image; click or hover + Ctrl+V). Right: Nexcal, to price the item you pick.
 * Images and print details stay on the order's lines (internal): they are not printed on the client's PDF, and they carry over when the quote is approved.
 */
import { useMemo, useRef, useState } from "preact/hooks";
import { Button, Field, Icon, inputCls, Sheet } from "../../ui";
import { lazy } from "../../router";
import { clientsSig, inr, shrinkImage, spoolsSig, storeMedia, type Order, type Quote } from "../../data";
import { rate } from "../../data/rates";
import { blankDraft, draftOf, saveQuotation, type QuoteDraft } from "../../data/quoting";
import type { Use, WorkbenchProps } from "../nexcal/Workbench";
import { quotePdf } from "./pdf-lazy";

const Workbench = lazy<WorkbenchProps>(() => import("../nexcal/Workbench").then((m) => m.Workbench));
const r2 = (n: number) => Math.round(n * 100) / 100;
const hm = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
type Item = Order["items"][number];

/** The product image spot. Click to pick, drop a file, or hover and press Ctrl+V (works even while a text box has the focus: see ui/paste.ts). */
function ImageSlot({ item, label, onPut }: { item: Item; label: string; onPut: (p: Partial<Item>) => void }) {
  const [drag, setDrag] = useState(false);
  const take = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    const [full, thumb] = await Promise.all([shrinkImage(f, 1920, 0.72), shrinkImage(f, 160, 0.6)]);
    onPut({ img: storeMedia(full, label), thumb });
  };
  const src = item.thumb || item.img;
  return (
    <div class="shrink-0 w-[88px]">
      <label tabIndex={0} title="Click to choose a picture, drop one here, or hover and press Ctrl+V to paste"
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer?.files?.[0]); }}
        class={`block w-[88px] h-[88px] rounded-xl border border-dashed overflow-hidden cursor-pointer relative ${drag ? "border-c4 bg-c1" : "border-c3/60 bg-c1/60"}`}>
        {src ? <img src={src} alt={label} class="w-full h-full object-cover" />
          : <span class="absolute inset-0 grid place-items-center text-center text-[10.5px] leading-tight text-c3 px-1.5"><span><Icon name="image" size={18} /><br />Add picture<br />or paste</span></span>}
        <input type="file" accept="image/*" class="sr-only" onChange={(e) => { take((e.target as HTMLInputElement).files?.[0]); (e.target as HTMLInputElement).value = ""; }} />
      </label>
      {src && <button type="button" class="mt-1 text-[11px] underline text-c3 cursor-pointer !min-h-0" onClick={() => onPut({ img: undefined, thumb: undefined })}>Remove picture</button>}
    </div>
  );
}

export function QuoteWindow({ order, quote, seed, onClose, onSaved }: { order?: Order; quote?: Quote; seed?: QuoteDraft; onClose: () => void; onSaved: (o: Order, q: Quote) => void }) {
  const [d, setD] = useState<QuoteDraft>(() => (order && quote ? draftOf(order, quote) : seed ?? blankDraft()));
  const [cur, setCur] = useState(0);                       // the item Nexcal is pricing
  const [feed, setFeed] = useState<{ n: number; files: File[] } | undefined>();
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const gst = quote?.gstRate ?? rate("gst");
  const put = (p: Partial<QuoteDraft>) => setD((x) => ({ ...x, ...p }));
  const putItem = (k: number, p: Partial<Item>) => setD((x) => ({ ...x, items: x.items.map((i, j) => (j === k ? { ...i, ...p } : i)) }));
  const sub = d.items.reduce((s, i) => s + i.qty * i.price, 0), tax = r2(sub * gst / 100), total = r2(sub + tax);
  const mats = useMemo(() => [...new Set(["PLA", "PETG", "ABS", "ASA", "TPU", ...spoolsSig.value.filter((s) => s.active !== false).map((s) => s.material)])].sort(), [spoolsSig.value]);
  const cols = useMemo(() => [...new Set(spoolsSig.value.filter((s) => s.active !== false).map((s) => s.colour))].sort(), [spoolsSig.value]);
  const ok = !!d.customer.trim() && d.items.some((i) => i.name.trim());
  const target = d.items[cur] ?? d.items[0];

  const use = (u: Use) => {
    if (!target) return;
    if (u.kind === "price") { putItem(cur, { price: r2(u.price / (1 + gst / 100)) }); setMsg(`Price set on “${target.name || `item ${cur + 1}`}”: ${inr(u.price)} incl. GST is ${inr(r2(u.price / (1 + gst / 100)))} before GST.`); }
    else { putItem(cur, { roughG: u.grams, roughMin: u.minutes, heightMm: u.sizeMm }); setMsg(`Weight and print time saved on “${target.name || `item ${cur + 1}`}” (internal only).`); }
  };
  const addItem = () => { setD((x) => { const last = x.items[x.items.length - 1]; return { ...x, items: [...x.items, { name: "", material: last?.material || "PLA", colour: last?.colour || "", qty: 1, price: 0, cost: 0 }] }; }); setCur(d.items.length); };
  const dropItem = (k: number) => { setD((x) => ({ ...x, items: x.items.length > 1 ? x.items.filter((_, j) => j !== k) : x.items })); setCur((c) => Math.max(0, Math.min(c, d.items.length - 2))); };

  const save = () => { const r = saveQuotation(d, order); onSaved(r.order, r.quote); return r; };
  const saveAndPdf = async () => {
    setBusy(true); setMsg("");
    try { const r = save(); await quotePdf(r.quote, r.order.customer); onClose(); } catch (e) { setMsg(`Could not make the PDF: ${(e as Error).message}`); }
    setBusy(false);
  };
  const t = "grid grid-cols-2 gap-2.5";

  return (
    <Sheet xl onClose={onClose} title={<span>{order && quote ? `Edit quotation · ${quote.no}` : "Create quotation"}</span>}
      footer={<div class="flex-1 min-w-0 !h-auto flex items-center gap-3 flex-wrap [&_button]:!h-9">
        <p class="text-[12.5px] min-w-0 flex-1 break-words" role="status">{msg || `Total ${inr(total)} incl. ${gst}% GST`}</p>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant="outline" disabled={!ok || busy} onClick={saveAndPdf}>{busy ? "Making PDF…" : "Save & download PDF"}</Button>
        <Button icon="check" disabled={!ok} onClick={() => { save(); onClose(); }}>{order ? "Save changes" : "Create quotation"}</Button>
      </div>}>
      <div class="h-full min-h-0 lg:grid lg:grid-cols-[minmax(420px,560px)_minmax(0,1fr)]">
        <div class="h-full min-h-0 overflow-y-auto overscroll-contain p-4 grid gap-4 content-start lg:border-r lg:border-line">
          <section class="grid gap-2.5">
            <h3 class="text-[14px] font-semibold">Quotation for</h3>
            <div class="flex gap-1.5 flex-wrap" role="group" aria-label="Type">
              {([["client", "Client"], ["bulk", "Bulk"], ["b2b", "B2B"]] as const).map(([k, l]) => <button key={k} type="button" aria-pressed={d.kind === k} onClick={() => put({ kind: k })} disabled={!!order && (order.size === "b2b") !== (k === "b2b") && false}
                class={`h-8 !min-h-0 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer ${d.kind === k ? "bg-c4 text-c0" : "bg-c1"}`}>{l}</button>)}
            </div>
            <Field label="Client name"><input class={inputCls} list="qw-clients" value={d.customer} placeholder="Client or company" onInput={(e) => {
              const v = (e.target as HTMLInputElement).value, c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase());
              put({ customer: v, ...(c ? { phone: d.phone || c.phone || "", email: d.email || c.email || "", address: d.address || c.address || "" } : {}) });
            }} /></Field>
            <datalist id="qw-clients">{clientsSig.value.map((c) => <option key={c.id} value={c.name} />)}</datalist>
            <div class={t}>
              <Field label="Phone"><input class={inputCls} inputMode="tel" value={d.phone} onInput={(e) => put({ phone: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="Email"><input class={inputCls} type="email" value={d.email} onInput={(e) => put({ email: (e.target as HTMLInputElement).value })} /></Field>
            </div>
            <Field label="Address on the quotation (optional)"><textarea class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" rows={2} value={d.address} onInput={(e) => put({ address: (e.target as HTMLTextAreaElement).value })} /></Field>
            <div class={t}>
              <Field label="Needed by (optional)"><input class={inputCls} type="date" value={d.due} onInput={(e) => put({ due: (e.target as HTMLInputElement).value })} /></Field>
              <Field label="Valid until"><input class={inputCls} type="date" value={d.valid} onInput={(e) => put({ valid: (e.target as HTMLInputElement).value })} /></Field>
            </div>
          </section>

          <section class="grid gap-2.5">
            <div class="flex items-center gap-2"><h3 class="text-[14px] font-semibold flex-1">Items · {d.items.length}</h3><Button variant="outline" icon="plus" onClick={addItem}>Add item</Button></div>
            <p class="t-meta">Pictures and print details are internal: they are not printed on the client's PDF, and they become the order's line pictures when the quote is approved. Prices here are before GST.</p>
            {d.items.map((i, k) => (
              <div key={k} class={`rounded-2xl border p-2.5 flex gap-3 ${k === cur ? "border-c4" : "border-line"}`} onFocusIn={() => setCur(k)}>
                <ImageSlot item={i} label={`${i.name || `Item ${k + 1}`}`} onPut={(p) => putItem(k, p)} />
                <div class="min-w-0 flex-1 grid gap-2">
                  <input class={inputCls} placeholder="Item name / description" aria-label="Item name" value={i.name} onInput={(e) => putItem(k, { name: (e.target as HTMLInputElement).value })} />
                  <div class="grid grid-cols-2 gap-2">
                    <select class={inputCls} aria-label="Material" value={i.material} onChange={(e) => putItem(k, { material: (e.target as HTMLSelectElement).value })}>{mats.map((m) => <option key={m}>{m}</option>)}</select>
                    <input class={inputCls} list="qw-cols" placeholder="Colour" aria-label="Colour" value={i.colour} onInput={(e) => putItem(k, { colour: (e.target as HTMLInputElement).value })} />
                  </div>
                  <div class="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] gap-2 items-center">
                    <input class={`${inputCls} num`} type="number" min={1} aria-label="Quantity" value={i.qty} onInput={(e) => putItem(k, { qty: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
                    <input class={`${inputCls} num`} type="number" min={0} step="any" aria-label="Price each before GST" placeholder="Price each (ex-GST)" value={i.price || ""} onInput={(e) => putItem(k, { price: Math.max(0, Number((e.target as HTMLInputElement).value) || 0) })} />
                    <b class="num text-[13px] w-24 text-right">{inr(i.qty * i.price)}</b>
                  </div>
                  <div class="flex items-center gap-2 text-[11.5px] text-c3">
                    <button type="button" class={`underline cursor-pointer !min-h-0 ${k === cur ? "font-semibold text-c4" : ""}`} onClick={() => setCur(k)}>{k === cur ? "Nexcal is pricing this item" : "Price with Nexcal"}</button>
                    {i.roughG ? <span class="num">· internal {i.roughG} g{i.roughMin ? ` · ${hm(i.roughMin)}` : ""}</span> : null}
                    <button type="button" class="ml-auto underline cursor-pointer !min-h-0" disabled={d.items.length < 2} onClick={() => dropItem(k)}>Remove item</button>
                  </div>
                </div>
              </div>))}
            <datalist id="qw-cols">{cols.map((c) => <option key={c} value={c} />)}</datalist>
          </section>

          <section class="grid gap-2">
            <Field label="Notes on the quotation (optional, one per line)"><textarea class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" rows={2} value={d.tech} onInput={(e) => put({ tech: (e.target as HTMLTextAreaElement).value })} /></Field>
            <div class="rounded-xl bg-c1/60 p-3 grid gap-1 text-[13px]">
              <div class="flex justify-between"><span class="text-c3">Sub-total</span><span class="num">{inr(sub)}</span></div>
              <div class="flex justify-between"><span class="text-c3">GST {gst}%</span><span class="num">{inr(tax)}</span></div>
              <div class="flex justify-between font-bold border-t border-line pt-1"><span>Total</span><span class="num">{inr(total)}</span></div>
            </div>
            {!ok && <p class="t-meta">Add the client's name and at least one item to save.</p>}
          </section>
        </div>

        <div class="h-full min-h-0 overflow-y-auto overscroll-contain bg-canvas p-4 max-lg:hidden">
          <div class="flex items-center gap-2 flex-wrap mb-3">
            <h3 class="text-[14px] font-semibold flex-1 min-w-0 truncate">Nexcal · pricing “{target?.name || `item ${cur + 1}`}”</h3>
            <input ref={fileIn} type="file" multiple accept=".stl,.obj,.step,.stp,.3mf" class="sr-only" onChange={(e) => { const fs = [...((e.target as HTMLInputElement).files ?? [])]; if (fs.length) setFeed({ n: (feed?.n ?? 0) + 1, files: fs }); (e.target as HTMLInputElement).value = ""; }} />
            <Button variant="outline" icon="in" onClick={() => fileIn.current?.click()}>Upload 3D files</Button>
          </div>
          <Workbench mode="embed" onUse={use} feed={feed} />
        </div>
      </div>
    </Sheet>
  );
}
