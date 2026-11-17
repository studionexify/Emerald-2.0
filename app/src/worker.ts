/**
 * Cloudflare Worker in front of the static site. Only /nexder-dl runs this code (wrangler: run_worker_first), so every other
 * request is served as free, unlimited static assets. /nexder-dl streams one Nexder file from Google Drive to the browser's
 * own download manager. It holds no Google credential: the Supabase function seals a 2-minute ticket (AES-GCM) that carries a
 * short-lived Drive token, and this Worker only opens it with NEXDER_TICKET_KEY. Nothing is stored or buffered here.
 */
export interface Env { ASSETS: { fetch: (r: Request) => Promise<Response> }; NEXDER_TICKET_KEY?: string }
export type Ticket = { t: string; f: string; n: string; s?: number; e: number };

const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export async function open(ticket: string, keyB64: string, now = Date.now()): Promise<Ticket | null> {
  try {
    const raw = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0)); if (raw.length !== 32) return null;
    const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    const all = unb64(ticket);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
    const t = JSON.parse(new TextDecoder().decode(pt)) as Ticket;
    return t.e > now && /^[A-Za-z0-9_-]{8,100}$/.test(t.f) ? t : null;
  } catch { return null; }
}
const safeName = (n: string) => n.replace(/[\r\n"\\/]/g, "_");
const text = (m: string, status: number) => new Response(m, { status, headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });

export async function download(req: Request, env: Env, up: typeof fetch = fetch): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return text("GET only", 405);
  if (!env.NEXDER_TICKET_KEY) return text("Downloads are not set up yet (NEXDER_TICKET_KEY is missing on the Worker).", 503);
  const tk = await open(new URL(req.url).searchParams.get("t") ?? "", env.NEXDER_TICKET_KEY);
  if (!tk) return text("This download link has expired. Go back to Emerald and press Get again.", 410);
  const range = req.headers.get("Range");
  const r = await up(`https://www.googleapis.com/drive/v3/files/${tk.f}?alt=media`, { method: req.method, headers: { Authorization: "Bearer " + tk.t, ...(range ? { Range: range } : {}) } });
  if (!r.ok && r.status !== 206) return text(r.status === 404 ? "This file is no longer in Google Drive." : `Google Drive answered ${r.status}.`, r.status === 404 ? 404 : 502);
  const h = new Headers({ "Cache-Control": "private, no-store", "Accept-Ranges": "bytes", "X-Content-Type-Options": "nosniff",
    "Content-Type": r.headers.get("Content-Type") ?? "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName(tk.n).replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(tk.n)}` });
  for (const k of ["Content-Length", "Content-Range"]) { const v = r.headers.get(k); if (v) h.set(k, v); }
  return new Response(req.method === "HEAD" ? null : r.body, { status: r.status, headers: h });
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return new URL(req.url).pathname === "/nexder-dl" ? download(req, env) : env.ASSETS.fetch(req);
  },
};
