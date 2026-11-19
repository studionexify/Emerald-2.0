/** Nexder categories: put many designs into many categories at once, and add, rename or delete categories in bulk. Loaded only when opened. */
import { useEffect, useState } from "preact/hooks";
import { ask, Button, Field, Icon, inputCls, Sheet } from "../ui";
import { inr, me, usersSig } from "../data";
import { catsOf, checkDrive, deleteDesign, deletePlan, driveSpace, fmtBytes, LIMITS, nexderCatsSig, nexderDesignsSig, previewBytes, shareDesigns, type Check, type NxDesign, type Space } from "../data/nexder";
import { importFound, scanDrive, type Found } from "../data/nexder-recover";
import { addCategories, bulkPrice, canDeleteCategory, deleteCategory, duplicateDesigns, mergeCategories, newPrice, renameCategory, setArchived, setMembership, type PriceMode } from "../data/nexder-cats";

/** Tick the categories the chosen designs should be in. A dash means only some of them are in it now; leave it alone to keep it as it is. */
export function AssignCats({ ds, onClose }: { ds: NxDesign[]; onClose: (done?: boolean) => void }) {
  const cats = nexderCatsSig.value.filter((c) => !c.archived), ids = ds.map((d) => d.id);
  const have = (c: string) => ds.filter((d) => catsOf(d).includes(c)).length;
  const start = () => Object.fromEntries(cats.map((c) => [c.id, have(c.id) === ds.length ? 1 : have(c.id) ? 2 : 0] as const));
  const [st, setSt] = useState<Record<string, number>>(start), [fresh, setFresh] = useState(""), [msg, setMsg] = useState("");
  /* 0 = none, 1 = all, 2 = some (unchanged). A tap on "some" makes it all; a tap on "all" makes it none; a tap on none makes it all. */
  const flip = (id: string) => setSt((s) => ({ ...s, [id]: s[id] === 1 ? 0 : 1 }));
  const apply = () => {
    const made = fresh.trim() ? addCategories(fresh) : null;
    if (made?.error) { setMsg(made.error); return; }
    const add = [...cats.filter((c) => st[c.id] === 1 && have(c.id) < ds.length).map((c) => c.id), ...(made?.ids ?? [])];
    const drop = cats.filter((c) => st[c.id] === 0 && have(c.id) > 0).map((c) => c.id);
    setMembership(ids, add, drop); onClose(true);
  };
  const changes = cats.filter((c) => (st[c.id] === 1 && have(c.id) < ds.length) || (st[c.id] === 0 && have(c.id) > 0)).length + (fresh.trim() ? 1 : 0);
  return (
    <Sheet onClose={() => onClose()} title={`Categories for ${ds.length} design${ds.length > 1 ? "s" : ""}`}
      footer={<><Button variant="outline" onClick={() => onClose()}>Cancel</Button><Button icon="check" disabled={!changes} onClick={apply}>Apply</Button></>}>
      <p class="t-meta mb-2">A design can be in as many categories as you like. Its number stays the same.</p>
      <div class="grid gap-1.5">{cats.map((c) => (
        <button type="button" key={c.id} role="checkbox" aria-checked={st[c.id] === 1 ? "true" : st[c.id] === 2 ? "mixed" : "false"} onClick={() => flip(c.id)}
          class="flex items-center gap-3 rounded-xl border border-line bg-c0 px-3 py-2.5 text-left cursor-pointer !min-h-0">
          <span class={`w-5 h-5 rounded-md border flex items-center justify-center text-[13px] font-bold shrink-0 ${st[c.id] ? "bg-c4 border-c4 text-c0" : "border-c2/60"}`}>{st[c.id] === 1 ? "✓" : st[c.id] === 2 ? "–" : ""}</span>
          <span class="min-w-0 flex-1 text-[14px] font-medium break-words">{c.name}</span>
          <span class="t-meta whitespace-nowrap">{have(c.id)} of {ds.length}</span></button>))}
        {!cats.length && <p class="t-meta">No category yet. Add some below.</p>}</div>
      <label class="block mt-4"><span class="text-[11px] font-medium text-c3">New categories (one per line or separated by commas). Chosen designs are added to them.</span>
        <textarea value={fresh} rows={3} placeholder={"Desk\nWall art\nGifts"} onInput={(e) => { setFresh((e.target as HTMLTextAreaElement).value); setMsg(""); }} class={`${inputCls} !h-auto py-2 mt-1`} /></label>
      {msg && <p role="alert" class="text-[13px] text-red mt-1">{msg}</p>}
    </Sheet>
  );
}

/** Add many categories at once, rename them, delete the empty ones. */
export function ManageCats({ onClose }: { onClose: () => void }) {
  const cats = nexderCatsSig.value, [text, setText] = useState(""), [note, setNote] = useState(""), [edit, setEdit] = useState<{ id: string; v: string } | null>(null), [merge, setMerge] = useState("");
  const lnk = "text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0";
  const count = (id: string) => nexderDesignsSig.value.filter((d) => catsOf(d).includes(id)).length;
  const add = () => { const r = addCategories(text); setNote(r.error ?? `${r.added} added${r.existing ? `, ${r.existing} already existed` : ""}`); if (!r.error) setText(""); };
  const save = () => { if (!edit) return; const e = renameCategory(edit.id, edit.v); if (e) setNote(e); else { setNote(""); setEdit(null); } };
  return (
    <Sheet onClose={onClose} title="Categories" footer={<Button onClick={onClose}>Done</Button>}>
      <label class="block"><span class="text-[11px] font-medium text-c3">Add categories (one per line or separated by commas)</span>
        <textarea value={text} rows={3} placeholder={"Desk\nWall art\nGifts"} onInput={(e) => { setText((e.target as HTMLTextAreaElement).value); setNote(""); }} class={`${inputCls} !h-auto py-2 mt-1`} /></label>
      <div class="flex items-center gap-3 mt-2"><Button icon="plus" disabled={!text.trim()} onClick={add}>Add</Button>{note && <span role="status" class="text-[13px] text-c3 break-words min-w-0">{note}</span>}</div>
      <div class="t-section mt-5 mb-1.5">{cats.length} categor{cats.length === 1 ? "y" : "ies"}</div>
      <div class="grid gap-1.5">{cats.map((c) => (
        <div key={c.id} class={`rounded-xl border border-line bg-c0 px-3 py-2 ${c.archived ? "opacity-70" : ""}`}>
          <div class="flex items-center gap-2 flex-wrap">
            {edit?.id === c.id
              ? <input autofocus value={edit.v} aria-label="Category name" onInput={(e) => setEdit({ id: c.id, v: (e.target as HTMLInputElement).value })} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(null); }} class={`${inputCls} flex-1 min-w-0`} />
              : <span class="min-w-0 flex-1 text-[14px] font-medium break-words">{c.name}<span class="t-meta font-normal"> · {count(c.id)} design{count(c.id) === 1 ? "" : "s"}{c.archived ? " · archived" : ""}</span></span>}
            {edit?.id === c.id
              ? <><button type="button" onClick={save} class={lnk}>Save</button><button type="button" onClick={() => setEdit(null)} class={`${lnk} !text-c3 !font-normal`}>Cancel</button></>
              : <><button type="button" onClick={() => { setEdit({ id: c.id, v: c.name }); setNote(""); }} class={lnk}>Rename</button>
                {!c.archived && cats.filter((x) => !x.archived).length > 1 && <button type="button" onClick={() => setMerge(merge === c.id ? "" : c.id)} class={lnk}>Merge…</button>}
                <button type="button" onClick={() => { setArchived(c.id, !c.archived); setNote(c.archived ? `“${c.name}” is back.` : `“${c.name}” is archived. Its designs keep it, and it returns with Restore.`); }} class={lnk}>{c.archived ? "Restore" : "Archive"}</button>
                <button type="button" onClick={async () => { if (!canDeleteCategory(c.id)) { setNote(deleteCategory(c.id) ?? ""); return; } if (await ask(`Delete the category “${c.name}”? Designs stay; they just leave this category.`, { ok: "Delete category", danger: true })) setNote(deleteCategory(c.id) ?? ""); }} class={`${lnk} !text-red`}>Delete</button></>}
          </div>
          {merge === c.id && <div class="mt-2 flex items-center gap-2 flex-wrap"><span class="t-meta">Move all its designs into</span>
            <select aria-label={`Merge ${c.name} into`} value="" onChange={async (e) => { const t = (e.target as HTMLSelectElement).value; if (!t) return; const tn = cats.find((x) => x.id === t)?.name; if (await ask(`Merge “${c.name}” into “${tn}”? Every design in “${c.name}” moves to “${tn}”.${canDeleteCategory(c.id) ? ` “${c.name}” is then deleted.` : ` “${c.name}” is then archived, because its number block has to stay.`}`, { ok: "Merge" })) { const r = mergeCategories(c.id, t); setNote(`${r.moved} design${r.moved === 1 ? "" : "s"} moved to “${tn}”. “${c.name}” ${r.gone}.`); setMerge(""); } else setMerge(""); }} class={`${inputCls} !w-auto cursor-pointer`}>
              <option value="">Choose…</option>{cats.filter((x) => x.id !== c.id && !x.archived).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>}
          {!!c.retired?.length && <p class="t-meta mt-1.5 break-words">Retired numbers (left blank for good): <span class="num">{c.retired.join(", ")}</span></p>}
        </div>))}
        {!cats.length && <p class="t-meta">No category yet.</p>}</div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- bulk: price, duplicate, delete */
const MODES: [PriceMode, string][] = [["set", "Set to ₹"], ["pct", "Change by %"], ["add", "Add or subtract ₹"], ["round", "Round to nearest ₹"]];
export function BulkDialog({ kind, ds, onClose }: { kind: "price" | "dup" | "del"; ds: NxDesign[]; onClose: (done?: boolean) => void }) {
  const [mode, setMode] = useState<PriceMode>("pct"), [v, setV] = useState(""), [busy, setBusy] = useState(false), [out, setOut] = useState<string[]>([]);
  const n = Number(v), okV = v.trim() !== "" && !Number.isNaN(n) && (mode !== "set" || n >= 0) && (mode !== "round" || n > 0);
  const plan = deletePlan(ds);
  const run = async () => {
    setBusy(true); setOut([]);
    if (kind === "price") { bulkPrice(ds.map((d) => d.id), mode, n, `${MODES.find(([k]) => k === mode)![1].replace("₹", "").trim()} ${v}`); onClose(true); return; }
    const bad: string[] = [];
    if (kind === "dup") bad.push(...(await duplicateDesigns(ds)));
    else for (const d of ds) { const e = await deleteDesign(d); if (e) bad.push(`${d.name}: ${e}`); }
    setBusy(false); if (bad.length) setOut(bad); else onClose(true);
  };
  const title = kind === "price" ? `Change the price of ${ds.length} design${ds.length > 1 ? "s" : ""}` : kind === "dup" ? `Duplicate ${ds.length} design${ds.length > 1 ? "s" : ""}` : `Delete ${ds.length} design${ds.length > 1 ? "s" : ""}`;
  return (
    <Sheet onClose={() => !busy && onClose()} title={title} footer={<><Button variant="outline" disabled={busy} onClick={() => onClose(out.length > 0)}>{out.length ? "Close" : "Cancel"}</Button>
      {!out.length && <Button icon={kind === "del" ? "bin" : "check"} disabled={busy || (kind === "price" && !okV)} onClick={run}>{busy ? "Working…" : kind === "price" ? "Apply" : kind === "dup" ? "Duplicate" : "Delete"}</Button>}</>}>
      {kind === "price" && <>
        <div class="inline-flex rounded-full bg-c1 p-0.5 flex-wrap">{MODES.map(([k, l]) => <button type="button" key={k} aria-pressed={mode === k} onClick={() => setMode(k)} class={`h-7 px-3 !min-h-0 rounded-full text-[12px] cursor-pointer ${mode === k ? "bg-c4 text-c0 font-semibold" : "text-c3 font-medium"}`}>{l}</button>)}</div>
        <label class="block mt-3"><span class="text-[11px] font-medium text-c3">{MODES.find(([k]) => k === mode)![1]}{mode === "pct" || mode === "add" ? " (negative to reduce)" : ""}</span>
          <input autofocus inputMode="decimal" value={v} onInput={(e) => setV((e.target as HTMLInputElement).value)} class={`${inputCls} mt-1`} /></label>
        <div class="grid gap-1 mt-3 text-[13px]">{ds.slice(0, 8).map((d) => <div key={d.id} class="flex justify-between gap-3"><span class="min-w-0 break-words">{d.name}</span><span class="num whitespace-nowrap text-c3">{d.price ? inr(d.price) : "no price"} → <b class="text-c4">{okV ? (newPrice(d.price, mode, n) ? inr(newPrice(d.price, mode, n)!) : "no price") : "…"}</b></span></div>)}
          {ds.length > 8 && <span class="t-meta">and {ds.length - 8} more</span>}</div></>}
      {kind === "dup" && <p class="text-[14px] leading-snug">Makes a copy of each design called “… copy”, in the same categories, with its price, sizes and description. Each copy gets its own new number and its own Google Drive folder. <b>Photos and design files are not copied</b>; add them to each copy afterwards.</p>}
      {kind === "del" && <div class="grid gap-2 text-[14px] leading-snug">
        <p>All {ds.length} go to the Bin, and their files to Google Drive's trash until the Bin is emptied.</p>
        <p><b>{plan.unused.length}</b> not used in any order: their numbers go to the next designs added.</p>
        <p><b>{plan.used.length}</b> used in an order: their numbers are retired, left blank for good so old orders never point at a different product.{plan.used.length ? <span class="block t-meta mt-0.5 break-words">{plan.used.map((d) => d.no).join(", ")}</span> : null}</p></div>}
      {out.length > 0 && <div role="alert" class="mt-3 rounded-xl bg-amb-bg text-amb px-3 py-2 text-[13px]">{out.map((e) => <p key={e} class="break-words">{e}</p>)}</div>}
    </Sheet>
  );
}

/* ---------------------------------------------------------------- storage meter and Drive check */
export function StorageSheet({ writable, onClose }: { writable: boolean; onClose: () => void }) {
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
export function ShareModal({ ds, onClose }: { ds: NxDesign[]; onClose: (done?: boolean) => void }) {
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

/* ---------------------------------------------------------------- recover designs whose records were lost, from Google Drive */
export function RecoverSheet({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Found[] | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [pg, setPg] = useState(""), [done, setDone] = useState("");
  useEffect(() => { scanDrive().then(setList).catch((e) => setErr((e as Error).message)); }, []);
  const ok = (list ?? []).filter((x) => !x.problem);
  return (
    <Sheet onClose={onClose} title="Recover from Google Drive" footer={<><Button variant="outline" onClick={onClose}>Close</Button><Button disabled={busy || !ok.length} onClick={async () => { setBusy(true); const r = await importFound(ok, (n, t) => setPg(`${n} of ${t}`)); setBusy(false); setDone(`${r.restored} design${r.restored === 1 ? "" : "s"} restored.${r.failed.length ? " Not restored: " + r.failed.join("; ") : ""}`); setList((l) => (l ?? []).filter((x) => x.problem)); }}>{busy ? `Restoring… ${pg}` : `Restore ${ok.length} design${ok.length === 1 ? "" : "s"}`}</Button></>}>
      <div class="px-3 pb-3 grid gap-2">
        <p class="t-meta">These design folders are still in Google Drive, but no design in Nexder points at them. Restoring brings back the name, number, category, photos and files. Price, sizes, description, designer and source link were only in the lost records, so they come back empty. Nothing is deleted or changed in Drive.</p>
        {err && <p class="text-[13px] text-red break-words">{err}</p>}
        {!list && !err && <p class="t-meta">Looking in Google Drive…</p>}
        {done && <p role="status" class="text-[13px] font-semibold break-words">{done}</p>}
        {list && !list.length && !done && <p class="t-meta">Nothing to recover: every design folder in Drive already has a design.</p>}
        <ul class="grid gap-1">{(list ?? []).map((x) => <li key={x.folder} class="rounded-xl bg-c1 px-3 py-2 text-[13px] break-words"><b>{x.no || "—"} · {x.name}</b> <span class="t-meta">· {x.cat} · {x.photos.length} photo{x.photos.length === 1 ? "" : "s"}, {x.files.length} file{x.files.length === 1 ? "" : "s"}</span>{x.problem && <span class="block text-amb">{x.problem}. Not restored.</span>}</li>)}</ul>
      </div>
    </Sheet>
  );
}
