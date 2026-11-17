// Run: node --experimental-transform-types --no-warnings scripts/test-upload.mts  (Drive resumable upload against a fake Drive, and the download Worker)
import { sendResumable, CHUNK, type Put, type PutResult } from "../src/data/resumable.ts";
import { open, download } from "../src/worker.ts";
import assert from "node:assert/strict";

/* ---- fake Google Drive resumable endpoint ---- */
function drive(opts: { failAt?: number[]; hideRange?: boolean } = {}) {
  let got = 0, calls = 0; const log: string[] = []; const fail = new Set(opts.failAt ?? []);
  const put: Put = async (_u, body, h, onSent) => {
    calls++; const cr = h["Content-Range"]; log.push(cr);
    if (fail.has(calls)) { throw new Error("network"); }
    const q = /^bytes \*\/(\d+)$/.exec(cr);
    if (q) { const total = Number(q[1]); if (got >= total && total >= 0 && (total === 0 || got === total)) return { status: 200, text: JSON.stringify({ id: "FILEID123" }), range: null }; return { status: 308, text: "", range: got ? `bytes=0-${got - 1}` : null }; }
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(cr)!; const s = Number(m[1]), e = Number(m[2]), total = Number(m[3]);
    assert.equal(s, got, "chunk must start where Drive left off"); assert.equal(body.size, e - s + 1);
    assert.ok(body.size % (256 * 1024) === 0 || e + 1 === total, "chunks are multiples of 256 KiB except the last");
    got = e + 1; onSent(body.size);
    return got >= total ? { status: 200, text: JSON.stringify({ id: "FILEID123" }), range: null } : { status: 308, text: "", range: opts.hideRange ? null : `bytes=0-${got - 1}` };
  };
  return { put, log, get calls() { return calls; } };
}
const noWait = async () => {};
const blob = (n: number) => new Blob([new Uint8Array(n)]);

// 1: exactly 3 chunks + remainder
{ const d = drive(); const sent: number[] = []; const id = await sendResumable("s", blob(2.5 * 1048576), d.put, (n) => sent.push(n), undefined, 1048576, noWait); assert.equal(id, "FILEID123"); assert.equal(d.log.length, 3); assert.equal(sent.at(-1), 2.5 * 1048576); console.log("ok chunked 2.5MB in", d.log.join(" | ")); }
// 2: tiny and empty files
{ const d = drive(); await sendResumable("s", blob(10), d.put, () => {}, undefined, 262144, noWait); assert.equal(d.log[0], "bytes 0-9/10"); const e = drive(); assert.equal(await sendResumable("s", blob(0), e.put, () => {}, undefined, 262144, noWait), "FILEID123"); assert.equal(e.log[0], "bytes */0"); console.log("ok tiny + empty"); }
// 3: connection drops mid-way; resumes from what Drive has, never re-sends accepted bytes
{ const d = drive({ failAt: [2] }); const id = await sendResumable("s", blob(1048576 * 3), d.put, () => {}, undefined, 1048576, noWait); assert.equal(id, "FILEID123"); console.log("ok resumed after drop:", d.log.join(" | ")); }
// 4: Range header unreadable (CORS): still completes
{ const d = drive({ hideRange: true }); assert.equal(await sendResumable("s", blob(1048576 * 2), d.put, () => {}, undefined, 1048576, noWait), "FILEID123"); console.log("ok without readable Range header"); }
// 5: cancel
{ const ac = new AbortController(); const d = drive(); const p = sendResumable("s", blob(1048576 * 3), async (...a) => { ac.abort(); return d.put(...a); }, () => {}, ac.signal, 1048576, noWait); await assert.rejects(p, /cancelled/); console.log("ok cancel"); }
// 6: 4xx is fatal, 5xx retries then gives up
{ const p: Put = async () => ({ status: 403, text: "", range: null }); await assert.rejects(sendResumable("s", blob(5), p, () => {}, undefined, 262144, noWait), /refused/); let n = 0; const q: Put = async (): Promise<PutResult> => { n++; return { status: 503, text: "", range: null }; }; await assert.rejects(sendResumable("s", blob(5), q, () => {}, undefined, 262144, noWait), /dropping/); console.log("ok errors, retries:", n); }
console.log("default chunk", CHUNK / 1048576, "MiB (multiple of 256KiB:", CHUNK % 262144 === 0, ")");

/* ---- Worker: ticket sealed the way the Supabase function seals it ---- */
const keyRaw = crypto.getRandomValues(new Uint8Array(32)); const keyB64 = btoa(String.fromCharCode(...keyRaw));
const b64u = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function seal(payload: unknown) { const key = await crypto.subtle.importKey("raw", keyRaw, "AES-GCM", false, ["encrypt"]); const iv = crypto.getRandomValues(new Uint8Array(12)); const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload)))); const o = new Uint8Array(12 + ct.length); o.set(iv); o.set(ct, 12); return b64u(o); }
const t = await seal({ t: "ya29.token", f: "abcDEF123456", n: "Desk organiser ñ.stl", s: 5, e: Date.now() + 60000 });
assert.ok(await open(t, keyB64)); assert.equal(await open(t, keyB64, Date.now() + 120000), null); assert.equal(await open(t + "x", keyB64), null); assert.equal(await open(t, btoa("x".repeat(32))), null); console.log("ok ticket open / expiry / tamper / wrong key");
let seen: { url: string; h: Record<string, string> } | null = null;
const up = (async (url: string, init: any) => { seen = { url, h: init.headers }; return new Response("HELLO", { status: init.headers.Range ? 206 : 200, headers: { "Content-Type": "model/stl", "Content-Length": "5", ...(init.headers.Range ? { "Content-Range": "bytes 0-4/99" } : {}) } }); }) as unknown as typeof fetch;
const env = { NEXDER_TICKET_KEY: keyB64, ASSETS: { fetch: async () => new Response("asset") } };
let r = await download(new Request("https://x/nexder-dl?t=" + t, { headers: { Range: "bytes=0-4" } }), env as any, up);
assert.equal(r.status, 206); assert.equal(await r.text(), "HELLO"); assert.equal((seen as any).h.Authorization, "Bearer ya29.token"); assert.equal((seen as any).h.Range, "bytes=0-4"); assert.match(r.headers.get("Content-Disposition")!, /attachment; filename="Desk organiser _\.stl"; filename\*=UTF-8''Desk%20organiser%20%C3%B1\.stl/); assert.equal(r.headers.get("Cache-Control"), "private, no-store");
r = await download(new Request("https://x/nexder-dl?t=garbage"), env as any, up); assert.equal(r.status, 410);
r = await download(new Request("https://x/nexder-dl?t=" + t), { ...env, NEXDER_TICKET_KEY: undefined } as any, up); assert.equal(r.status, 503);
r = await download(new Request("https://x/nexder-dl?t=" + t, { method: "POST" }), env as any, up); assert.equal(r.status, 405);
console.log("ok worker: range, headers, expired, no key, method");
