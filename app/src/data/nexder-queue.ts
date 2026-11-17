/**
 * Background uploads for Nexder. Saving a design writes the record at once and puts every original on this queue;
 * the files go to Google Drive one after another while the person keeps working. Tiny on purpose: the dock in the frame reads it.
 */
import { uploadsSig, type UpJob } from "./upload-state";
export { uploadsSig, type UpJob };

/** Does the actual transfer and attaches the Drive id to the design. Set by the Nexder data module. */
type Runner = (j: UpJob, signal: AbortSignal, progress: (n: number) => void) => Promise<void>;
let runner: Runner | null = null, busy = false;
export const setRunner = (r: Runner) => { runner = r; };
const aborts = new Map<string, AbortController>();
const patch = (id: string, p: Partial<UpJob>) => { uploadsSig.value = uploadsSig.value.map((j) => (j.id === id ? { ...j, ...p } : j)); };
export const active = () => uploadsSig.value.some((j) => j.state === "wait" || j.state === "run");
/** Is this item of this design being sent right now, or waiting to be? */
export const isQueued = (designId: string, itemId: string) => uploadsSig.value.some((j) => j.designId === designId && j.itemId === itemId && (j.state === "wait" || j.state === "run"));

export function enqueue(jobs: Omit<UpJob, "id" | "sent" | "state">[]) {
  if (!jobs.length) return;
  /* one job per item: a second request for the same item replaces the old one */
  const keep = uploadsSig.value.filter((o) => !jobs.some((n) => n.designId === o.designId && n.itemId === o.itemId));
  uploadsSig.value = [...keep, ...jobs.map((j) => ({ ...j, id: `${j.designId}:${j.itemId}:${Date.now()}`, sent: 0, state: "wait" as const }))];
  void pump();
}
export async function pump() {
  if (busy || !runner) return; busy = true;
  try {
    for (;;) {
      const j = uploadsSig.value.find((x) => x.state === "wait"); if (!j) break;
      patch(j.id, { state: "run", sent: 0, err: undefined });
      const ac = new AbortController(); aborts.set(j.id, ac);
      try { await runner(j, ac.signal, (n) => patch(j.id, { sent: n })); patch(j.id, { state: "done", sent: j.size }); }
      catch (e) { if (uploadsSig.value.some((x) => x.id === j.id)) patch(j.id, { state: "fail", err: (e as Error).message || "Upload failed" }); }
      aborts.delete(j.id);
    }
  } finally { busy = false; }
  if (!active()) setTimeout(() => { if (!active()) uploadsSig.value = uploadsSig.value.filter((j) => j.state !== "done"); }, 6000);
}
/** Stops one upload and takes it off the list. The file stays on its design as "not uploaded yet". */
export function cancelJob(id: string) { aborts.get(id)?.abort(); uploadsSig.value = uploadsSig.value.filter((j) => j.id !== id); }
export function cancelDesign(designId: string, itemIds?: string[]) { for (const j of uploadsSig.value) if (j.designId === designId && (!itemIds || itemIds.includes(j.itemId))) cancelJob(j.id); }
export const retryJob = (id: string) => { patch(id, { state: "wait", err: undefined, sent: 0 }); void pump(); };
export const dismissJob = (id: string) => { uploadsSig.value = uploadsSig.value.filter((j) => j.id !== id); };

/* closing the tab or reloading would lose the files that are still waiting: the browser asks first */
if (typeof addEventListener === "function") addEventListener("beforeunload", (e) => { if (active() || uploadsSig.value.some((j) => j.state === "fail")) { e.preventDefault(); e.returnValue = ""; } });
