import { vOrders } from "../../data";
import { useState } from "preact/hooks";
import { signal } from "@preact/signals";
import { navigate } from "../../router";
import { ask, Pick, Button, Card, CardTitle, Chip, Fact, Field, inputCls, Progress, Section, Stat, Status, Table , Disclosure } from "../../ui";
import { Menu, MetaRow } from "../../ui/disclose";
import { toBin, teamNames, inr, orderCost, orderTotal, orderUnits, shortDate, TYPE_LABEL, jobsSig, qcSig, packRecSig, packSig, printersSig, spoolsSig, consume, jobSpool, spoolLabel, log, me, today, uid, type Job, type QcEntry, type PackRecord, type Order, machineStats } from "../../data";
import { Actions, PaneSection, useRecord, type FDef } from "../../ui/record";
import { ConsumeForm, OrderDetail, WorkShell , useOpenOrder } from "./shared";

const jobTone = (s: string) => (s === "done" ? "done" : s === "printing" ? "active" : s === "failed" ? "blocked" : "waiting") as "done";
const sel = (opts: string[]) => <select class={inputCls}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;

const jFields: FDef<Job>[] = [
  { k: "orderNo", label: "Order", type: "select", options: () => vOrders().filter((o) => o.stage !== "archived").map((o) => o.no) },
  { k: "item", label: "Item · run" },
  { k: "printer", label: "Printer", type: "select", options: () => ["—", ...printersSig.value.filter((p) => p.active !== false).map((p) => p.name)] },
  { k: "operator", label: "Operator", type: "select", options: () => ["—", ...teamNames()] },
  { k: "status", label: "Status", type: "select", options: ["queued", "printing", "done", "failed"] },
  { k: "hours", label: "Print time", type: "number", suffix: "h" }, { k: "grams", label: "Filament", type: "number", suffix: "g" },
];
/** Job handed over from Production: QC opens with it preselected. */
const qcFocus = signal<string | null>(null);
/* ── Job state machine: one primary action per state, everything else in the … menu. ── */
const setJob = (j: Job, p: Partial<Job>, why: string) => { jobsSig.value = jobsSig.value.map((x) => (x.id === j.id ? { ...x, ...p } : x)); log(why, `${j.orderNo} · ${j.item}`); };
const startJob = (j: Job) => setJob(j, { status: "printing" }, "Job started");
function finishJob(j: Job) {
  const js = jobSpool(j), sp = js ? spoolLabel(js) : "";
  setJob(j, { status: "done", spool: js?.spoolNo }, "Job done");
  if (sp) consume({ kind: "filament", item: sp, qty: j.grams, orderNo: j.orderNo, printer: j.printer });
  if (j.printer !== "—") { consume({ kind: "machine", item: j.printer, qty: j.hours, orderNo: j.orderNo, printer: j.printer }); consume({ kind: "power", item: "Electricity", qty: j.hours, orderNo: j.orderNo, printer: j.printer }); }
}
function failJob(j: Job, reason = "") {
  const js = jobSpool(j);
  setJob(j, { status: "failed" }, `Job failed${reason ? ` — ${reason}` : ""}`);
  if (js) consume({ kind: "scrap", item: spoolLabel(js), qty: Math.round(j.grams / 2), orderNo: j.orderNo, printer: j.printer });
}
const requeue = (j: Job) => { jobsSig.value = [{ ...j, id: uid(), status: "queued" }, ...jobsSig.value]; log("Re-queued job", `${j.orderNo} · ${j.item}`); };
function JobAct({ j, open }: { j: Job; open: (j: Job) => void }) {
  const primary = {
    queued: <Button onClick={() => startJob(j)}>Start</Button>,
    printing: <Button onClick={() => finishJob(j)}>Mark done</Button>,
    failed: <Button variant="outline" onClick={() => requeue(j)}>Reprint</Button>,
    done: qcSig.value.some((q) => q.orderNo === j.orderNo && q.item === j.item)
      ? <span class="t-meta px-2">QC logged</span>
      : <Button variant="outline" onClick={() => { qcFocus.value = j.id; navigate("/work/qc"); }}>Send to QC</Button>,
  }[j.status];
  return <>{primary}<Menu label={`Actions for ${j.item}`} items={[
    { label: "Open full inspector", on: () => open(j) },
    { label: "Mark failed", on: () => failJob(j), hidden: j.status !== "printing" },
    { label: "Reprint (new job)", on: () => requeue(j), hidden: j.status === "queued" || j.status === "failed" },
    { label: "Back to queue", on: () => setJob(j, { status: "queued" }, "Job back to queue"), hidden: j.status !== "printing" },
    { label: "Delete", danger: true, on: async () => { if (await ask(`Move job ${j.orderNo} · ${j.item} to the Bin?`, { ok: "Delete", danger: true })) { toBin("Job", j, `${j.orderNo} · ${j.item}`, me.value?.name ?? "You"); log("Deleted job", `${j.orderNo} · ${j.item}`); } }, hidden: j.status === "printing" },
  ]} /></>;
}
const spoolOpts = () => spoolsSig.value.filter((s) => s.active !== false && s.grams > 0).map((s) => `${s.material} ${s.colour} · ${s.spoolNo}`);
function JobRun({ j, put }: { j: Job; put: (p: Partial<Job>, why?: string) => void }) {
  const js = jobSpool(j);
  const sp = js ? spoolLabel(js) : "";
  const setSp = (v: string) => put({ spool: spoolsSig.value.find((s) => spoolLabel(s) === v)?.spoolNo }, `Spool → ${v}`);
  const [reason, setReason] = useState("");
  const after = js ? js.grams - j.grams : 0;
  return (
    <PaneSection title="Run">
      <Field label="Spool used"><select class={inputCls} value={sp} onChange={(e) => setSp((e.target as HTMLSelectElement).value)}><option value="">Choose spool</option>{spoolOpts().map((o) => <option key={o}>{o}</option>)}</select></Field>
      {js && j.status !== "done" && <div class="rounded-xl bg-c1 px-3 py-2.5 text-sm flex items-center justify-between gap-3"><span>Spool after this job</span><b class="num">{js.grams.toLocaleString("en-IN")} − {j.grams} = {after.toLocaleString("en-IN")} g</b></div>}
      {js && j.status !== "done" && after < 250 && <p class="text-xs font-semibold">{after < 0 ? `⚠ Not enough filament — short by ${-after} g. Load another spool.` : "⚠ Spool will be low after this job."}</p>}
      <Actions>
        {j.status === "queued" && <Button onClick={() => startJob(j)}>Start print</Button>}
        {j.status === "printing" && <Button onClick={() => finishJob(j)}>Mark done · draw {j.grams} g</Button>}
        {j.status === "printing" && <Button variant="outline" onClick={() => failJob(j, reason)}>Mark failed</Button>}
        {(j.status === "failed" || j.status === "done") && <Button variant="outline" onClick={() => requeue(j)}>Reprint</Button>}
      </Actions>
      {j.status === "printing" && <Field label="Failure / block reason"><input class={inputCls} value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} placeholder="Nozzle clog, spaghetti, power cut…" /></Field>}
    </PaneSection>
  );
}

export function Production() {
  const [f, setF] = useState("all");
  const r = useRecord<Job>({
    sig: jobsSig, kind: "Job", title: (j) => `${j.orderNo} · ${j.item}`, fields: jFields, logKind: "order",
    blank: () => ({ id: uid(), orderNo: vOrders().find((o) => o.stage === "production")?.no ?? vOrders()[0]?.no ?? "", item: "", printer: printersSig.value[0]?.name ?? "—", operator: me.value?.name ?? "—", status: "queued", hours: 1, grams: 100 }),
    facts: (j) => { const o = vOrders().find((x) => x.no === j.orderNo); return [["Status", <Status tone={jobTone(j.status)}>{j.status}</Status>], ["Customer", o?.customer ?? "—"], ["Printer · operator", `${j.printer} · ${j.operator}`], ["Estimate", `${j.grams} g · ${j.hours} h`]]; },
    extra: (j, put) => <JobRun j={j} put={put} />,
  });
  const jobs = jobsSig.value.filter((j) => f === "all" || j.status === f);
  return (
    <WorkShell stage="production" title="Production" sub="Build sheet at approval · one job per line item · tap a job to run it" detail={r.detail}
      actions={<><Button variant="outline" onClick={() => { const p = prompt("Which printer is blocked, and why? (e.g. A1-02 — nozzle clog)"); if (p) log("Logged block", p, "order"); }}>Log block</Button><Button icon="plus" onClick={() => r.add()}>New job</Button></>}
      toolbar={<div class="flex flex-wrap gap-2"><Pick value={f} on={setF} items={["all", "queued", "printing", "done", "failed"]} label={(s) => s === "all" ? "All jobs" : s} /></div>}>
      <Section title="Job queue" note={`${jobs.length} jobs`}>
        <Card class="!py-1">
          <Table rows={jobs} rowKey={(j) => j.id} onRow={r.open} act={(j) => <JobAct j={j} open={r.open} />} cols={[
            { key: "i", label: "Job", render: (j) => <span class="flex flex-col min-w-0"><b class="font-semibold">{j.item || "Untitled run"}</b><MetaRow items={[j.orderNo, j.printer !== "—" && j.printer, `${j.grams} g`]} /></span> },
            { key: "s", label: "Status", card: "status", render: (j) => <Status tone={jobTone(j.status)}>{j.status}</Status> },
            { key: "e", label: "Est.", card: "foot", align: "right", render: (j) => `${j.hours} h` },
            { key: "op", label: "Operator", level: 2, render: (j) => j.operator },
            { key: "sp", label: "Spool", level: 2, render: (j) => { const s = jobSpool(j); return s ? `${spoolLabel(s)} · ${s.grams.toLocaleString("en-IN")} g left` : "—"; } },
            { key: "c", label: "Customer", level: 2, render: (j) => vOrders().find((o) => o.no === j.orderNo)?.customer ?? "—" },
          ]} />
        </Card>
      </Section>
      <Section title="Machines" note={`${printersSig.value.filter((p) => p.active !== false).length} printers`}>
        <div class="listbox">
          <div class="hidden lg:grid grid-cols-[minmax(0,1.4fr)_110px_repeat(4,72px)_minmax(0,1.4fr)] gap-x-3 px-3 h-7 items-center t-meta uppercase tracking-[0.06em]"><span>Printer</span><span>Status</span><span class="text-right">Util</span><span class="text-right">Uptime</span><span class="text-right">Blocked</span><span class="text-right">Fail</span><span>Now</span></div>
          {printersSig.value.filter((p) => p.active !== false).map((p) => {
            const m = machineStats(p.name);
            return (
              <a key={p.id} href="#workshop" class="grid grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.4fr)_110px_repeat(4,72px)_minmax(0,1.4fr)] gap-x-3 items-center px-3 py-2 lg:py-1.5 lg:min-h-9 hover:bg-c1/60 text-[13px]">
                <span class="min-w-0 truncate"><span class="font-mono text-[12px] font-bold mr-2">{p.name}</span><span class="text-c3">{p.model}</span></span>
                <span><Status tone={p.status === "printing" ? "active" : p.status === "down" ? "blocked" : "idle"}>{p.status}</Status></span>
                <span class="hidden lg:block num text-right">{m.util}%</span><span class="hidden lg:block num text-right">{m.uptime}%</span><span class="hidden lg:block num text-right">{m.lost}h</span><span class="hidden lg:block num text-right">{m.fail}%</span>
                <span class="hidden lg:block t-meta truncate">{p.job ? `Printing ${p.job}` : `${p.hours} lifetime h`}</span>
              </a>
            );
          })}
        </div>
      </Section>
      <Disclosure title="Log consumption" meta="filament, packing, parts"><ConsumeForm /></Disclosure>
      <Disclosure title="Build sheet" meta="filled at approval">
        <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Raw material">{sel(["PLA", "PETG", "TPU", "ABS", "Resin"])}</Field>
          <Field label="Colour">{sel(["Black", "White", "Grey", "Gold"])}</Field>
          <Field label="Accessories">{sel(["None", "Magnets", "NFC tag", "Brass inserts"])}</Field>
          <Field label="Machine">{sel(printersSig.value.filter((p) => p.active !== false).map((p) => p.name))}</Field>
          <Field label="Operator">{sel(teamNames())}</Field>
          <Field label="Layer / infill"><input class={inputCls} defaultValue="0.2 mm · 15%" /></Field>
          <Field label="Estimate (g · h)"><input class={inputCls} defaultValue="410 g · 4 h" /></Field>
          <Field label="Finishing notes"><input class={inputCls} placeholder="Sand seams, prime" /></Field>
        </div>
        <div class="mt-3"><Button variant="outline" onClick={() => log("Saved build sheet", vOrders().find((o) => o.stage === "production")?.no ?? "—")}>Save build sheet</Button></div>
      </Disclosure>
    </WorkShell>
  );
}

const DEFECTS = ["—", "Stringing", "Layer shift", "Warping", "Under-extrusion", "Over-extrusion", "Dimensions", "Surface finish", "Colour mismatch", "Broken in removal"];
const CAUSES = ["—", "Material", "Slicer profile", "Machine", "Post-processing", "Design", "Handling"];
const qFields: FDef<QcEntry>[] = [
  { k: "orderNo", label: "Order" }, { k: "item", label: "Item" }, { k: "result", label: "Result", type: "select", options: ["pass", "rework", "scrap"] },
  { k: "grams", label: "Wasted", type: "number", suffix: "g" }, { k: "defect", label: "Defect", type: "select", options: DEFECTS },
  { k: "by", label: "Checked by", type: "select", options: () => teamNames() }, { k: "date", label: "Date", type: "date" },
];
export function QC() {
  const done = jobsSig.value.filter((j) => j.status === "done" && !qcSig.value.some((q) => q.orderNo === j.orderNo && q.item === j.item));
  const [pick, setPick] = useState(() => { const i = done.findIndex((j) => j.id === qcFocus.value); qcFocus.value = null; return Math.max(0, i); });
  const cur = done[Math.min(pick, done.length - 1)];
  const [d, setD] = useState({ res: "pass" as QcEntry["result"], units: 0, grams: 0, defect: "—", cause: "—", lesson: "", by: teamNames()[0] ?? "You" });
  const r = useRecord<QcEntry>({ sig: qcSig, kind: "QC entry", title: (q) => `${q.orderNo} · ${q.item}`, fields: qFields, logKind: "order",
    blank: () => ({ id: uid(), orderNo: "", item: "", result: "pass", grams: 0, by: me.value?.name ?? "You", date: today() }),
    facts: (q) => [["Result", <Status tone={q.result === "pass" ? "done" : q.result === "scrap" ? "blocked" : "waiting"}>{q.result}</Status>], ["Wasted", `${q.grams} g`]] });
  const save = () => {
    if (!cur) return;
    const e: QcEntry = { id: uid(), orderNo: cur.orderNo, item: cur.item, result: d.res, grams: d.grams, defect: d.defect === "—" ? undefined : `${d.defect}${d.cause !== "—" ? ` · ${d.cause}` : ""}`, by: d.by, date: today() };
    qcSig.value = [e, ...qcSig.value];
    if (d.grams) consume({ kind: "scrap", item: `${d.defect} · ${cur.item}`, qty: d.grams, orderNo: cur.orderNo });
    log(`QC ${d.res}${d.lesson ? ` — ${d.lesson}` : ""}`, `${cur.orderNo} · ${cur.item}`);
    setD({ ...d, res: "pass", units: 0, grams: 0, defect: "—", cause: "—", lesson: "" });
  };
  const qc = qcSig.value;
  return (
    <WorkShell stage="qc" title="QC & Logging" sub="A work queue, not a form — pass, rework or scrap, reason kept" detail={r.detail}>
      <div class="strip grid grid-cols-4">
        <Stat value={qc.filter((q) => q.result === "pass").length} label="passed" />
        <Stat value={qc.filter((q) => q.result === "rework").length} label="rework" />
        <Stat value={qc.filter((q) => q.result === "scrap").length} label="scrap" />
        <Stat value={`${qc.reduce((s, q) => s + q.grams, 0)}g`} label="wasted" />
      </div>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Section title="Waiting for QC" note={String(done.length)}>
          <Card>
            {cur ? <>
              <Field label="Job"><select class={inputCls} value={pick} onChange={(e) => setPick(Number((e.target as HTMLSelectElement).value))}>{done.map((j, i) => <option key={j.id} value={i}>{j.orderNo} · {j.item} ({j.printer})</option>)}</select></Field>
              <div class="flex gap-2 my-3">{(["pass", "rework", "scrap"] as const).map((x) => <Chip key={x} active={d.res === x} onClick={() => setD({ ...d, res: x })}>{x[0].toUpperCase() + x.slice(1)}</Chip>)}</div>
              <div class="grid grid-cols-2 gap-3">
                <Field label="Units reworked"><input class={inputCls} type="number" value={d.units} onInput={(e) => setD({ ...d, units: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
                <Field label="Wasted (g)"><input class={inputCls} type="number" value={d.grams} onInput={(e) => setD({ ...d, grams: Number((e.target as HTMLInputElement).value) || 0 })} /></Field>
                <Field label="Defect"><select class={inputCls} value={d.defect} onChange={(e) => setD({ ...d, defect: (e.target as HTMLSelectElement).value })}>{DEFECTS.map((o) => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Root cause"><select class={inputCls} value={d.cause} onChange={(e) => setD({ ...d, cause: (e.target as HTMLSelectElement).value })}>{CAUSES.map((o) => <option key={o}>{o}</option>)}</select></Field>
                <div class="col-span-2"><Field label="What should we do differently next time?"><input class={inputCls} value={d.lesson} onInput={(e) => setD({ ...d, lesson: (e.target as HTMLInputElement).value })} /></Field></div>
                <Field label="Checked by"><select class={inputCls} value={d.by} onChange={(e) => setD({ ...d, by: (e.target as HTMLSelectElement).value })}>{teamNames().map((o) => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Photo"><input class={`${inputCls} py-2`} type="file" accept="image/*" /></Field>
              </div>
              <div class="mt-3"><Actions><Button icon="check" onClick={save}>Log check</Button></Actions></div>
            </> : <p class="text-sm text-c3 py-4 text-center">Nothing waiting — finished jobs appear here.</p>}
          </Card>
          <Disclosure title="Log consumption" meta="filament, packing, parts"><ConsumeForm /></Disclosure>
        </Section>
        <Section title="Log" note="newest first">
          <Card class="!py-1">
            <Table rows={qc} rowKey={(q) => q.id} onRow={r.open} cols={[
              { key: "o", label: "Order", render: (q) => q.orderNo },
              { key: "d", label: "Date", render: (q) => shortDate(q.date) },
              { key: "i", label: "Item", render: (q) => q.item },
              { key: "r", label: "Result", card: "status", render: (q) => <Status tone={q.result === "pass" ? "done" : q.result === "scrap" ? "blocked" : "waiting"}>{q.result}</Status> },
              { key: "x", label: "Defect", render: (q) => q.defect ?? "—", hideTablet: true },
              { key: "b", label: "By", render: (q) => q.by },
              { key: "g", label: "Lost g", align: "right", render: (q) => q.grams },
            ]} />
          </Card>
        </Section>
      </div>
    </WorkShell>
  );
}

const pkFields: FDef<PackRecord>[] = [
  { k: "order", label: "Order" }, { k: "date", label: "Date", type: "date" }, { k: "box", label: "Box size" }, { k: "weight", label: "Gross weight" },
  { k: "materials", label: "Materials", wide: true }, { k: "cost", label: "Cost", type: "number", suffix: "₹" },
  { k: "by", label: "Packed by", type: "select", options: () => teamNames() }, { k: "notes", label: "Special handling", type: "textarea" },
];
function PackCard({ o }: { o: Order }) {
  const [d, setD] = useState({ box: "", weight: "", notes: "", by: teamNames()[0] ?? "You", lines: [{ item: packSig.value[0]?.name ?? "", qty: 1 }] });
  const inp = (k: "box" | "weight" | "notes") => (e: Event) => setD({ ...d, [k]: (e.target as HTMLInputElement).value });
  const save = () => {
    const ls = d.lines.filter((l) => l.qty > 0 && l.item);
    const cost = ls.reduce((s, l) => s + (packSig.value.find((p) => p.name === l.item)?.cost ?? 0) * l.qty, 0);
    ls.forEach((l) => consume({ kind: "packing", item: l.item, qty: l.qty, orderNo: o.no }));
    packRecSig.value = [{ id: uid(), order: o.no, box: d.box, weight: d.weight, materials: ls.map((l) => `${l.item} ×${l.qty}`).join(", "), cost, by: d.by, notes: d.notes, date: today() }, ...packRecSig.value];
    log("Recorded packing", o.no);
    setD({ ...d, box: "", weight: "", notes: "", lines: [{ item: packSig.value[0]?.name ?? "", qty: 1 }] });
  };
  return (
    <Disclosure open title={<span><span class="font-mono text-[12px] font-bold mr-2">{o.no}</span>{o.customer}</span>} meta={`${TYPE_LABEL[o.type]} · ${orderUnits(o)} units`}>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Box size"><input class={inputCls} placeholder="30×20×15" value={d.box} onInput={inp("box")} /></Field>
        <Field label="Gross weight"><input class={inputCls} placeholder="kg" value={d.weight} onInput={inp("weight")} /></Field>
        <Field label="Packed by"><select class={inputCls} value={d.by} onChange={(e) => setD({ ...d, by: (e.target as HTMLSelectElement).value })}>{teamNames().map((n) => <option key={n}>{n}</option>)}</select></Field>
        {d.lines.map((l, i) => (
          <div key={i} class="col-span-2 sm:col-span-3 grid grid-cols-[minmax(0,1fr)_88px] gap-3">
            <Field label={`Material ${i + 1}`}><select class={inputCls} value={l.item} onChange={(e) => setD({ ...d, lines: d.lines.map((x, k) => (k === i ? { ...x, item: (e.target as HTMLSelectElement).value } : x)) })}>{packSig.value.filter((p) => p.active !== false).map((p) => <option key={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Qty"><input class={inputCls} type="number" value={l.qty} onInput={(e) => setD({ ...d, lines: d.lines.map((x, k) => (k === i ? { ...x, qty: Number((e.target as HTMLInputElement).value) || 0 } : x)) })} /></Field>
          </div>
        ))}
        <div class="col-span-2 sm:col-span-3"><Field label="Special handling"><input class={inputCls} placeholder="Fragile, keep flat" value={d.notes} onInput={inp("notes")} /></Field></div>
      </div>
      <div class="mt-3"><Actions><Button icon="check" onClick={save}>Record packing</Button><Button variant="outline" icon="plus" onClick={() => setD({ ...d, lines: [...d.lines, { item: packSig.value[0]?.name ?? "", qty: 1 }] })}>Material line</Button></Actions></div>
    </Disclosure>
  );
}

export function Packing() {
  const list = vOrders().filter((o) => o.stage === "packing");
  const r = useRecord<PackRecord>({ sig: packRecSig, kind: "Packing record", title: (p) => `${p.order} · ${p.box || "packing"}`, fields: pkFields, logKind: "order",
    blank: () => ({ id: uid(), order: "", box: "", weight: "", materials: "", cost: 0, by: me.value?.name ?? "You", notes: "", date: today() }) });
  return (
    <WorkShell stage="packing" title="Packing" sub="Materials used and their cost, weight, box size, handling notes" detail={r.detail}>
      <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <Section title="To pack" note={String(list.length)}>
          {list.map((o) => <PackCard key={o.id} o={o} />)}
          {!list.length && <Card><p class="text-sm text-c3 text-center py-4">Nothing at Packing.</p></Card>}
          <Disclosure title="Log consumption" meta="filament, packing, parts"><ConsumeForm /></Disclosure>
        </Section>
        <Section title="Recorded" note={String(packRecSig.value.length)}>
          <Card class="!py-1">
            <Table rows={packRecSig.value} rowKey={(r) => r.id} onRow={r.open} cols={[
              { key: "o", label: "Order", render: (r) => r.order },
              { key: "b", label: "Box", render: (r) => r.box || "—" },
              { key: "w", label: "Weight", render: (r) => r.weight || "—" },
              { key: "m", label: "Materials", render: (r) => r.materials, hideTablet: true },
              { key: "c", label: "Cost", align: "right", render: (r) => inr(r.cost) },
            ]} />
          </Card>
          <Card>
            <CardTitle action={<a href="#workshop-packing" class="text-xs font-semibold underline">Stock</a>}>Packing stock</CardTitle>
            <ul class="flex flex-col gap-2 text-sm">
              {packSig.value.filter((p) => p.active !== false).map((p) => (
                <li key={p.id}><div class="flex justify-between mb-1"><span>{p.name}</span><span class="num font-semibold">{p.qty} {p.unit}</span></div><Progress value={(p.qty / Math.max(1, p.reorderAt * 3)) * 100} /></li>
              ))}
            </ul>
          </Card>
        </Section>
      </div>
    </WorkShell>
  );
}

export function Archive() {
  const list = vOrders().filter((o) => o.stage === "archived");
  const [open, setOpen] = useOpenOrder();
  const cur = open && (vOrders().find((o) => o.id === open.id) ?? open);
  return (
    <WorkShell stage="archived" title="Archive" sub="Final cost rollup · tap an order to see its cost lines or reopen it" detail={cur && <OrderDetail order={cur} onClose={() => setOpen(null)} onOpen={setOpen} />}>
      <Card class="!py-1">
        <Table rows={list} rowKey={(o) => o.id} onRow={setOpen} cols={[
          { key: "o", label: "Order", render: (o) => `${o.no} · ${o.customer}` },
          { key: "t", label: "Type", render: (o) => TYPE_LABEL[o.type] },
          { key: "r", label: "Revenue", align: "right", render: (o) => (o.type === "inhouse" ? "—" : inr(orderTotal(o))) },
          { key: "m1", label: "Material", align: "right", render: (o) => inr(orderCost(o) * 0.45), hideTablet: true },
          { key: "m2", label: "Machine", align: "right", render: (o) => inr(orderCost(o) * 0.3), hideTablet: true },
          { key: "m3", label: "Pack + freight", align: "right", render: (o) => inr(orderCost(o) * 0.25), hideTablet: true },
          { key: "k", label: "Cost", align: "right", render: (o) => inr(orderCost(o)) },
          { key: "m", label: "Margin", align: "right", render: (o) => (o.type === "inhouse" ? "—" : `${Math.round((1 - orderCost(o) / orderTotal(o)) * 100)}%`) },
        ]} />
      </Card>
      <Card><div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm"><Fact label="Estimated cost" value={inr(3400)} /><Fact label="Actual cost" value={inr(4120)} /><Fact label="Drift" value="+21%" /><Fact label="Median cycle" value="8 days" /></div></Card>
    </WorkShell>
  );
}
