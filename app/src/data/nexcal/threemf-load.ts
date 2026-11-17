import type { File3MF } from "./threemf";

/** Same limit as threemf.ts ZIP_MAX, kept here so the reader itself is only fetched when a 3MF is opened. */
const ZIP_MAX = 400 * 1024 * 1024;
const onPage = async (buf: Uint8Array) => (await import("./threemf")).read3MF(buf);

/** Opens a .3mf: in a Worker when the browser allows it, else on the page. */
export async function load3MF(file: File): Promise<File3MF> {
  if (file.size > ZIP_MAX) throw new Error(`${file.name} is ${(file.size / 1048576).toFixed(0)} MB. Files over ${ZIP_MAX / 1048576} MB are too big to open in the browser: enter the weight and time from your slicer by hand.`);
  const buf = await file.arrayBuffer();
  try {
    const w = new Worker(new URL("./threemf.worker.ts", import.meta.url), { type: "module" });
    return await new Promise<File3MF>((ok, bad) => {
      w.onmessage = (e: MessageEvent<{ ok: boolean; data?: File3MF; error?: string }>) => { w.terminate(); e.data.ok ? ok(e.data.data!) : bad(new Error(e.data.error)); };
      w.onerror = () => { w.terminate(); bad(new Error("worker")); };
      w.postMessage(buf, [buf]);
    }).catch(async (e) => { if ((e as Error).message !== "worker") throw e; return onPage(new Uint8Array(await file.arrayBuffer())); });
  } catch (e) { if (buf.byteLength) return onPage(new Uint8Array(buf)); throw e; }
}
