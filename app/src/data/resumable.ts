/** Google Drive resumable upload, kept free of any app imports so it can be tested on its own. */
export type PutResult = { status: number; text: string; range: string | null };
/** Sends one request. Real = XMLHttpRequest (progress events, 308 answers); tests pass a fake Drive. */
export type Put = (url: string, body: Blob, headers: Record<string, string>, onSent: (bytes: number) => void, signal?: AbortSignal) => Promise<PutResult>;
/** Chunk size: a multiple of 256 KiB as Google requires. The browser only ever holds one chunk in memory. */
export const CHUNK = 16 * 1024 * 1024;
export class UploadError extends Error { constructor(m: string, public fatal = true) { super(m); } }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastByte = (range: string | null) => { const m = /bytes=0-(\d+)/.exec(range ?? ""); return m ? Number(m[1]) + 1 : 0; };

/** Sends `file` to an open resumable session in chunks, resuming after a dropped connection. Resolves with the Drive file id. */
export async function sendResumable(session: string, file: Blob, put: Put, onSent: (total: number) => void, signal?: AbortSignal, chunk = CHUNK, wait = sleep): Promise<string> {
  const size = file.size;
  let offset = 0, fails = 0;
  const done = (r: PutResult) => { try { const id = JSON.parse(r.text).id; if (id) return id as string; } catch { /* fall through */ } throw new UploadError("Drive accepted the file but did not return its id"); };
  for (;;) {
    if (signal?.aborted) throw new UploadError("Upload cancelled");
    const end = Math.min(offset + chunk, size), body = file.slice(offset, end);
    const range = offset >= size ? `bytes */${size}` : `bytes ${offset}-${end - 1}/${size}`;
    let r: PutResult | null = null;
    try { r = await put(session, body, { "Content-Range": range }, (n) => onSent(offset + n), signal); } catch (e) { if (signal?.aborted) throw new UploadError("Upload cancelled"); r = null; }
    if (r && (r.status === 200 || r.status === 201)) { onSent(size); return done(r); }
    if (r && r.status === 308) { fails = 0; offset = r.range ? lastByte(r.range) : end; onSent(offset); continue; }
    if (r && (r.status === 404 || r.status === 410)) throw new UploadError("The upload session expired. Start again.");
    if (r && r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429) throw new UploadError(`Google Drive refused the upload (${r.status})`);
    /* network drop or 5xx: back off, then ask Drive how much it already has */
    if (++fails > 5) throw new UploadError("The connection kept dropping. Check the network and try again.", false);
    await wait(Math.min(15000, 800 * 2 ** fails));
    let s: PutResult | null = null;
    try { s = await put(session, new Blob([]), { "Content-Range": `bytes */${size}` }, () => {}, signal); } catch { s = null; }
    if (s && (s.status === 200 || s.status === 201)) { onSent(size); return done(s); }
    if (s && s.status === 308) offset = lastByte(s.range);
    else if (s && (s.status === 404 || s.status === 410)) throw new UploadError("The upload session expired. Start again.");
  }
}

/** The browser transport. */
export const xhrPut: Put = (url, body, headers, onSent, signal) => new Promise((ok, bad) => {
  const x = new XMLHttpRequest();
  x.open("PUT", url);
  for (const [k, v] of Object.entries(headers)) x.setRequestHeader(k, v);
  x.upload.onprogress = (e) => onSent(e.loaded);
  x.onload = () => ok({ status: x.status, text: x.responseText, range: (() => { try { return x.getResponseHeader("Range"); } catch { return null; } })() });
  x.onerror = () => bad(new Error("network"));
  x.onabort = () => bad(new Error("aborted"));
  signal?.addEventListener("abort", () => x.abort(), { once: true });
  x.send(body);
});
