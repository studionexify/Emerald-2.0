/**
 * Nexcal — 3MF reader. Pure (no DOM), so it runs in a Worker and in tests.
 *
 * A .3mf is a zip. Slicers (Bambu Studio, Orca, Prusa) save their whole project in it: the models, which build plate each object sits on,
 * the machine and filament settings, per-part filament colours and, when the plate was sliced, the real weight and time per plate.
 * This reads all of that and returns the plates with their objects measured (transforms applied), so the calculator can offer
 * "which plate do you want to price" instead of one anonymous mesh.
 *
 * Nothing here trusts the file: sizes are capped, colours are validated, and geometry is skipped (never half-read) above the caps.
 */
import { unzipSync } from "fflate";
import type { MeshAnalysis } from "./geometry";

export const LIMITS3MF = {
  /** zipped file bigger than this is not opened in the browser */
  zip: 400 * 1024 * 1024,
  /** all model XML together, once inflated; above this the geometry is skipped and only the slicer's own numbers are used */
  models: 450 * 1024 * 1024,
  /** one settings or thumbnail entry */
  small: 8 * 1024 * 1024,
};

export type Colour = string; // "#rrggbb", validated (or GREY when the file gives none)
const GREY = "rgb(154 154 154)";
export interface FilamentUse { slot: number; type: string; colour: Colour; grams?: number }
export interface PlateItem { name: string; analysis: MeshAnalysis; /** extruder (1-based) → volume mm³ of that part */ byExtruder: Record<number, number> }
export interface Plate {
  index: number; name: string; thumb: string; objects: string[]; instances: number;
  items: PlateItem[];
  /** what the slicer itself computed for this plate (only when the file was sliced) */
  slice?: { grams: number; seconds: number };
  filaments: FilamentUse[];
  /** merged size of everything on the plate */
  size?: { x: number; y: number; z: number };
}
export interface Machine { printer?: string; nozzle?: number; layerHeight?: number; walls?: number; infill?: number; support?: boolean; bed?: string; printProfile?: string; filaments: { type: string; colour: Colour; name?: string }[] }
export interface File3MF {
  app: string; sliced: boolean; plates: Plate[]; machine: Machine; entries: { name: string; size: number }[];
  /** plain-language findings, shown to the user ("what this file contains") */
  notes: string[]; geometry: "read" | "skipped";
}

/* ---------------------------------------------------------------- small helpers */
type Mat = number[]; // 12 numbers: m00 m01 m02 m10 m11 m12 m20 m21 m22 tx ty tz (row vectors, as in the 3MF spec)
const ID: Mat = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
const parseMat = (s?: string): Mat => { const n = (s ?? "").trim().split(/\s+/).map(Number); return n.length === 12 && n.every(Number.isFinite) ? n : ID; };
/** apply `a` first, then `b` */
const mul = (a: Mat, b: Mat): Mat => {
  const r = new Array<number>(12);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  for (let j = 0; j < 3; j++) r[9 + j] = a[9] * b[j] + a[10] * b[3 + j] + a[11] * b[6 + j] + b[9 + j];
  return r;
};
const UNITS: Record<string, number> = { micron: 0.001, millimeter: 1, centimeter: 10, inch: 25.4, foot: 304.8, meter: 1000 };
export const colour = (s?: string): Colour | null => { const m = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec((s ?? "").trim()); return m ? "#" + m[1].toLowerCase() : null; };
const dec = (b: Uint8Array) => new TextDecoder("utf-8").decode(b);
const attrs = (tag: string) => { const o: Record<string, string> = {}; for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) o[m[1]] = m[2].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"); return o; };
const b64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

/** Tiny XML reader for the small settings files: a flat list of tags with their attributes and nesting depth. */
interface Tag { name: string; a: Record<string, string>; parent: Tag | null; text?: string }
function readXml(xml: string): Tag[] {
  const out: Tag[] = [], stack: Tag[] = [];
  for (const m of xml.matchAll(/<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g)) {
    if (m[1]) { stack.pop(); continue; }
    const t: Tag = { name: m[2], a: attrs(m[3]), parent: stack[stack.length - 1] ?? null };
    out.push(t); if (!m[4]) stack.push(t);
  }
  return out;
}
const meta = (tags: Tag[], parent: Tag) => { const o: Record<string, string> = {}; for (const t of tags) if (t.parent === parent && t.name === "metadata" && t.a.key) o[t.a.key] = t.a.value ?? ""; return o; };

/* ---------------------------------------------------------------- model files (can be huge: scanned by hand, not through a DOM) */
interface Mesh { v: Float32Array; t: Uint32Array }
interface Obj { id: string; type: string; name?: string; mesh?: Mesh; comps: { id: string; path?: string; m: Mat }[] }
interface Model { unit: number; objects: Map<string, Obj>; items: { id: string; m: Mat; printable: boolean }[]; meta: Record<string, string> }

function grow<T extends Float32Array | Uint32Array>(a: T, need: number): T { if (need <= a.length) return a; const n = new (a.constructor as new (n: number) => T)(Math.max(need, a.length * 2)); n.set(a); return n; }
/** value of `name="…"` inside the tag that spans xml[from, to] */
function at(xml: string, name: string, from: number, to: number): number { const k = xml.indexOf(" " + name + '="', from); return k < 0 || k > to ? NaN : parseFloat(xml.slice(k + name.length + 3, k + name.length + 30)); }

export function scanModel(xml: string): Model {
  const m: Model = { unit: 1, objects: new Map(), items: [], meta: {} };
  let cur: Obj | null = null, nv = 0, nt = 0, v = new Float32Array(3 * 1024), t = new Uint32Array(3 * 1024);
  const seal = () => { if (cur && nt) cur.mesh = { v: v.slice(0, nv * 3), t: t.slice(0, nt * 3) }; nv = 0; nt = 0; };
  let i = 0;
  while ((i = xml.indexOf("<", i)) >= 0) {
    const c = xml.charCodeAt(i + 1);
    if (c === 118 && xml.startsWith("<vertex", i) && xml.charCodeAt(i + 7) <= 47) { // <vertex x= y= z=/>
      const e = xml.indexOf(">", i); v = grow(v, nv * 3 + 3);
      v[nv * 3] = at(xml, "x", i, e); v[nv * 3 + 1] = at(xml, "y", i, e); v[nv * 3 + 2] = at(xml, "z", i, e); nv++; i = e; continue;
    }
    if (c === 116 && xml.startsWith("<triangle", i) && xml.charCodeAt(i + 9) <= 47) { // <triangle v1= v2= v3=/>
      const e = xml.indexOf(">", i); t = grow(t, nt * 3 + 3);
      t[nt * 3] = at(xml, "v1", i, e); t[nt * 3 + 1] = at(xml, "v2", i, e); t[nt * 3 + 2] = at(xml, "v3", i, e); nt++; i = e; continue;
    }
    const e = xml.indexOf(">", i); if (e < 0) break;
    const tag = xml.slice(i, e + 1), name = /^<\/?([\w:.-]+)/.exec(tag)?.[1] ?? "";
    if (tag[1] === "/") { if (name === "object") { seal(); cur = null; } }
    else if (name === "model") m.unit = UNITS[attrs(tag).unit ?? "millimeter"] ?? 1;
    else if (name === "metadata") { const a = attrs(tag); const j = tag.endsWith("/>") ? -1 : xml.indexOf("</metadata>", e); if (a.name && j > 0 && j - e < 400) m.meta[a.name] = xml.slice(e + 1, j); }
    else if (name === "object") { const a = attrs(tag); cur = { id: a.id ?? "", type: a.type ?? "model", name: a.name, comps: [] }; m.objects.set(cur.id, cur); nv = 0; nt = 0; if (tag.endsWith("/>")) cur = null; }
    else if (name === "component" && cur) { const a = attrs(tag); cur.comps.push({ id: a.objectid ?? "", path: (a["p:path"] ?? a.path)?.replace(/^\//, ""), m: parseMat(a.transform) }); }
    else if (name === "item") { const a = attrs(tag); m.items.push({ id: a.objectid ?? "", m: parseMat(a.transform), printable: a.printable !== "0" }); }
    i = e;
  }
  return m;
}

/** volume, area and size of one mesh with a transform applied */
export function measure(mesh: Mesh, M: Mat): MeshAnalysis {
  const { v, t } = mesh; let vol = 0, area = 0; const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const nv = v.length / 3, tc = t.length / 3;
  const X = (k: number) => v[k] * M[0] + v[k + 1] * M[3] + v[k + 2] * M[6] + M[9], Y = (k: number) => v[k] * M[1] + v[k + 1] * M[4] + v[k + 2] * M[7] + M[10], Z = (k: number) => v[k] * M[2] + v[k + 1] * M[5] + v[k + 2] * M[8] + M[11];
  for (let k = 0; k < nv; k++) {
    const x = X(k * 3), y = Y(k * 3), z = Z(k * 3);
    if (x < lo[0]) lo[0] = x; if (y < lo[1]) lo[1] = y; if (z < lo[2]) lo[2] = z; if (x > hi[0]) hi[0] = x; if (y > hi[1]) hi[1] = y; if (z > hi[2]) hi[2] = z;
  }
  for (let k = 0; k < tc; k++) {
    const a = t[k * 3] * 3, b = t[k * 3 + 1] * 3, c = t[k * 3 + 2] * 3;
    if (a >= v.length || b >= v.length || c >= v.length) continue; // a broken index never poisons the totals
    const ax = X(a), ay = Y(a), az = Z(a), bx = X(b), by = Y(b), bz = Z(b), cx = X(c), cy = Y(c), cz = Z(c);
    vol += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    area += 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
  }
  const bbox = { minX: lo[0], minY: lo[1], minZ: lo[2], maxX: hi[0], maxY: hi[1], maxZ: hi[2] };
  const dims = { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] };
  const bb = dims.x * dims.y * dims.z, volumeMm3 = Math.abs(vol);
  return { triangleCount: tc, volumeMm3, surfaceAreaMm2: area, bbox, height: dims.z, dimensions: dims, warning: bb > 0 && volumeMm3 / bb < 0.01 ? "Mesh may not be watertight/manifold — results may be inaccurate." : null };
}
export function merge(a: MeshAnalysis | null, b: MeshAnalysis): MeshAnalysis {
  if (!a) return b;
  const bbox = { minX: Math.min(a.bbox.minX, b.bbox.minX), minY: Math.min(a.bbox.minY, b.bbox.minY), minZ: Math.min(a.bbox.minZ, b.bbox.minZ), maxX: Math.max(a.bbox.maxX, b.bbox.maxX), maxY: Math.max(a.bbox.maxY, b.bbox.maxY), maxZ: Math.max(a.bbox.maxZ, b.bbox.maxZ) };
  const dimensions = { x: bbox.maxX - bbox.minX, y: bbox.maxY - bbox.minY, z: bbox.maxZ - bbox.minZ };
  return { triangleCount: a.triangleCount + b.triangleCount, volumeMm3: a.volumeMm3 + b.volumeMm3, surfaceAreaMm2: a.surfaceAreaMm2 + b.surfaceAreaMm2, bbox, height: dimensions.z, dimensions, warning: a.warning ?? b.warning };
}


/* ---------------------------------------------------------------- the whole file */
const num = (s?: string) => { const n = parseFloat(s ?? ""); return Number.isFinite(n) ? n : undefined; };
const jsonArr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : v == null ? [] : [String(v)]);

function machineOf(files: Record<string, Uint8Array>): Machine {
  const mach: Machine = { filaments: [] };
  const ps = files["Metadata/project_settings.config"];
  if (ps) { // Bambu Studio / Orca: one JSON object
    try {
      const j = JSON.parse(dec(ps)) as Record<string, unknown>;
      mach.printer = String(j.printer_settings_id ?? jsonArr(j.printer_model)[0] ?? "") || undefined; mach.nozzle = num(jsonArr(j.nozzle_diameter)[0]); mach.layerHeight = num(String(j.layer_height ?? ""));
      mach.walls = num(String(j.wall_loops ?? "")); mach.infill = num(String(j.sparse_infill_density ?? "")); mach.support = j.enable_support === undefined ? undefined : String(j.enable_support) === "1";
      mach.bed = String(j.curr_bed_type ?? "") || undefined; mach.printProfile = String(j.print_settings_id ?? "") || undefined;
      const cols = jsonArr(j.filament_colour), types = jsonArr(j.filament_type), names = jsonArr(j.filament_settings_id);
      mach.filaments = cols.map((c, k) => ({ type: types[k] ?? "", colour: colour(c) ?? GREY, name: names[k] }));
    } catch { /* leave empty */ }
  }
  const pe = files["Metadata/Slic3r_PE.config"];
  if (pe && !mach.printer) { // PrusaSlicer: "; key = value" lines at the end of the file
    const kv: Record<string, string> = {}; for (const m of dec(pe).matchAll(/^;\s*([\w]+)\s*=\s*(.*)$/gm)) kv[m[1]] = m[2].trim();
    mach.printer = kv.printer_model || kv.printer_settings_id || undefined; mach.nozzle = num(kv.nozzle_diameter); mach.layerHeight = num(kv.layer_height); mach.walls = num(kv.perimeters); mach.infill = num(kv.fill_density); mach.support = kv.support_material ? kv.support_material === "1" : undefined;
    mach.printProfile = kv.print_settings_id || undefined;
    const cols = (kv.filament_colour ?? "").split(";"), types = (kv.filament_type ?? "").split(";");
    mach.filaments = cols.filter(Boolean).map((c, k) => ({ type: types[k] ?? "", colour: colour(c.replace(/"/g, "")) ?? GREY }));
  }
  return mach;
}

export function read3MF(zipped: Uint8Array): File3MF {
  const entries: { name: string; size: number }[] = [];
  unzipSync(zipped, { filter: (f) => { entries.push({ name: f.name, size: f.originalSize }); return false; } });
  const modelBytes = entries.filter((e) => /\.model$/i.test(e.name)).reduce((a, e) => a + e.size, 0);
  const geometry: File3MF["geometry"] = modelBytes <= LIMITS3MF.models ? "read" : "skipped";
  const want = (n: string, size: number) => size <= LIMITS3MF.small && (/^Metadata\//i.test(n) && /\.(config|json|png|xml)$/i.test(n) || /^\[Content_Types\]/.test(n)) || (geometry === "read" && /\.model$/i.test(n));
  const files = unzipSync(zipped, { filter: (f) => want(f.name, f.originalSize) });
  const notes: string[] = [];
  if (!files["3D/3dmodel.model"]) { notes.push("This file has no 3D/3dmodel.model, so it is not a standard 3MF."); }

  /* models */
  const models = new Map<string, Model>();
  if (geometry === "read") { for (const [n, b] of Object.entries(files)) if (/\.model$/i.test(n)) { try { models.set(n, scanModel(dec(b))); } catch { notes.push(`Could not read ${n}.`); } } }
  else notes.push("The models in this file are very large, so only the slicer's own weight and time are used.");
  const root = models.get("3D/3dmodel.model");
  const app = root?.meta.Application ?? (root?.meta["BambuStudio:3mfVersion"] ? "Bambu Studio" : "");

  /* slicer settings */
  const machine = machineOf(files);
  const ms = files["Metadata/model_settings.config"] ? readXml(dec(files["Metadata/model_settings.config"])) : [];
  const si = files["Metadata/slice_info.config"] ? readXml(dec(files["Metadata/slice_info.config"])) : [];

  /* names and part kinds from model_settings */
  const objName = new Map<string, string>(), partKind = new Map<string, string>(), objExt = new Map<string, number>(), partExt = new Map<string, number>();
  for (const o of ms.filter((t) => t.name === "object")) {
    const md = meta(ms, o); if (md.name) objName.set(o.a.id, md.name); if (md.extruder) objExt.set(o.a.id, Number(md.extruder));
    for (const p of ms.filter((t) => t.name === "part" && t.parent === o)) { partKind.set(o.a.id + "/" + p.a.id, p.a.subtype ?? "normal_part"); const pm = meta(ms, p); if (pm.extruder) partExt.set(o.a.id + "/" + p.a.id, Number(pm.extruder)); }
  }

  /* which build items sit on which plate */
  const byObj = new Map<string, number[]>(); (root?.items ?? []).forEach((it, k) => { if (it.printable) byObj.set(it.id, [...(byObj.get(it.id) ?? []), k]); });
  type Member = { object: string; item: number };
  const plateMembers = new Map<number, { name: string; members: Member[] }>();
  for (const p of ms.filter((t) => t.name === "plate")) {
    const md = meta(ms, p), idx = Number(md.plater_id); if (!Number.isFinite(idx)) continue;
    const used = new Map<string, number>(), members: Member[] = [];
    for (const mi of ms.filter((t) => t.name === "model_instance" && t.parent === p)) {
      const oid = meta(ms, mi).object_id, inst = Number(meta(ms, mi).instance_id ?? used.get(oid) ?? 0), list = byObj.get(oid) ?? [];
      const item = list[inst] ?? list[used.get(oid) ?? 0]; used.set(oid, (used.get(oid) ?? 0) + 1);
      if (item !== undefined) members.push({ object: oid, item });
    }
    plateMembers.set(idx, { name: md.plater_name || "", members });
  }
  if (!plateMembers.size && root) plateMembers.set(1, { name: "", members: root.items.map((it, k) => ({ object: it.id, item: k })).filter((m) => root.items[m.item].printable) });

  /* what the slicer computed per plate (only in files saved after slicing) */
  const sliceBy = new Map<number, { grams: number; seconds: number; fil: FilamentUse[]; objects: string[] }>();
  for (const p of si.filter((t) => t.name === "plate")) {
    const md = meta(si, p), idx = Number(md.index); if (!Number.isFinite(idx)) continue;
    const fil: FilamentUse[] = si.filter((t) => t.name === "filament" && t.parent === p).map((f) => ({ slot: Number(f.a.id), type: f.a.type ?? "", colour: colour(f.a.color) ?? GREY, grams: num(f.a.used_g) }));
    const grams = num(md.weight) ?? fil.reduce((a, f) => a + (f.grams ?? 0), 0), seconds = num(md.prediction) ?? 0;
    sliceBy.set(idx, { grams, seconds, fil, objects: si.filter((t) => t.name === "object" && t.parent === p && t.a.skipped !== "true").map((o) => o.a.name).filter(Boolean) });
  }
  for (const idx of sliceBy.keys()) if (!plateMembers.has(idx)) plateMembers.set(idx, { name: "", members: [] });
  const sliced = [...sliceBy.values()].some((s) => s.grams > 0);

  /* measure every instance, part by part */
  const plates: Plate[] = [];
  for (const [index, pm] of [...plateMembers].sort((a, b) => a[0] - b[0])) {
    const items: PlateItem[] = [], names = new Set<string>();
    if (root) for (const mem of pm.members) {
      const it = root.items[mem.item], obj = root.objects.get(mem.object); if (!obj || (obj.type !== "model" && obj.type !== "")) continue;
      let whole: MeshAnalysis | null = null; const byExtruder: Record<number, number> = {};
      const walk = (o: Obj, model: Model, M: Mat, top: boolean) => {
        if (o.mesh) { const a = measure(o.mesh, mul(M, [model.unit, 0, 0, 0, model.unit, 0, 0, 0, model.unit, 0, 0, 0])); whole = merge(whole, a); return a; }
        for (const c of o.comps) {
          const kind = top ? partKind.get(mem.object + "/" + c.id) : undefined;
          if (kind && kind !== "normal_part") continue; // modifiers, negative volumes, support blockers are not printed
          const target = c.path ? models.get(c.path) : model, child = target?.objects.get(c.id); if (!target || !child || (child.type !== "model" && child.type !== "")) continue;
          const a = walk(child, target, mul(c.m, M), false);
          if (a && top) { const ex = partExt.get(mem.object + "/" + c.id) ?? objExt.get(mem.object) ?? 1; byExtruder[ex] = (byExtruder[ex] ?? 0) + a.volumeMm3; }
        }
        return null as MeshAnalysis | null;
      };
      const direct = walk(obj, root, it.m, true);
      if (direct) byExtruder[objExt.get(mem.object) ?? 1] = direct.volumeMm3;
      const analysis = whole as MeshAnalysis | null; if (!analysis) continue;
      const name = objName.get(mem.object) ?? obj.name ?? `Object ${mem.object}`; names.add(name);
      items.push({ name, analysis, byExtruder });
    }
    const sl = sliceBy.get(index);
    const merged = items.reduce<MeshAnalysis | null>((acc, x) => merge(acc, x.analysis), null);
    /* filament colours: the slicer's own list when sliced, else the colours of the extruders the parts use, in proportion to volume */
    let filaments: FilamentUse[] = sl?.fil ?? [];
    if (!filaments.length && items.length) {
      const vol: Record<number, number> = {}; for (const x of items) for (const [e, v] of Object.entries(x.byExtruder)) vol[+e] = (vol[+e] ?? 0) + v;
      filaments = Object.keys(vol).map(Number).sort((a, b) => a - b).map((e) => ({ slot: e, type: machine.filaments[e - 1]?.type ?? "", colour: machine.filaments[e - 1]?.colour ?? GREY }));
    }
    const png = files[`Metadata/plate_${index}.png`];
    plates.push({
      index, name: pm.name || `Plate ${index}`, thumb: png && png.length < LIMITS3MF.small ? "data:image/png;base64," + b64(png) : "",
      objects: [...names].length ? [...names] : sl?.objects ?? [], instances: items.length || sl?.objects.length || 0, items,
      slice: sl && sl.grams > 0 ? { grams: sl.grams, seconds: sl.seconds } : undefined, filaments,
      size: merged ? { x: merged.dimensions.x, y: merged.dimensions.y, z: merged.dimensions.z } : undefined,
    });
  }
  if (!plates.length) notes.push("No printable models were found in this file.");
  if (!sliced) notes.push("This is a project that was not sliced, so the weight and time are estimated from the model. Save the sliced plate from your slicer for exact figures.");
  if (plates.length > 1) notes.push(`${plates.length} plates found.`);
  return { app, sliced, plates, machine, entries, notes, geometry };
}
