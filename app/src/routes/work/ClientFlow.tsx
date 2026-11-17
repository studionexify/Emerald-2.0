/**
 * Client orders: from the quotation to the print.
 *  1. Create the quotation, check it, send it (PDF, WhatsApp, e-mail).
 *  2. Record the client's answer. "Approved" asks only for how it was approved and the print details, then sends the order to Production.
 * Opened from the Client tab (row button) and from the order panel.
 */
import { useEffect, useMemo, useState } from "preact/hooks";
import { Button, Field, Icon, inputCls, Sheet } from "../../ui";
import { clientsSig, inr, orderTotal, quotesSig, shortDate, spoolsSig, type Order, type Quote } from "../../data";
import { approveOrder, declineQuote, ensureQuote, isPlaceholderName, markSent, orderById, putQuote, quoteLines, quoteOf, reopenQuote, saveClient } from "../../data/quoting";
import { DocSheet, fromQuote } from "./Doc";

const dig = (s: string) => { const d = s.replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
const r2 = (n: number) => Math.round(n * 100) / 100;
const Chip = ({ tone, children }: { tone: "grn" | "amb" | "red" | "mute"; children: preact.ComponentChildren }) => <span class={`inline-flex items-center rounded-full px-2.5 h-6 text-[12px] font-semibold whitespace-nowrap ${tone === "grn" ? "bg-grn-bg text-grn" : tone === "amb" ? "bg-amb-bg text-amb" : tone === "red" ? "bg-red-bg text-red" : "bg-c1 text-c3"}`}>{children}</span>;
const Block = ({ n, title, state, children, open }: { n: number; title: string; state?: preact.ComponentChildren; children: preact.ComponentChildren; open?: boolean }) => (
  <section class="rounded-2xl border border-line bg-c0 min-w-0">
    <div class="flex items-center gap-2.5 px-3.5 pt-3"><span class="w-6 h-6 rounded-full bg-c4 text-c0 text-[12px] font-bold flex items-center justify-center shrink-0">{n}</span><h3 class="text-[14px] font-semibold flex-1 min-w-0">{title}</h3>{state}</div>
    <div class="px-3.5 pb-3.5 pt-2.5 grid gap-3" data-open={open ? "" : undefined}>{children}</div>
  </section>
);

export function QuoteFlow({ order, onClose, start }: { order: Order; onClose: () => void; start?: "approve" }) {
  const o = orderById(order.id) ?? order;
  const q = quotesSig.value.find((x) => x.orderNo === o.no && x.id === quoteOf(o)?.id);
  const cl = clientsSig.value.find((c) => c.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  const [name, setName] = useState(isPlaceholderName(o.customer) ? "" : o.customer), [phone, setPhone] = useState(cl?.phone ?? ""), [email, setEmail] = useState(cl?.email ?? ""), [addr, setAddr] = useState(q?.address ?? cl?.address ?? "");
  const [busy, setBusy] = useState(""), [msg, setMsg] = useState(""), [mode, setMode] = useState<"" | "approve" | "decline">(start === "approve" && quoteOf(orderById(order.id) ?? order) ? "approve" : ""), [note, setNote] = useState(""), [po, setPo] = useState(""), [why, setWhy] = useState("");
  const [items, setItems] = useState(o.items.map((i) => ({ material: i.material, colour: i.colour })));
  const named = !isPlaceholderName(o.customer), ready = named && !!q;
  const stage = o.stage, done = !!o.approved && stage !== "quotation";
  const storeColours = useMemo(() => [...new Set(spoolsSig.value.filter((s) => s.active !== false).map((s) => s.colour))].sort(), [spoolsSig.value]);
  const storeMats = useMemo(() => [...new Set(["PLA", "PETG", "ABS", "ASA", "TPU", ...spoolsSig.value.filter((s) => s.active !== false).map((s) => s.material)])].sort(), [spoolsSig.value]);
  useEffect(() => { setAddr((a) => a || q?.address || cl?.address || ""); }, [q?.id]);

  const commitClient = () => { if (name.trim() && (name.trim() !== o.customer || phone !== (cl?.phone ?? "") || email !== (cl?.email ?? ""))) saveClient(o, { name, phone, email }); };
  const commitAddr = () => { if (q && addr !== (q.address ?? "")) putQuote(q.id, { address: addr.trim() || undefined }); if (name.trim()) saveClient(o, { name, address: addr }); };
  const create = () => { commitClient(); ensureQuote(orderById(o.id) ?? o); };
  const upd = (p: Partial<Quote>) => q && putQuote(q.id, p);
  const setGst = (incl: boolean) => q && putQuote(q.id, { inclGst: incl, lines: quoteLines(o, incl, q.gstRate) });
  const gstOf = (x: Quote) => x.lines.reduce((s, l) => s + l.qty * l.rate, 0);
  const total = q ? r2(gstOf(q) * (1 + q.gstRate / 100)) : 0;
  const file = (x: Quote) => `Quotation ${x.no} - ${o.customer}.pdf`.replace(/[\\/:*?"<>|]/g, "");
  const make = async () => { const { quotePdf } = await import("./quote-pdf"); return quotePdf(fromQuote(q!)); };
  const save = (b: Blob, n: string) => { const a = document.createElement("a"), u = URL.createObjectURL(b); a.href = u; a.download = n; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); };
  const text = () => `Hello ${o.customer}, here is the quotation ${q!.no} from Studio Nexify for ${inr(total)} (incl. GST), valid until ${shortDate(q!.valid)}. Please reply to confirm and we will start production.`;
  const run = async (how: "download" | "open" | "share" | "whatsapp" | "email") => {
    if (!q) return; setBusy(how); setMsg("");
    try {
      commitClient(); const blob = await make(), n = file(q);
      if (how === "download") { save(blob, n); setMsg("PDF saved to your downloads."); }
      else if (how === "open") { window.open(URL.createObjectURL(blob), "_blank", "noopener"); }
      else if (how === "share") { const f = new File([blob], n, { type: "application/pdf" }); await navigator.share({ files: [f], title: `Quotation ${q.no}`, text: text() }); markSent(q, "Shared"); }
      else if (how === "whatsapp") { save(blob, n); window.open(`https://wa.me/${dig(phone)}?text=${encodeURIComponent(text())}`, "_blank", "noopener"); markSent(q, "WhatsApp"); setMsg("WhatsApp opened and the PDF was saved. Attach it in the chat: a link cannot carry a file."); }
      else { save(blob, n); location.href = `mailto:${email}?subject=${encodeURIComponent(`Quotation ${q.no} · Studio Nexify`)}&body=${encodeURIComponent(text() + "\n\nThe PDF is attached.")}`; markSent(q, "Email"); setMsg("Your mail app opened and the PDF was saved. Attach it to the email."); }
    } catch (e) { if ((e as Error).name !== "AbortError") setMsg(`Could not do that: ${(e as Error).message}`); }
    setBusy("");
  };
  const canShare = typeof navigator !== "undefined" && "canShare" in navigator && (() => { try { return navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] }); } catch { return false; } })();

  const approve = () => {
    const patch = o.items.map((i, k) => ({ ...i, material: items[k]?.material || i.material, colour: items[k]?.colour ?? i.colour }));
    approveOrder(o, { note, po, items: patch }); onClose();
  };
  const outcome = q?.outcome;
  const status = outcome === "approved" ? <Chip tone="grn">Approved</Chip> : outcome === "lost" ? <Chip tone="red">Declined</Chip> : q?.sent ? <Chip tone="amb">Sent {shortDate(q.sent)}{q.via ? ` · ${q.via}` : ""}</Chip> : q ? <Chip tone="mute">Not sent yet</Chip> : <Chip tone="mute">Not created</Chip>;

  return (
    <Sheet xl onClose={onClose} title={<span class="flex items-center gap-2.5 flex-wrap"><span>Quotation · {o.no}</span>{status}</span>}
      footer={<div class="flex-1 min-w-0 !h-auto flex items-center gap-3 flex-wrap [&_button]:!h-9">
        <p class="text-[12.5px] min-w-0 flex-1 break-words">{msg || (q ? `Total ${inr(total)} incl. GST` : "Create the quotation to see the document.")}</p>
        <Button variant="outline" onClick={onClose}>Close</Button>
      </div>}>
      <div class="h-full min-h-0 lg:grid lg:grid-cols-[minmax(360px,460px)_minmax(0,1fr)]">
        <div class="h-full min-h-0 overflow-y-auto overscroll-contain p-4 grid gap-3 content-start lg:border-r lg:border-line">
          {o.blocked && /declined/i.test(o.blocked) && <div class="rounded-xl bg-red-bg text-red px-3 py-2 text-[13px] flex items-center gap-2"><span class="flex-1 min-w-0 break-words">{o.blocked}</span><button type="button" class="underline font-semibold cursor-pointer !min-h-0" onClick={() => reopenQuote(o)}>Reopen</button></div>}
          {done && <div class="rounded-xl bg-grn-bg text-grn px-3 py-2 text-[13px] font-medium">Approved and in {stage === "production" ? "Production" : stage}. Start printing from the Floor button on the Client tab.</div>}

          <Block n={1} title="Client" state={named ? <Chip tone="grn">Ready</Chip> : <Chip tone="amb">Name needed</Chip>}>
            <Field label="Name"><input class={inputCls} value={name} placeholder="Client name" onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={commitClient} /></Field>
            <div class="grid grid-cols-2 gap-2.5">
              <Field label="Phone (for WhatsApp)"><input class={inputCls} inputMode="tel" value={phone} placeholder="98765 43210" onInput={(e) => setPhone((e.target as HTMLInputElement).value)} onBlur={commitClient} /></Field>
              <Field label="Email"><input class={inputCls} type="email" value={email} placeholder="client@email.com" onInput={(e) => setEmail((e.target as HTMLInputElement).value)} onBlur={commitClient} /></Field>
            </div>
            <Field label="Address on the quotation (optional)"><textarea class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" rows={2} value={addr} onInput={(e) => setAddr((e.target as HTMLTextAreaElement).value)} onBlur={commitAddr} /></Field>
          </Block>

          <Block n={2} title="Quotation" state={q ? <span class="num text-[13px] font-semibold">{q.no}</span> : undefined}>
            {!q ? <><p class="t-meta">Made from the order's lines and prices. You can still edit it before sending.</p><Button icon="doc" disabled={!named} onClick={create}>Create quotation</Button>{!named && <p class="t-meta">Enter the client's name first.</p>}</>
              : <>
                <div class="grid grid-cols-2 gap-2.5"><Field label="Valid until"><input class={inputCls} type="date" value={q.valid} onInput={(e) => upd({ valid: (e.target as HTMLInputElement).value })} /></Field>
                  <label class="flex items-end gap-2 text-[12.5px] pb-1.5 cursor-pointer"><input type="checkbox" checked={!!q.inclGst} onChange={(e) => setGst((e.target as HTMLInputElement).checked)} /><span>Order prices already include {q.gstRate}% GST</span></label></div>
                <div class="grid gap-1.5">{q.lines.map((l, k) => (
                  <div key={k} class="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-1.5 items-end">
                    <Field label={k === 0 ? "Item" : ""}><input class={inputCls} value={l.desc} onInput={(e) => upd({ lines: q.lines.map((x, j) => (j === k ? { ...x, desc: (e.target as HTMLInputElement).value } : x)) })} /></Field>
                    <Field label={k === 0 ? "Qty" : ""}><input class={`${inputCls} num`} type="number" min={1} value={l.qty} onInput={(e) => upd({ lines: q.lines.map((x, j) => (j === k ? { ...x, qty: Number((e.target as HTMLInputElement).value) || 0 } : x)) })} /></Field>
                    <Field label={k === 0 ? "Price ex-GST" : ""}><input class={`${inputCls} num`} type="number" step="any" value={l.rate} onInput={(e) => upd({ lines: q.lines.map((x, j) => (j === k ? { ...x, rate: Number((e.target as HTMLInputElement).value) || 0 } : x)) })} /></Field>
                  </div>))}</div>
                <Field label="Technical data (one per line: print time, weight, finish, delivery)"><textarea class="w-full rounded-xl border border-line bg-c0 px-3 py-2 text-[13px] outline-none focus:border-c4" rows={3} value={q.tech ?? ""} onInput={(e) => upd({ tech: (e.target as HTMLTextAreaElement).value || undefined })} /></Field>
                <div class="flex justify-between text-[13px] border-t border-line pt-2"><span class="text-c3">Total incl. {q.gstRate}% GST</span><b class="num">{inr(total)}</b></div>
                {Math.abs(total - orderTotal(o)) > 1 && !o.approved && <p class="t-meta">The order panel says {inr(orderTotal(o))}. Approving makes the order match this quotation.</p>}
              </>}
          </Block>

          <Block n={3} title="Send to the client" state={q?.sent ? <Chip tone="grn">Sent {shortDate(q.sent)}</Chip> : undefined}>
            {!ready ? <p class="t-meta">{named ? "Create the quotation first." : "Enter the client's name first."}</p> : <>
              <div class="flex flex-wrap gap-2">
                <Button icon="in" disabled={!!busy} onClick={() => run("download")}>{busy === "download" ? "Making PDF…" : "Download PDF"}</Button>
                <Button variant="outline" icon="doc" disabled={!!busy} onClick={() => run("open")}>Open to view or print</Button>
                {canShare && <Button variant="outline" icon="share" disabled={!!busy} onClick={() => run("share")}>Share PDF…</Button>}
              </div>
              <div class="flex flex-wrap gap-2">
                <Button variant="outline" icon="out" disabled={!!busy || dig(phone).length < 10} onClick={() => run("whatsapp")}>WhatsApp</Button>
                <Button variant="outline" icon="out" disabled={!!busy || !/.+@.+/.test(email)} onClick={() => run("email")}>Email</Button>
                {!q!.sent && <Button variant="ghost" onClick={() => markSent(q!, "PDF")}>Mark as sent</Button>}
              </div>
              <p class="t-meta">{canShare ? "Share PDF sends the file itself." : "WhatsApp and email open the chat or draft and save the PDF; attach it there. A link cannot carry a file."}{dig(phone).length < 10 ? " Add a phone number for WhatsApp." : ""}{!/.+@.+/.test(email) ? " Add an email for email." : ""}</p>
            </>}
          </Block>

          <Block n={4} title="Client's answer" state={outcome === "approved" ? <Chip tone="grn">Approved</Chip> : outcome === "lost" ? <Chip tone="red">Declined</Chip> : undefined}>
            {done ? <p class="t-meta">Recorded. The order is in {stage === "production" ? "Production" : stage}.</p> : !ready ? <p class="t-meta">Available once the quotation exists.</p> : mode === "approve" ? <>
              <p class="text-[13px] font-medium">Approve and send to Production</p>
              <div class="grid grid-cols-2 gap-2.5">
                <Field label="How was it approved? (optional)"><input class={inputCls} value={note} placeholder="e.g. WhatsApp OK" onInput={(e) => setNote((e.target as HTMLInputElement).value)} /></Field>
                <Field label="PO number (optional)"><input class={inputCls} value={po} onInput={(e) => setPo((e.target as HTMLInputElement).value)} /></Field>
              </div>
              <div class="grid gap-1.5"><span class="t-meta">What to print: material and colour per item (the Floor sheet picks spools from these)</span>
                {o.items.map((i, k) => (
                  <div key={k} class="grid grid-cols-[minmax(0,1fr)_5.5rem_7.5rem] gap-1.5 items-center">
                    <span class="text-[13px] min-w-0 break-words"><b>{i.qty}×</b> {i.name}</span>
                    <select class={inputCls} aria-label={`Material for ${i.name}`} value={items[k]?.material} onChange={(e) => setItems(items.map((x, j) => (j === k ? { ...x, material: (e.target as HTMLSelectElement).value } : x)))}>{storeMats.map((m) => <option key={m}>{m}</option>)}</select>
                    <input class={inputCls} list="qf-colours" placeholder="Colour" aria-label={`Colour for ${i.name}`} value={items[k]?.colour} onInput={(e) => setItems(items.map((x, j) => (j === k ? { ...x, colour: (e.target as HTMLInputElement).value } : x)))} />
                  </div>))}
                <datalist id="qf-colours">{storeColours.map((c) => <option key={c} value={c} />)}</datalist></div>
              {items.some((x) => !x.colour.trim()) && <p class="t-meta text-amb">Some items have no colour yet. You can still approve and set it on the Floor sheet.</p>}
              <div class="flex gap-2 flex-wrap"><Button icon="check" onClick={approve}>Approve and send to Production</Button><Button variant="outline" onClick={() => setMode("")}>Back</Button></div>
            </> : mode === "decline" ? <>
              <Field label="Why did the client decline? (optional)"><input class={inputCls} value={why} onInput={(e) => setWhy((e.target as HTMLInputElement).value)} /></Field>
              <div class="flex gap-2 flex-wrap"><Button variant="outline" onClick={() => { declineQuote(o, why); setMode(""); }}>Mark as declined</Button><Button variant="ghost" onClick={() => setMode("")}>Back</Button></div>
            </> : <div class="flex flex-wrap gap-2">
              <Button icon="check" onClick={() => setMode("approve")}>Client approved</Button>
              <Button variant="outline" onClick={() => setMode("decline")}>Client declined</Button>
              {!q?.sent && <p class="t-meta w-full">You can record the answer even if you sent the quotation another way.</p>}
            </div>}
          </Block>
        </div>
        <div class="h-full min-h-0 overflow-auto bg-canvas p-4 max-lg:hidden">
          {q ? <div class="mx-auto max-w-[820px]"><DocSheet d={fromQuote(q)} /></div>
            : <div class="h-full min-h-[260px] rounded-2xl border border-dashed border-c2/60 flex items-center justify-center text-center p-6 text-c3 text-[13px]"><span><Icon name="doc" size={22} /><br />The quotation document appears here once you create it.</span></div>}
        </div>
      </div>
    </Sheet>
  );
}
