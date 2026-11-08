/**
 * Photos and bill files: stored in Google Drive (via the drive-media Edge Function), never in the database.
 * Records keep only a reference "m:<id>". Until the upload succeeds the file waits on this device (offline-safe);
 * once viewed, each file is cached on the device so it is downloaded at most once.
 * Without cloud sync configured, files stay inline as data URLs (single-device mode).
 */
import { signal } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { localGet, persisted, uid } from "./store";

export type Media = { id: string; drive: string; mime: string };
/** id → Drive file id. Synced, a few dozen bytes per file. */
export const mediaSig = persisted<Media[]>("media", []);
type Pending = { name: string; mime: string; data: string };
const queue = signal<Record<string, Pending>>(localGet("media:queue", {}));
/** False when the device is full: then the caller keeps the file inline rather than risk losing it. */
const saveQueue = () => { try { localStorage.setItem("emerald:media:queue", JSON.stringify(queue.value)); return true; } catch { return false; } };
const cloud = !!import.meta.env.VITE_SUPABASE_URL && import.meta.env.MODE !== "artifact";
export const isRef = (v?: string) => !!v && v.startsWith("m:");

/** Keep a file: returns what to store on the record (a reference in cloud mode, the data URL otherwise). */
export function storeMedia(dataUrl: string, name: string): string {
  if (!cloud) return dataUrl;
  const id = uid().replace(/[^A-Za-z0-9-]/g, "");
  const mime = dataUrl.slice(5, dataUrl.indexOf(";")) || "application/octet-stream";
  const before = queue.value;
  queue.value = { ...before, [id]: { name, mime, data: dataUrl } };
  if (!saveQueue()) { queue.value = before; return dataUrl; }
  uploadPending();
  return "m:" + id;
}

let uploading = false;
/** Sends waiting files to Drive. Called on store, on sign-in, and when the device comes back online. */
export async function uploadPending() {
  if (!cloud || uploading || !Object.keys(queue.value).length) return;
  const sync = await import("./sync");
  if (!sync.cloudUser.value) return;
  uploading = true;
  try {
    for (const [id, p] of Object.entries(queue.value)) {
      const res = await sync.mediaUpload({ id, name: p.name, mime: p.mime, data: p.data.slice(p.data.indexOf(",") + 1) });
      if (!res) break; // offline or failing: try again later, nothing is lost
      if (!mediaSig.value.some((m) => m.id === id)) mediaSig.value = [...mediaSig.value, { id, drive: res, mime: p.mime }];
      const { [id]: _done, ...rest } = queue.value; queue.value = rest; saveQueue();
    }
  } finally { uploading = false; }
}
if (cloud) addEventListener("online", () => uploadPending());

const urls = new Map<string, string>();
async function resolve(v: string): Promise<string> {
  if (!isRef(v)) return v;
  const id = v.slice(2);
  const local = queue.value[id]; if (local) return local.data;
  if (urls.has(id)) return urls.get(id)!;
  const m = mediaSig.value.find((x) => x.id === id); if (!m) return "";
  const cache = "caches" in self ? await caches.open("emerald-media").catch(() => null) : null;
  const key = new Request(location.origin + "/__media/" + id);
  let res = await cache?.match(key);
  if (!res) {
    const blob = await (await import("./sync")).mediaDownload(m.drive); if (!blob) return "";
    res = new Response(blob, { headers: { "Content-Type": m.mime } });
    await cache?.put(key, res.clone()).catch(() => {});
  }
  const url = URL.createObjectURL(await res.blob()); urls.set(id, url); return url;
}
/** Display source for a stored file value (data URL or reference). "" while loading or unavailable. */
export function useMedia(v?: string): string {
  const [src, setSrc] = useState(v && !isRef(v) ? v : "");
  const known = isRef(v) && mediaSig.value.some((m) => m.id === v!.slice(2));
  useEffect(() => { let live = true; if (v) resolve(v).then((s) => live && setSrc(s)); else setSrc(""); return () => { live = false; }; }, [v, known]);
  return src;
}
export const mediaMime = (v?: string) => (!v ? "" : isRef(v) ? (queue.value[v.slice(2)]?.mime ?? mediaSig.value.find((m) => m.id === v.slice(2))?.mime ?? "") : v.slice(5, v.indexOf(";")));
