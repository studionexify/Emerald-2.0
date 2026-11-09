import { vOrders } from "../data";
import { useEffect, useRef, useState } from "preact/hooks";
import { navigate } from "../router";
import { Icon } from "../ui";
import { ask } from "../ui";
import { clientsSig, log, me, openOrderSig, printersSig, segmentOf, SEGMENT_HREF, shortDate, STAGE_LABEL, taskListsSig, tasksSig, teamNames, toBin, today, uid, type Task } from "../data";

/* A to-do app: smart lists on the left, the list in the middle, the task's details on the right.
   Every task can link to an order, a quotation, a client or a printer, and the link opens that record. */

type ListKey = "myday" | "important" | "planned" | "assigned" | "linked" | "tasks" | `list:${string}`;
const SMART: { k: ListKey; label: string; icon: string; hue: string }[] = [
  { k: "myday", label: "My Day", icon: "sun", hue: "#C49A5A" },
  { k: "important", label: "Important", icon: "star", hue: "#C08497" },
  { k: "planned", label: "Planned", icon: "calendar", hue: "#6FA39C" },
  { k: "assigned", label: "Assigned to me", icon: "user", hue: "#6E9C7C" },
  { k: "linked", label: "Linked to work", icon: "link", hue: "#9A86B8" },
  { k: "tasks", label: "Tasks", icon: "list", hue: "#6B8DB5" },
];
const LINK_KINDS = ["Order", "Quotation", "Client", "Printer"] as const;
const myName = () => me.value?.name ?? "You";
const isMine = (t: Task) => t.who === myName() || t.who === "You";
const inList = (t: Task, k: ListKey) =>
  k === "myday" ? t.myDay === today() : k === "important" ? !!t.important : k === "planned" ? !!t.due : k === "assigned" ? isMine(t) : k === "linked" ? !!t.link : k === "tasks" ? !t.list : t.list === k.slice(5);
const put = (id: string, p: Partial<Task>) => (tasksSig.value = tasksSig.value.map((t) => (t.id === id ? { ...t, ...p } : t)));
const toggle = (t: Task) => { put(t.id, { done: !t.done, doneAt: t.done ? undefined : today() }); log(t.done ? "Reopened task" : "Completed task", t.title); };

/** Where a link goes. Orders and quotations open in their production page. */
export function openLink(l: NonNullable<Task["link"]>) {
  if (l.kind === "Order" || l.kind === "Quotation") { const o = vOrders().find((x) => x.no === l.ref); if (o) { openOrderSig.value = o.no; navigate(SEGMENT_HREF[segmentOf(o)]); return; } navigate("/work/orders"); }
  else if (l.kind === "Client") navigate("/work/clients");
  else if (l.kind === "Printer") navigate("/workshop/printers");
}
function linkOptions(kind: string): { ref: string; label: string }[] {
  if (kind === "Order") return vOrders().filter((o) => o.stage !== "quotation" && o.stage !== "archived").map((o) => ({ ref: o.no, label: `${o.no} · ${o.customer} · ${STAGE_LABEL[o.stage]}` }));
  if (kind === "Quotation") return vOrders().filter((o) => o.stage === "quotation").map((o) => ({ ref: o.no, label: `${o.no} · ${o.customer}` }));
  if (kind === "Client") return clientsSig.value.map((c) => ({ ref: c.name, label: c.name }));
  return printersSig.value.map((p) => ({ ref: p.name, label: p.name }));
}
const linkLabel = (l: NonNullable<Task["link"]>) => { const o = (l.kind === "Order" || l.kind === "Quotation") && vOrders().find((x) => x.no === l.ref); return o ? `${l.ref} · ${o.customer}` : l.ref; };
const dueTone = (d: string) => (d < today() ? "#B97468" : d === today() ? "#6B8DB5" : "var(--c-3)");
const dueText = (d: string) => (d === today() ? "Today" : d < today() ? `Overdue · ${shortDate(d)}` : shortDate(d));

function Check({ t, big }: { t: Task; big?: boolean }) {
  return (
    <button aria-label={t.done ? "Mark as not completed" : "Mark as completed"} onClick={(e) => { e.stopPropagation(); toggle(t); }}
      class={`group shrink-0 rounded-full grid place-items-center cursor-pointer !min-h-0 border-2 ${big ? "w-6 h-6" : "w-5 h-5"} ${t.done ? "bg-[#6B8DB5] border-[#6B8DB5] text-white" : "border-c3 hover:border-[#6B8DB5] text-[#6B8DB5]"}`}>
      <span class={t.done ? "" : "opacity-0 group-hover:opacity-100"}><Icon name="check" size={big ? 13 : 11} /></span>
    </button>
  );
}
function Star({ t }: { t: Task }) {
  return (
    <button aria-label={t.important ? "Remove importance" : "Mark as important"} aria-pressed={!!t.important} onClick={(e) => { e.stopPropagation(); put(t.id, { important: !t.important }); }}
      class={`w-8 h-8 !min-h-0 shrink-0 grid place-items-center rounded-lg cursor-pointer hover:bg-c1 ${t.important ? "text-[#C08497]" : "text-c2"}`}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill={t.important ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></svg>
    </button>
  );
}

function Row({ t, sel, onSel }: { t: Task; sel: boolean; onSel: () => void }) {
  const steps = t.steps ?? [];
  const meta = [
    t.myDay === today() && <span key="d" class="inline-flex items-center gap-1"><Icon name="sun" size={11} />My Day</span>,
    steps.length > 0 && <span key="s">{steps.filter((s) => s.done).length} of {steps.length}</span>,
    t.due && <span key="u" class="inline-flex items-center gap-1" style={{ color: t.done ? undefined : dueTone(t.due) }}><Icon name="calendar" size={11} />{dueText(t.due)}</span>,
    t.repeat && <span key="r" class="inline-flex items-center gap-1"><Icon name="repeat" size={11} />{t.repeat}</span>,
    t.link && <button key="l" onClick={(e) => { e.stopPropagation(); openLink(t.link!); }} class="inline-flex items-center gap-1 !min-h-0 text-[#9A86B8] font-semibold hover:underline cursor-pointer"><Icon name="link" size={11} />{t.link.kind} · {linkLabel(t.link)}</button>,
    t.list && <span key="t">{t.list}</span>,
    !isMine(t) && <span key="w" class="inline-flex items-center gap-1"><Icon name="user" size={11} />{t.who}</span>,
    t.notes && <span key="n">Note</span>,
  ].filter(Boolean);
  return (
    <div role="button" tabIndex={0} onClick={onSel} onKeyDown={(e) => e.key === "Enter" && onSel()}
      class={`flex items-center gap-3 pl-4 pr-2 min-h-[52px] py-2 rounded-lg cursor-pointer !min-h-0 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${sel ? "bg-[color-mix(in_srgb,#6B8DB5_10%,var(--c-0))] ring-1 ring-[#6B8DB5]/40" : "bg-c0 hover:bg-c1/70"}`}>
      <Check t={t} />
      <div class="min-w-0 flex-1">
        <div class={`text-[14px] leading-snug ${t.done ? "line-through text-c3" : "text-c4"}`}>{t.title}</div>
        {meta.length > 0 && <div class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] text-c3 mt-0.5">{meta.map((m, i) => <span key={i} class="contents">{i > 0 && <span aria-hidden="true">·</span>}{m}</span>)}</div>}
      </div>
      <Star t={t} />
    </div>
  );
}

function Detail({ t, onClose }: { t: Task; onClose: () => void }) {
  const [step, setStep] = useState("");
  const [lk, setLk] = useState<string>(t.link?.kind ?? "Order");
  const steps = t.steps ?? [];
  const opt = "flex items-center gap-3 w-full h-12 px-4 text-[14px] text-left cursor-pointer hover:bg-c1/70 !min-h-0";
  const box = "rounded-lg bg-c0 shadow-[0_1px_2px_rgba(0,0,0,0.06)] overflow-hidden";
  const sel = "h-8 px-2 rounded-md border border-line bg-c1 text-[13px] min-w-0";
  return (
    <div class="flex flex-col gap-2.5 h-full">
      <div class="flex justify-end -mb-1"><button aria-label="Close details" onClick={onClose} class="w-8 h-8 !min-h-0 rounded-lg grid place-items-center hover:bg-c1 cursor-pointer"><Icon name="close" size={15} /></button></div>
      <div class={box}>
        <div class="flex items-start gap-3 px-4 py-3">
          <span class="pt-1"><Check t={t} big /></span>
          <textarea rows={2} class={`flex-1 min-w-0 bg-transparent outline-none resize-none text-[17px] font-semibold leading-snug ${t.done ? "line-through text-c3" : ""}`} value={t.title} onInput={(e) => put(t.id, { title: (e.target as HTMLTextAreaElement).value })} />
          <Star t={t} />
        </div>
        {steps.map((s) => (
          <div key={s.id} class="flex items-center gap-3 px-4 h-10 border-t border-line">
            <button aria-label="Toggle step" onClick={() => put(t.id, { steps: steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) })} class={`w-4 h-4 !min-h-0 rounded-full border-2 grid place-items-center cursor-pointer ${s.done ? "bg-[#6B8DB5] border-[#6B8DB5] text-white" : "border-c3"}`}>{s.done && <Icon name="check" size={9} />}</button>
            <input class={`flex-1 min-w-0 bg-transparent outline-none text-[13px] ${s.done ? "line-through text-c3" : ""}`} value={s.title} onInput={(e) => put(t.id, { steps: steps.map((x) => (x.id === s.id ? { ...x, title: (e.target as HTMLInputElement).value } : x)) })} />
            <button aria-label="Delete step" onClick={() => put(t.id, { steps: steps.filter((x) => x.id !== s.id) })} class="w-7 h-7 !min-h-0 grid place-items-center rounded text-c2 hover:bg-c1 cursor-pointer"><Icon name="close" size={12} /></button>
          </div>
        ))}
        <form class="flex items-center gap-3 px-4 h-11 border-t border-line text-[#6B8DB5]" onSubmit={(e) => { e.preventDefault(); if (step.trim()) { put(t.id, { steps: [...steps, { id: uid(), title: step.trim(), done: false }] }); setStep(""); } }}>
          <Icon name="plus" size={15} /><input class="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-c4 placeholder:text-[#6B8DB5]" placeholder={steps.length ? "Next step" : "Add step"} value={step} onInput={(e) => setStep((e.target as HTMLInputElement).value)} />
        </form>
      </div>

      <div class={box}>
        <button class={`${opt} ${t.myDay === today() ? "text-[#6B8DB5] font-semibold" : ""}`} onClick={() => put(t.id, { myDay: t.myDay === today() ? undefined : today() })}>
          <Icon name="sun" size={16} />{t.myDay === today() ? "Added to My Day" : "Add to My Day"}
        </button>
      </div>

      <div class={`${box} divide-y divide-line`}>
        <label class={opt}><Icon name="calendar" size={16} /><span class="flex-1">{t.due ? <span style={{ color: dueTone(t.due) }}>Due {dueText(t.due)}</span> : "Add due date"}</span><input type="date" class={sel} value={t.due} onInput={(e) => put(t.id, { due: (e.target as HTMLInputElement).value })} /></label>
        <label class={opt}><Icon name="repeat" size={16} /><span class="flex-1">{t.repeat ? `Repeats ${t.repeat.toLowerCase()}` : "Repeat"}</span><select class={sel} value={t.repeat ?? ""} onChange={(e) => put(t.id, { repeat: (e.target as HTMLSelectElement).value })}>{["", "Daily", "Weekly", "Monthly"].map((r) => <option key={r} value={r}>{r || "Never"}</option>)}</select></label>
        <label class={opt}><Icon name="user" size={16} /><span class="flex-1">Assigned to</span><select class={sel} value={t.who} onChange={(e) => put(t.id, { who: (e.target as HTMLSelectElement).value })}>{[...new Set(["You", myName(), ...teamNames(), t.who])].map((n) => <option key={n}>{n}</option>)}</select></label>
        <label class={opt}><Icon name="list" size={16} /><span class="flex-1">List</span><select class={sel} value={t.list ?? ""} onChange={(e) => put(t.id, { list: (e.target as HTMLSelectElement).value || undefined })}><option value="">Tasks</option>{taskListsSig.value.map((n) => <option key={n}>{n}</option>)}</select></label>
      </div>

      <div class={box}>
        <div class="flex items-center gap-3 px-4 h-11 text-[14px] font-semibold text-[#9A86B8]"><Icon name="link" size={16} />Linked to</div>
        {t.link ? (
          <div class="flex items-center gap-2 px-4 pb-3">
            <button onClick={() => openLink(t.link!)} class="flex-1 min-w-0 text-left rounded-lg px-3 py-2 cursor-pointer !min-h-0" style={{ background: "color-mix(in srgb, #9A86B8 10%, transparent)" }}>
              <div class="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9A86B8]">{t.link.kind}</div>
              <div class="text-[13px] font-semibold truncate">{linkLabel(t.link)}</div>
              <div class="text-[11px] text-c3">Open →</div>
            </button>
            <button aria-label="Remove link" onClick={() => put(t.id, { link: undefined })} class="w-8 h-8 !min-h-0 grid place-items-center rounded-lg hover:bg-c1 text-c2 cursor-pointer"><Icon name="close" size={14} /></button>
          </div>
        ) : (
          <div class="flex flex-col gap-1.5 px-4 pb-3">
            <div class="flex gap-1">{LINK_KINDS.map((k) => <button key={k} onClick={() => setLk(k)} class={`h-7 px-2.5 !min-h-0 rounded-full text-[12px] font-medium cursor-pointer ${lk === k ? "bg-[#9A86B8] text-white" : "bg-c1 text-c3"}`}>{k}</button>)}</div>
            <select class={`${sel} w-full h-9`} value="" onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) { put(t.id, { link: { kind: lk, ref: v } }); log("Linked task", `${t.title} → ${lk} ${v}`); } }}>
              <option value="">Choose {lk.toLowerCase()}…</option>
              {linkOptions(lk).map((o) => <option key={o.ref} value={o.ref}>{o.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div class={box}><textarea rows={4} class="w-full bg-transparent outline-none resize-y px-4 py-3 text-[13px]" placeholder="Add note" value={t.notes ?? ""} onInput={(e) => put(t.id, { notes: (e.target as HTMLTextAreaElement).value })} /></div>

      <div class="mt-auto flex items-center justify-between gap-2 pt-2 border-t border-line text-[12px] text-c3">
        <span>{t.done && t.doneAt ? `Completed ${shortDate(t.doneAt)}` : t.created ? `Created ${shortDate(t.created)}` : "Task"}</span>
        <button aria-label="Delete task" onClick={() => ask(`"${t.title}" will be moved to the Bin.`, { ok: "Delete task" }).then((ok) => { if (ok) { toBin("Task", t, t.title, myName()); log("Deleted task", t.title); onClose(); } })} class="w-8 h-8 !min-h-0 grid place-items-center rounded-lg hover:bg-c1 hover:text-warn cursor-pointer"><Icon name="bin" size={15} /></button>
      </div>
    </div>
  );
}

export function Todo() {
  const [k, setK] = useState<ListKey>("myday");
  const [sel, setSel] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [showDone, setShowDone] = useState(true);
  const [newList, setNewList] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const tasks = tasksSig.value;
  const meta = SMART.find((s) => s.k === k) ?? { k, label: k.slice(5), icon: "list", hue: "#6B8DB5" };
  const here = tasks.filter((t) => inList(t, k));
  const open = here.filter((t) => !t.done).sort((a, b) => Number(!!b.important) - Number(!!a.important) || (a.due || "9").localeCompare(b.due || "9"));
  const done = here.filter((t) => t.done);
  const cur = sel ? tasks.find((t) => t.id === sel) : undefined;
  useEffect(() => { if (sel && !cur) setSel(null); }, [sel, cur]);
  const add = () => {
    const title = draft.trim(); if (!title) return;
    const t: Task = { id: uid(), title, due: k === "planned" || k === "myday" ? today() : "", done: false, who: myName(), priority: "Normal", notes: "", created: today(),
      myDay: k === "myday" ? today() : undefined, important: k === "important" || undefined, list: k.startsWith("list:") ? k.slice(5) : undefined };
    tasksSig.value = [t, ...tasks]; log("Added task", title); setDraft("");
  };
  const count = (key: ListKey) => tasks.filter((t) => !t.done && inList(t, key)).length;
  const side = (key: ListKey, label: string, icon: string, hue: string) => (
    <button key={key} onClick={() => { setK(key); setSel(null); }} aria-current={k === key ? "page" : undefined}
      class={`flex items-center gap-3 w-full h-10 px-3 rounded-lg text-[14px] text-left cursor-pointer !min-h-0 ${k === key ? "bg-c1 font-semibold text-c4" : "text-c4 hover:bg-c1/60"}`}>
      <span style={{ color: hue }}><Icon name={icon} size={17} /></span><span class="flex-1 truncate">{label}</span>
      {count(key) > 0 && <span class="text-[12px] num text-c3">{count(key)}</span>}
    </button>
  );
  const day = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <div class="h-full min-h-0 flex gap-2 p-2 md:p-3 md:pl-0">
      <aside class="hidden md:flex flex-col w-60 2xl:w-64 shrink-0 rounded-[var(--radius-card)] bg-c0 p-2 overflow-y-auto">
        <div class="px-3 pt-2 pb-3"><div class="text-[16px] font-bold">To-do</div><div class="text-[12px] text-c3">{tasks.filter((t) => !t.done).length} open · {tasks.filter((t) => t.link && !t.done).length} linked to work</div></div>
        {SMART.map((s) => side(s.k, s.label, s.icon, s.hue))}
        <div class="my-2 border-t border-line" />
        {taskListsSig.value.map((n) => side(`list:${n}`, n, "list", "#8A93A3"))}
        {newList === null
          ? <button onClick={() => setNewList("")} class="flex items-center gap-3 w-full h-10 px-3 rounded-lg text-[14px] text-[#6B8DB5] hover:bg-c1/60 cursor-pointer !min-h-0"><Icon name="plus" size={17} />New list</button>
          : <form class="px-1" onSubmit={(e) => { e.preventDefault(); const n = newList.trim(); if (n && !taskListsSig.value.includes(n)) { taskListsSig.value = [...taskListsSig.value, n]; setK(`list:${n}`); } setNewList(null); }}>
              <input autoFocus class="w-full h-10 px-3 rounded-lg border border-[#6B8DB5] bg-c0 text-[14px] outline-none" placeholder="Untitled list" value={newList} onInput={(e) => setNewList((e.target as HTMLInputElement).value)} onBlur={() => setNewList(null)} />
            </form>}
      </aside>

      <section class="flex-1 min-w-0 flex flex-col rounded-[var(--radius-card)] overflow-hidden" style={{ background: `color-mix(in srgb, ${meta.hue} 7%, var(--c-1))` }}>
        <header class="px-5 pt-5 pb-3">
          <div class="md:hidden mb-2"><select class="h-9 px-2 rounded-lg border border-line bg-c0 text-[14px]" value={k} onChange={(e) => setK((e.target as HTMLSelectElement).value as ListKey)}>{SMART.map((s) => <option key={s.k} value={s.k}>{s.label}</option>)}{taskListsSig.value.map((n) => <option key={n} value={`list:${n}`}>{n}</option>)}</select></div>
          <h1 class="flex items-center gap-2.5 text-[24px] font-bold tracking-tight" style={{ color: meta.hue }}><Icon name={meta.icon} size={22} />{meta.label}</h1>
          {k === "myday" && <div class="text-[13px] text-c3 mt-0.5">{day}</div>}
        </header>
        <div class="flex-1 min-h-0 overflow-y-auto px-4 pb-3 flex flex-col gap-1">
          {open.map((t) => <Row key={t.id} t={t} sel={sel === t.id} onSel={() => setSel(t.id)} />)}
          {!open.length && <div class="text-center py-10 text-c3"><div class="text-[15px] font-semibold text-c4">{k === "myday" ? "Focus on your day" : "Nothing to do here"}</div><div class="text-[13px] mt-1">{k === "myday" ? "Add tasks you want to finish today." : "Add a task below."}</div></div>}
          {done.length > 0 && <>
            <button onClick={() => setShowDone(!showDone)} class="self-start mt-2 mb-1 inline-flex items-center gap-1.5 h-8 px-2.5 !min-h-0 rounded-md bg-c0/80 text-[13px] font-semibold cursor-pointer hover:bg-c0">
              <span class={`transition-transform ${showDone ? "rotate-90" : ""}`}><Icon name="right" size={13} /></span>Completed <span class="text-c3 num">{done.length}</span>
            </button>
            {showDone && done.map((t) => <Row key={t.id} t={t} sel={sel === t.id} onSel={() => setSel(t.id)} />)}
          </>}
        </div>
        <form class="mx-4 mb-4 flex items-center gap-3 h-12 px-4 rounded-lg bg-c0 shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-[#6B8DB5]" onSubmit={(e) => { e.preventDefault(); add(); }} onClick={() => input.current?.focus()}>
          <Icon name="plus" size={18} />
          <input id="todo-add" ref={input} class="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-c4 placeholder:text-[#6B8DB5]" placeholder="Add a task" value={draft} onInput={(e) => setDraft((e.target as HTMLInputElement).value)} />
          {draft && <button type="submit" class="h-8 px-3 !min-h-0 rounded-md bg-[#6B8DB5] text-white text-[12px] font-semibold cursor-pointer">Add</button>}
        </form>
      </section>

      {cur && (
        <aside class="max-md:fixed max-md:inset-0 max-md:z-40 w-full md:w-[340px] 2xl:w-[380px] shrink-0 rounded-[var(--radius-card)] bg-c1 p-3 overflow-y-auto">
          <Detail key={cur.id} t={cur} onClose={() => setSel(null)} />
        </aside>
      )}
    </div>
  );
}

/** Compact task list for any record (orders, quotations). Adds tasks already linked to it. */
export function LinkedTasks({ kind, refNo }: { kind: string; refNo: string }) {
  const [v, setV] = useState("");
  const mine = tasksSig.value.filter((t) => t.link?.ref === refNo);
  return (
    <div class="mb-3">
      <h3 class="font-semibold text-sm mb-1.5 flex justify-between items-center">Tasks <a href="/todo" class="text-xs underline">To-do →</a></h3>
      <ul class="flex flex-col">
        {mine.map((t) => (
          <li key={t.id} class="flex items-center gap-2 py-1.5 border-t border-line text-[13px]">
            <Check t={t} /><span class={`flex-1 min-w-0 truncate ${t.done ? "line-through text-c3" : ""}`}>{t.title}</span>
            {t.due && <span class="text-[11px] whitespace-nowrap" style={{ color: t.done ? "var(--c-3)" : dueTone(t.due) }}>{dueText(t.due)}</span>}
          </li>
        ))}
      </ul>
      <form class="flex items-center gap-2 h-9 px-2 mt-1 rounded-lg bg-c1 text-[#6B8DB5]" onSubmit={(e) => { e.preventDefault(); if (!v.trim()) return; tasksSig.value = [{ id: uid(), title: v.trim(), due: today(), done: false, who: myName(), created: today(), link: { kind, ref: refNo } }, ...tasksSig.value]; log("Added task", `${v.trim()} → ${refNo}`); setV(""); }}>
        <Icon name="plus" size={14} /><input class="flex-1 min-w-0 bg-transparent outline-none text-[13px] text-c4 placeholder:text-[#6B8DB5]" placeholder="Add a task for this" value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} />
      </form>
    </div>
  );
}
