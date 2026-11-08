import { useEffect, useState } from "preact/hooks";
import { Button, Card, DetailHead, Icon, Section, Status, KV } from "../../ui";
import { inr, orderTotal, ordersSig, shortDate, STAGES, type Order, printersSig, jobsSig, today, clientsSig, toBin, log, me, duplicateOrder, STAGE_LABEL, TYPE_LABEL, type Client } from "../../data";
import { OrderDetail, TypeChips, WorkShell, type TypeFilter } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";
const PAGE = 25;

/** Pipeline tracker: one segmented strip, each stage a count + share bar. */
function StageStrip({ list }: { list: Order[] }) {
  const live = list.filter((o) => o.stage !== "archived");
  const max = Math.max(1, ...STAGES.map((s) => list.filter((o) => o.stage === s.key).length));
  return (
    <div class="grid grid-cols-4 md:grid-cols-8 rounded-[var(--radius-card)] bg-c0 border border-line overflow-hidden divide-x divide-line">
      {STAGES.map((s) => {
        const n = list.filter((o) => o.stage === s.key).length;
        return (
          <a key={s.key} href="/work/orders" class="px-3 py-2 min-w-0 hover:bg-c1/60 border-line max-md:[&:nth-child(n+5)]:border-t">
            <div class="t-meta truncate">{s.label}</div>
            <div class="num text-[17px] font-semibold leading-tight">{n}</div>
            <div class="mt-1.5 h-1 rounded-full bg-c1 overflow-hidden"><div class="h-full bg-c4 rounded-full" style={{ width: `${(n / max) * 100}%` }} /></div>
          </a>
        );
      })}
      <span class="sr-only">{live.length} live orders</span>
    </div>
  );
}

const DAY = 86400000;
/** Small / Bulk / B2B (business clients, with their kind of shop). */
function kindOf(o: Order, c?: Client) {
  if (o.type === "inhouse") return "In-house";
  if (o.type === "bulk") return "Bulk";
  if (c && (c.kind === "Business" || c.gstin)) return c.medium ? `B2B · ${c.medium}` : "B2B";
  return "Small";
}
const left = (d: string) => Math.round((new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / DAY);
const leftLabel = (n: number) => (n === 0 ? "today" : n > 0 ? `${n}d left` : `${-n}d late`);

/** Row menu: client, value, edit, delete. */
function RowMenu({ o, c, onOpen, onEdit }: { o: Order; c?: Client; onOpen: (o: Order) => void; onEdit: (o: Order) => void }) {
  const [on, setOn] = useState(false);
  useEffect(() => { if (!on) return; const f = () => setOn(false); addEventListener("click", f); return () => removeEventListener("click", f); }, [on]);
  const it = "w-full text-left px-3 h-9 !min-h-0 text-[13px] hover:bg-c1 cursor-pointer flex items-center gap-2";
  return (
    <div class="relative" onClick={(e) => e.stopPropagation()}>
      <button aria-label="More" onClick={() => setOn(!on)} class="w-8 h-8 !min-h-0 rounded-lg grid place-items-center hover:bg-c1 cursor-pointer"><Icon name="more" size={16} /></button>
      {on && (
        <div class="absolute right-0 top-9 z-30 w-64 rounded-xl bg-c0 border border-line shadow-lg py-1 pop-in">
          <div class="px-3 py-2 border-b border-line text-[12px]">
            <div class="font-semibold text-[13px]">{o.customer}</div>
            {c ? <div class="text-c3">{[c.phone, c.email, c.city].filter(Boolean).join(" · ") || "No contact saved"}{c.gstin && <span class="block">GSTIN {c.gstin}</span>}{c.address && <span class="block">{c.address}</span>}</div> : <div class="text-c3">Not in clients list</div>}
          </div>
          <div class="px-3 py-2 border-b border-line flex justify-between text-[13px]"><span class="text-c3">Order value</span><b class="num">{o.type === "inhouse" ? "Internal" : inr(orderTotal(o))}</b></div>
          <div class="px-3 py-1.5 border-b border-line flex justify-between text-[12px] text-c3"><span>Order no.</span><span class="font-mono">{o.no}</span></div>
          <div class="px-3 py-1.5 border-b border-line flex justify-between text-[12px] text-c3"><span>Payment</span><span>{o.paid ? "Paid" : "Unpaid"}{o.invoiced ? " · invoiced" : ""}</span></div>
          <button class={it} onClick={() => { setOn(false); onOpen(o); }}><Icon name="right" size={14} />Open details</button>
          <button class={it} onClick={() => { setOn(false); onEdit(o); }}><Icon name="edit" size={14} />Edit order</button>
          <button class={it} onClick={() => { setOn(false); onOpen(duplicateOrder(o)); }}><Icon name="copy" size={14} />Duplicate</button>
          {c?.phone && <a class={it} href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><Icon name="out" size={14} />WhatsApp client</a>}
          <button class={`${it} text-warn`} onClick={() => { setOn(false); if (confirm(`Delete order for ${o.customer}? It goes to the Bin.`)) { toBin("Order", o, `${o.customer} · ${o.no}`, me.value?.name ?? "you"); log("Deleted order", o.no); } }}><Icon name="bin" size={14} />Delete order</button>
        </div>
      )}
    </div>
  );
}

/** Live order row: client · type | items | stage | city | deadline | ⋯ */
function OrderRow({ o, onOpen, onEdit }: { o: Order; onOpen: (o: Order) => void; onEdit: (o: Order) => void }) {
  const c = clientsSig.value.find((x) => x.name.trim().toLowerCase() === o.customer.trim().toLowerCase());
  const d = left(o.due);
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(o)} onKeyDown={(e) => e.key === "Enter" && onOpen(o)}
      class="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_110px_100px_120px_36px] items-start gap-x-4 gap-y-1 py-2.5 px-3 border-t border-line first:border-0 hover:bg-c1/60 cursor-pointer !min-h-0">
      <div class="min-w-0">
        <div class="text-[14px] font-semibold leading-snug">{o.customer}</div>
        <span class="inline-flex mt-1 px-1.5 h-5 items-center rounded bg-c1 text-[11px] font-medium text-c3">{kindOf(o, c)}</span>
      </div>
      <ul class="min-w-0 max-md:col-span-2 max-md:row-start-2 text-[13px] leading-snug">
        {o.items.map((i, k) => <li key={k} class="flex justify-between gap-3"><span class="min-w-0">{i.name}</span><span class="num text-c3 whitespace-nowrap">×{i.qty}</span></li>)}
      </ul>
      <span class="hidden md:inline-flex px-2 h-6 items-center rounded-full bg-c1 text-[12px] font-medium w-fit">{o.blocked ? "Blocked" : STAGE_LABEL[o.stage]}</span>
      <span class="hidden md:block text-[13px] text-c3 leading-6">{c?.city || "—"}</span>
      <div class="text-right md:text-left max-md:col-start-2 max-md:row-start-1">
        <div class="text-[13px] font-medium leading-6 whitespace-nowrap">{shortDate(o.due)}</div>
        <div class={`text-[11px] whitespace-nowrap ${d < 0 ? "text-c4 font-semibold" : "text-c3"}`}>({leftLabel(d)})</div>
      </div>
      <div class="hidden md:block"><RowMenu o={o} c={c} onOpen={onOpen} onEdit={onEdit} /></div>
    </div>
  );
}

/** Quick edit of the order header and line quantities. */
function EditOrder({ order, onDone }: { order: Order; onDone: (o: Order | null) => void }) {
  const [o, setO] = useState<Order>({ ...order, items: order.items.map((i) => ({ ...i })) });
  const f = "h-9 px-2 rounded-lg border border-line bg-c1 text-[13px] w-full min-w-0";
  const save = () => { ordersSig.value = ordersSig.value.map((x) => (x.id === o.id ? o : x)); log("Edited order", o.no); onDone(o); };
  return (
    <div>
      <DetailHead title={`Edit · ${order.customer}`} onClose={() => onDone(null)} />
      <div class="grid grid-cols-2 gap-2 text-[12px]">
        <label class="col-span-2">Client<input class={f} value={o.customer} onInput={(e) => setO({ ...o, customer: (e.target as HTMLInputElement).value })} /></label>
        <label>Type<select class={f} value={o.type} onChange={(e) => setO({ ...o, type: (e.target as HTMLSelectElement).value as Order["type"] })}>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>Deadline<input type="date" class={f} value={o.due} onInput={(e) => setO({ ...o, due: (e.target as HTMLInputElement).value })} /></label>
        <label class="col-span-2">Medium<input class={f} value={o.medium} onInput={(e) => setO({ ...o, medium: (e.target as HTMLInputElement).value })} /></label>
      </div>
      <h3 class="font-semibold text-sm mt-3 mb-1.5">Items</h3>
      <div class="flex flex-col gap-1.5">
        {o.items.map((i, k) => (
          <div key={k} class="grid grid-cols-[minmax(0,1fr)_70px_80px_32px] gap-1.5 items-center">
            <input class={f} value={i.name} onInput={(e) => { const it = [...o.items]; it[k] = { ...i, name: (e.target as HTMLInputElement).value }; setO({ ...o, items: it }); }} />
            <input class={f} type="number" min={0} value={i.qty} onInput={(e) => { const it = [...o.items]; it[k] = { ...i, qty: Number((e.target as HTMLInputElement).value) || 0 }; setO({ ...o, items: it }); }} />
            <input class={f} type="number" min={0} value={i.price} onInput={(e) => { const it = [...o.items]; it[k] = { ...i, price: Number((e.target as HTMLInputElement).value) || 0 }; setO({ ...o, items: it }); }} />
            <button aria-label="Remove line" class="h-9 !min-h-0 rounded-lg hover:bg-c1 grid place-items-center cursor-pointer" onClick={() => setO({ ...o, items: o.items.filter((_, j) => j !== k) })}><Icon name="close" size={14} /></button>
          </div>
        ))}
        <div class="t-meta">Name · qty · ₹ each</div>
      </div>
      <div class="flex gap-2 mt-4"><Button onClick={save}>Save</Button><Button variant="outline" onClick={() => onDone(null)}>Cancel</Button></div>
    </div>
  );
}

export default function Overview() {
  const [f, setF] = useState<TypeFilter>("all");
  const [open, setOpen] = useState<Order | null>(null);
  const [edit, setEdit] = useState<Order | null>(null);
  const [n, setN] = useState(PAGE);
  const list = ordersSig.value.filter((o) => f === "all" || o.type === f);
  const live = list.filter((o) => o.stage !== "archived").sort((a, b) => Number(!!b.blocked) - Number(!!a.blocked) || a.due.localeCompare(b.due));
  const fleet = printersSig.value.filter((p) => p.active !== false);
  const busy = fleet.filter((p) => p.status === "printing").length;
  return (
    <WorkShell detail={edit ? <EditOrder order={edit} onDone={(o) => { setEdit(null); if (o) setOpen(o); }} /> : open && <OrderDetail order={ordersSig.value.find((o) => o.id === open.id) ?? open} onClose={() => setOpen(null)} onOpen={setOpen} />} title="Production" sub="Everything on the floor, in one place" toolbar={<TypeChips value={f} onChange={setF} />}>
      <Section title="Pipeline" note={`${live.length} live`}><StageStrip list={list} /></Section>

      <Section title="Live orders" note={String(live.length)} action={<a href="/work/orders" class="t-meta whitespace-nowrap">Board →</a>}>
          <div class="rounded-[var(--radius-card)] bg-c0 border border-line">
            <div class="hidden md:grid grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_110px_100px_120px_36px] gap-x-4 px-3 h-8 items-center border-b border-line t-meta uppercase tracking-[0.06em]"><span>Client · type</span><span>Items</span><span>Stage</span><span>City</span><span>Deadline</span><span /></div>
            {live.slice(0, n).map((o) => <OrderRow key={o.id} o={o} onOpen={(x) => { setEdit(null); setOpen(x); }} onEdit={(x) => { setOpen(null); setEdit(x); }} />)}
            {live.length > n && <button onClick={() => setN(n + PAGE)} class="w-full h-9 border-t border-line text-[13px] font-medium text-c3 hover:bg-c1/60 cursor-pointer">Show {Math.min(PAGE, live.length - n)} more</button>}
          </div>
        </Section>

      <Section title="Machine fleet" note={`${busy}/${fleet.length} busy`} action={<a href="/workshop/printers" class="t-meta">All →</a>}>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {fleet.map((p) => {
            const j = jobsSig.value.find((x) => x.printer === p.name && x.status === "printing");
            const ord = j && ordersSig.value.find((o) => o.no === j.orderNo);
            const hot = !!j || p.status === "printing";
            return (
              <a key={p.id} href="/work/production" onClick={(e) => { if (ord) { e.preventDefault(); setOpen(ord); } }}
                class={`rounded-[var(--radius-card)] p-4 min-w-0 block min-h-[148px] transition-colors ${hot ? "bg-c4 text-c0 border-2 border-c4 shadow-lg" : "bg-c0 border border-line hover:bg-c1/40"}`}>
                <div class="flex items-start justify-between gap-2">
                  <div class="min-w-0"><div class="text-[16px] font-bold leading-tight">{p.name}</div><div class={`text-[12px] ${hot ? "opacity-70" : "text-c3"}`}>{p.model}</div></div>
                  {hot ? <span class="inline-flex items-center gap-1.5 px-2 h-6 rounded-full bg-c0 text-c4 text-[11px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-[#4ade80] animate-pulse" />Printing</span>
                    : <Status tone={p.status === "down" ? "blocked" : "idle"}>{p.status}</Status>}
                </div>
                {j ? (
                  <div class="mt-3">
                    <div class="text-[11px] uppercase tracking-[0.06em] opacity-70">For</div>
                    <div class="text-[15px] font-semibold leading-snug">{ord?.customer ?? j.orderNo}</div>
                    <div class="text-[13px] opacity-80">{j.item}</div>
                    <div class="text-[12px] opacity-70 num mt-1">{j.hours} h · {j.grams} g{j.operator ? ` · ${j.operator}` : ""}</div>
                  </div>
                ) : <div class="mt-3 text-[13px] text-c3">{p.status === "down" ? "Out of service" : "Free — nothing printing"}</div>}
              </a>
            );
          })}
        </div>
      </Section>

      <Section title="Queue" note={String(jobsSig.value.filter((j) => j.status === "queued").length)}>
        <Card class="!py-1">
          {jobsSig.value.filter((j) => j.status !== "done").slice(0, 6).map((j) => <KV key={j.id} label={<span>{j.item} <span class="t-meta">· {j.printer}</span></span>} value={<Status tone={jobTone(j.status)}>{j.status}</Status>} />)}
        </Card>
      </Section>
    </WorkShell>
  );
}
