/** Nexder categories: put many designs into many categories at once, and add, rename or delete categories in bulk. Loaded only when opened. */
import { useState } from "preact/hooks";
import { ask, Button, inputCls, Sheet } from "../ui";
import { catsOf, nexderCatsSig, nexderDesignsSig, type NxDesign } from "../data/nexder";
import { addCategories, canDeleteCategory, deleteCategory, renameCategory, setMembership } from "../data/nexder-cats";

/** Tick the categories the chosen designs should be in. A dash means only some of them are in it now; leave it alone to keep it as it is. */
export function AssignCats({ ds, onClose }: { ds: NxDesign[]; onClose: (done?: boolean) => void }) {
  const cats = nexderCatsSig.value, ids = ds.map((d) => d.id);
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
  const cats = nexderCatsSig.value, [text, setText] = useState(""), [note, setNote] = useState(""), [edit, setEdit] = useState<{ id: string; v: string } | null>(null);
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
        <div key={c.id} class="flex items-center gap-2 rounded-xl border border-line bg-c0 px-3 py-2">
          {edit?.id === c.id
            ? <input autofocus value={edit.v} aria-label="Category name" onInput={(e) => setEdit({ id: c.id, v: (e.target as HTMLInputElement).value })} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setEdit(null); }} class={`${inputCls} flex-1 min-w-0`} />
            : <span class="min-w-0 flex-1 text-[14px] font-medium break-words">{c.name}<span class="t-meta font-normal"> · {count(c.id)} design{count(c.id) === 1 ? "" : "s"}</span></span>}
          {edit?.id === c.id
            ? <><button type="button" onClick={save} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Save</button><button type="button" onClick={() => setEdit(null)} class="text-[12px] text-c3 underline underline-offset-2 cursor-pointer !min-h-0">Cancel</button></>
            : <><button type="button" onClick={() => { setEdit({ id: c.id, v: c.name }); setNote(""); }} class="text-[12px] font-semibold underline underline-offset-2 cursor-pointer !min-h-0">Rename</button>
              <button type="button" onClick={async () => { if (!canDeleteCategory(c.id)) { setNote(deleteCategory(c.id) ?? ""); return; } if (await ask(`Delete the category “${c.name}”? Designs stay; they just leave this category.`, { ok: "Delete category", danger: true })) setNote(deleteCategory(c.id) ?? ""); }} class="text-[12px] text-red underline underline-offset-2 cursor-pointer !min-h-0">Delete</button></>}
        </div>))}
        {!cats.length && <p class="t-meta">No category yet.</p>}</div>
    </Sheet>
  );
}
