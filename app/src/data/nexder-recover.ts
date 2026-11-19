/**
 * Rebuilds Nexder designs whose records were lost, from what is still in Google Drive (the originals) and the design folder names
 * ("<5-digit number> <name>" inside a category folder). A person reviews the list and confirms; nothing is written before that.
 * What Drive cannot hold comes back blank: price, sizes, description, designer, source link, extra categories.
 */
import { callFn } from "./sync";
import { me } from "./auth";
import { log } from "./index";
import { today, uid } from "./store";
import { backend, makePreview, nexderCatsSig, nexderDesignsSig, type NxCat, type NxDesign, type NxFile, type NxPhoto } from "./nexder";

type DItem = { id: string; name: string; size?: string; mimeType: string; parents?: string[]; createdTime?: string; appProperties?: { kind?: string } };
export type Found = { folder: string; no: string; name: string; cat: string; created: string; photos: { drive: string; name: string; size: number; mime: string }[]; files: { drive: string; name: string; size: number; mime: string }[]; problem?: string };

const FOLDER = "application/vnd.google-apps.folder";
/** Design folders in Drive that no live design points at. Read-only: nothing is changed. */
export async function scanDrive(): Promise<Found[]> {
  const r = await callFn<{ items: DItem[] }>("nexder-drive", { action: "inventory" });
  if (r.error !== undefined) throw new Error(r.error);
  const items = r.data?.items ?? [], by = new Map(items.map((i) => [i.id, i]));
  const live = new Set(nexderDesignsSig.value.map((d) => d.folder)), liveNo = new Set(nexderDesignsSig.value.map((d) => d.no)), seen = new Set<string>();
  return items.filter((i) => i.mimeType === FOLDER && i.appProperties?.kind === "design" && !live.has(i.id)).map((f): Found => {
    const m = /^(\d{5})\s+(.+)$/.exec(f.name), kids = items.filter((k) => k.mimeType !== FOLDER && k.parents?.includes(f.id)).sort((a, b) => (a.createdTime ?? "").localeCompare(b.createdTime ?? ""));
    const to = (k: DItem) => ({ drive: k.id, name: k.name, size: Number(k.size ?? 0), mime: k.mimeType });
    const no = m?.[1] ?? "", out: Found = { folder: f.id, no, name: (m?.[2] ?? f.name).trim(), cat: by.get(f.parents?.[0] ?? "")?.name ?? "Recovered", created: (f.createdTime ?? "").slice(0, 10) || today(), photos: kids.filter((k) => k.mimeType.startsWith("image/")).map(to), files: kids.filter((k) => !k.mimeType.startsWith("image/")).map(to) };
    if (!m) out.problem = "The folder name has no 5-digit number";
    else if (liveNo.has(no)) out.problem = `Number ${no} is used by a design already in Nexder`;
    else if (seen.has(no)) out.problem = `Two Drive folders share number ${no}`;
    seen.add(no); return out;
  }).sort((a, b) => a.no.localeCompare(b.no));
}

/** A person pressed Import: writes the chosen designs (and any category they need) back, and makes their previews again from the Drive originals. */
export async function importFound(list: Found[], onProgress: (done: number, total: number) => void): Promise<{ restored: number; failed: string[] }> {
  const b = await backend(), failed: string[] = []; let restored = 0;
  const ok = list.filter((x) => !x.problem);
  for (const [n, f] of ok.entries()) {
    onProgress(n, ok.length);
    try {
      const code = Math.floor(Number(f.no) / 1000), seq = Number(f.no) % 1000;
      let cat: NxCat | undefined = nexderCatsSig.value.find((c) => c.code === code) ?? nexderCatsSig.value.find((c) => c.name.toLowerCase() === f.cat.toLowerCase());
      if (!cat) { cat = { id: uid(), name: f.cat, code, last: seq }; nexderCatsSig.value = [...nexderCatsSig.value, cat]; }
      else if (cat.last < seq && cat.code === code) nexderCatsSig.value = nexderCatsSig.value.map((c) => (c.id === cat!.id ? { ...c, last: Math.max(c.last, seq) } : c));
      const photos: NxPhoto[] = [], files: NxFile[] = [];
      const links = f.photos.length ? await b.links(f.photos.map((p) => ({ drive: p.drive, name: p.name }))) : [];
      for (const [i, p] of f.photos.entries()) {
        const id = uid().replace(/[^A-Za-z0-9-]/g, ""); let psize: number | undefined;
        try { const r = await fetch(links[i]); if (r.ok) { const pv = await makePreview(new File([await r.blob()], p.name, { type: p.mime })); await b.previewPut(id, pv); psize = pv.size; } } catch { /* the photo is back; its preview can be made again by editing the design */ }
        photos.push({ id, name: p.name, size: p.size, mime: p.mime, drive: p.drive, ...(psize ? { psize } : {}) });
      }
      for (const x of f.files) files.push({ id: uid().replace(/[^A-Za-z0-9-]/g, ""), name: x.name, size: x.size, mime: x.mime, drive: x.drive });
      const row: NxDesign = { id: uid(), name: f.name, catId: cat.id, no: f.no, folder: f.folder, photos, files, created: f.created, by: me.value?.name ?? "Recovered from Drive" };
      nexderDesignsSig.value = [row, ...nexderDesignsSig.value]; restored++;
      log("Recovered design", `${row.name} · ${row.no} (from Drive)`, "order");
    } catch (e) { failed.push(`${f.no} ${f.name}: ${(e as Error).message}`); }
  }
  onProgress(ok.length, ok.length);
  return { restored, failed };
}
