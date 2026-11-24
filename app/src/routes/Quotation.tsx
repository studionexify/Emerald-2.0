/** Quotation: every quote, from the first draft to the client's answer. A quote is the start of an order, and approving it sends that order to Production. */
import { useEffect, useState } from "preact/hooks";
import { Button, Card, Icon, Page, Pick, Sheet, Status, Table, askText } from "../ui";
import { Menu } from "../ui/disclose";
import { lazy, navigate } from "../router";
import { inr, log, openOrderSig, ordersSig, quotesSig, shortDate, today, type Order, type Quote } from "../data";
import { segmentOf, SEGMENT_HREF, SEGMENT_LABEL } from "../data/inventory";
import { declineQuote, duplicateDraft, putQuote, reopenQuote, type QuoteDraft } from "../data/quoting";
import { pdfName, quoteBlob, saveBlob } from "./quotation/pdf-lazy";

const QuoteWindow = lazy<{ order?: Order; quote?: Quote; seed?: QuoteDraft; onClose: () => void; onSaved: (o: Order, q: Quote) => void }>(() => import("./quotation/QuoteWindow").then((m) => m.QuoteWindow));
const QuoteFlow = lazy<{ order: Order; onClose: () => void; start?: "approve" }>(() => import("./work/ClientFlow").then((m) => m.QuoteFlow));

/** The quotation exactly as the client gets it: the real PDF, both pages side by side, each fitted to the window so nothing scrolls. */
function PdfView({ q }: { q: Quote }) {
  const [url, setUrl] = useState(""), [err, setErr] = useState("");
  useEffect(() => { let u = ""; let live = true; quoteBlob(q).then((b) => { if (live) { u = URL.createObjectURL(b); setUrl(u); } }, (e) => setErr((e as Error).message)); return () => { live = false; if (u) URL.revokeObjectURL(u); }; }, [q.id, JSON.stringify(q.lines), q.valid, q.address, q.tech, q.customer]);
  if (err) return <p class="p-4 text-[13px] text-red">Could not show the PDF: {err}</p>;
  if (!url) return <p class="p-4 t-meta">Making the PDF…</p>;
  return <div class="h-full w-full flex gap-3 p-3 bg-c1 max-md:flex-col max-md:overflow-y-auto">{[1, 2].map((n) => <iframe key={n} src={`${url}#page=${n}&view=Fit&toolbar=0&navpanes=0&scrollbar=0`} title={`Quotation ${q.no} page ${n}`} class="flex-1 min-w-0 max-md:min-h-[90dvh] h-full border-0 rounded-lg bg-c0" />)}</div>;
}
const val = (q: Quote) => q.lines.reduce((s, l) => s + l.qty * l.rate, 0) * (1 + q.gstRate / 100);
const tone = (q: Quote) => (q.outcome === "approved" ? "done" : q.outcome === "lost" ? "blocked" : q.sent ? "active" : "waiting") as "done";
const label = (q: Quote) => (q.outcome === "approved" ? "Approved" : q.outcome === "lost" ? "Rejected" : q.outcome === "unrecorded" ? "Unrecorded" : q.sent ? `Sent · ${shortDate(q.sent)}` : "Draft");
const FILTERS = ["all", "open", "approved", "lost", "unrecorded"];

export function Quotation() {
  const [f, setF] = useState("all"), [qs, setQs] = useState("");
  const [win, setWin] = useState<null | { order?: Order; quote?: Quote; seed?: QuoteDraft }>(null);
  const [view, setView] = useState<Quote | null>(null), [flow, setFlow] = useState<null | { order: Order; approve?: boolean }>(null);
  const [msg, setMsg] = useState("");
  const orderOf = (q: Quote) => ordersSig.value.find((o) => o.no === q.orderNo);
  const all = quotesSig.value;
  const rows = [...all].filter((q) => f === "all" || q.outcome === f)
    .filter((q) => !qs.trim() || `${q.no} ${q.customer} ${q.orderNo ?? ""}`.toLowerCase().includes(qs.trim().toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date) || b.no.localeCompare(a.no));
  const cnt = (s: string) => all.filter((q) => q.outcome === s).length;
  const typeOf = (q: Quote) => { const o = orderOf(q); return o ? (o.size === "b2b" ? "B2B" : SEGMENT_LABEL[segmentOf(o)] === "Bulk & B2B" ? "Bulk" : SEGMENT_LABEL[segmentOf(o)]) : "—"; };

  const download = async (q: Quote) => { setMsg(`Making the PDF for ${q.no}…`); try { saveBlob(await quoteBlob(q), pdfName(q, q.customer)); setMsg(`${q.no} saved to your downloads.`); } catch (e) { setMsg(`Could not make the PDF: ${(e as Error).message}`); } };
  const reject = async (q: Quote) => {
    const why = await askText(`Why was ${q.no} rejected? (optional)`, { ok: "Mark rejected" }); if (why === null) return;
    const o = orderOf(q); if (o) declineQuote(o, why); else { putQuote(q.id, { outcome: "lost", lostWhy: why.trim() || undefined }); log("Quotation declined", q.no); }
  };
  const reopen = (q: Quote) => { const o = orderOf(q); if (o) reopenQuote(o); else putQuote(q.id, { outcome: "open", lostWhy: undefined }); };
  const goOrder = (q: Quote) => { const o = orderOf(q); if (!o) return; openOrderSig.value = o.no; navigate(SEGMENT_HREF[segmentOf(o)]); };
  const copy = (q: Quote) => { const o = orderOf(q); if (o) setWin({ seed: duplicateDraft(o, q) }); };

  const primary = (q: Quote) => {
    const o = orderOf(q);
    if (q.outcome === "approved") return o ? <Button variant="outline" onClick={() => goOrder(q)}>Open order</Button> : null;
    if (q.outcome === "lost") return <Button variant="outline" onClick={() => reopen(q)}>Reopen</Button>;
    return o ? <Button onClick={() => setFlow({ order: o, approve: true })}>Approve</Button> : null;
  };
  const menu = (q: Quote) => { const o = orderOf(q); return <Menu label={`Actions for ${q.no}`} items={[
    { label: "View", on: () => setView(q) },
    { label: "Download PDF", on: () => download(q) },
    { label: "Edit", on: () => o && setWin({ order: o, quote: q }), hidden: !o || q.outcome === "approved" },
    { label: "Send to client…", on: () => o && setFlow({ order: o }), hidden: !o || q.outcome === "approved" || q.outcome === "lost" },
    { label: "Reject", on: () => reject(q), hidden: q.outcome === "approved" || q.outcome === "lost", danger: true },
    { label: "Open order", on: () => goOrder(q), hidden: !o || q.outcome === "approved" },
    { label: "Duplicate", on: () => copy(q), hidden: !o },
  ]} />; };

  return (
    <Page title="Quotation" sub="Every quote and its answer. Approving one starts its order in Production."
      actions={<Button icon="plus" onClick={() => setWin({})}>Create Quote</Button>}
      toolbar={<div class="flex flex-wrap items-center gap-2">
        <Pick value={f} on={setF} items={FILTERS} label={(s) => (s === "all" ? "All" : s === "lost" ? "Rejected" : s[0].toUpperCase() + s.slice(1))} />
        <input type="search" value={qs} onInput={(e) => setQs((e.target as HTMLInputElement).value)} placeholder="Search quote, client or order" aria-label="Search quotations" class="h-9 px-3 rounded-lg border border-line bg-c0 text-[13px] min-w-[200px]" />
      </div>}>
      {win && <QuoteWindow {...win} onClose={() => setWin(null)} onSaved={(_o, q) => setMsg(`${q.no} saved.`)} />}
      {flow && <QuoteFlow order={flow.order} start={flow.approve ? "approve" : undefined} onClose={() => setFlow(null)} />}
      {view && <Sheet win onClose={() => setView(null)} title={`${view.no} · ${view.customer}`}
        footer={<div class="flex-1 min-w-0 !h-auto flex items-center justify-end gap-2 flex-wrap [&_button]:!h-9"><Button variant="outline" onClick={() => setView(null)}>Close</Button><Button icon="in" onClick={() => download(view)}>Download PDF</Button></div>}>
        <div class="h-full min-h-0"><PdfView q={quotesSig.value.find((x) => x.id === view.id) ?? view} /></div>
      </Sheet>}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        {([["Open", cnt("open")], ["Approved", cnt("approved")], ["Rejected", cnt("lost")], ["Open value", inr(all.filter((q) => q.outcome === "open").reduce((s, q) => s + val(q), 0))]] as const).map(([l, v]) =>
          <div key={l} class="rounded-2xl bg-c0 px-3 py-2"><div class="t-meta">{l}</div><div class="num text-[17px] font-semibold">{v}</div></div>)}
      </div>
      {msg && <p class="text-[13px] mb-2" role="status">{msg}</p>}
      <Card class="!py-1">
        {rows.length ? <Table rows={rows} rowKey={(q) => q.id} onRow={(q) => setView(q)} act={(q) => <>{primary(q)}{menu(q)}</>} cols={[
          { key: "n", label: "Quote", render: (q) => <b>{q.no}</b> },
          { key: "t", label: "Type", render: (q) => typeOf(q) },
          { key: "c", label: "Client", render: (q) => <span class="font-medium">{q.customer || "—"}</span> },
          { key: "o", label: "Order", render: (q) => q.orderNo ?? "—" },
          { key: "i", label: "Items", level: 2, render: (q) => String(q.lines.length) },
          { key: "d", label: "Date", render: (q) => shortDate(q.date) },
          { key: "v", label: "Valid till", render: (q) => <span class={q.outcome === "open" && q.valid < today() ? "text-red font-semibold" : ""}>{shortDate(q.valid)}</span> },
          { key: "s", label: "Status", card: "status", render: (q) => <Status tone={tone(q)}>{label(q)}</Status> },
          { key: "a", label: "Value", align: "right", render: (q) => inr(val(q)) },
        ]} /> : <p class="p-4 text-[13px] text-c3 flex items-center gap-2"><Icon name="doc" size={16} />{all.length ? "No quotations match." : "No quotations yet. Press Create Quote to make the first one."}</p>}
      </Card>
    </Page>
  );
}
