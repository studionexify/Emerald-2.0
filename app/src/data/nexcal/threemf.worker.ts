/** Reads a .3mf off the main thread, so a big project never freezes the page. */
import { read3MF } from "./threemf";
self.onmessage = (e: MessageEvent<ArrayBuffer>) => {
  try { (self as unknown as Worker).postMessage({ ok: true, data: read3MF(new Uint8Array(e.data)) }); }
  catch (err) { (self as unknown as Worker).postMessage({ ok: false, error: (err as Error).message || "Could not read this 3MF" }); }
};
