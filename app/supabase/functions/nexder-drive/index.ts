// Nexder files live in the owner's Google Drive. This function holds the Google credential and never touches file bytes:
//   start    → opens a Google resumable-upload session and hands back only its URL; the browser sends the file to Google directly
//   confirm  → checks the uploaded file really exists in the right folder with the right size
//   ticket   → seals a 2-minute download ticket; the Cloudflare Worker (/nexder-dl) streams the file from Drive to the browser
//   folder / trash / purge / quota / inventory → folder tree, Bin (Drive trash), real deletion of unreferenced items, free space, read-only listing (sweep is disabled)
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN (same as drive-media) and NEXDER_TICKET_KEY (32 random bytes, base64,
// also set on the Cloudflare Worker).
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
class Fail extends Error { constructor(public status: number, m: string) { super(m); } }
/** Space always left free in the Google account (Gmail and Docs share it). */
const RESERVE = 1024 ** 3;
const SWEEP_AGE_MS = 24 * 3600 * 1000;
const TICKET_MS = 120_000;
const WRITERS = ["owner", "partner", "manager"];
const FOLDER = "application/vnd.google-apps.folder";

let token = "", tokenUntil = 0;
async function google() {
  if (token && Date.now() < tokenUntil) return token;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: env("GOOGLE_REFRESH_TOKEN"), grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!r.ok) throw new Fail(502, "Google sign-in failed: " + (j.error_description ?? j.error ?? r.status));
  token = j.access_token; tokenUntil = Date.now() + (j.expires_in - 120) * 1000; return token;
}
const drive = async (path: string, init: RequestInit = {}) => fetch("https://www.googleapis.com" + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: "Bearer " + (await google()) } });
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const ID_RE = /^[A-Za-z0-9_-]{8,100}$/;

async function meta(id: string, fields = "id,name,size,mimeType,parents,appProperties,createdTime,trashed") {
  if (!ID_RE.test(id)) throw new Fail(400, "Bad id");
  const r = await drive(`/drive/v3/files/${id}?fields=${fields}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Fail(502, "Drive error " + r.status);
  return await r.json();
}
/** Only items this function created for this organisation may be touched. */
async function mine(id: string, org: string) {
  const m = await meta(id);
  if (!m) return null;
  if (m.appProperties?.app !== "nexder" || m.appProperties?.org !== org) throw new Fail(403, "Not a Nexder item");
  return m;
}
async function folder(name: string, parent: string | null, org: string, kind: string): Promise<string> {
  const cond = [`name='${q(name)}'`, `mimeType='${FOLDER}'`, "trashed=false", `appProperties has { key='org' and value='${q(org)}' }`, `appProperties has { key='kind' and value='${kind}' }`, parent ? `'${parent}' in parents` : null].filter(Boolean).join(" and ");
  const hit = await (await drive(`/drive/v3/files?q=${encodeURIComponent(cond)}&fields=files(id)&pageSize=1`)).json();
  if (hit?.files?.[0]?.id) return hit.files[0].id;
  const mk = await (await drive("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}), appProperties: { app: "nexder", org, kind } }) })).json();
  if (!mk?.id) throw new Fail(502, "Could not create the Drive folder");
  return mk.id;
}
async function space() {
  const a = await (await drive("/drive/v3/about?fields=storageQuota")).json();
  const limit = a?.storageQuota?.limit ? Number(a.storageQuota.limit) : null;
  return { limit, usage: Number(a?.storageQuota?.usage ?? 0) };
}
const gb = (n: number) => (n / 1024 ** 3).toFixed(2) + " GB";

/* ----- sealed download tickets (AES-GCM; the Worker holds the same key) ----- */
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
async function seal(payload: unknown) {
  const raw = Uint8Array.from(atob(env("NEXDER_TICKET_KEY")), (c) => c.charCodeAt(0));
  if (raw.length !== 32) throw new Fail(500, "NEXDER_TICKET_KEY is not set (32 random bytes, base64)");
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return b64(out);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") throw new Fail(405, "POST only");
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: who } = await admin.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer /, ""));
    if (!who?.user) throw new Fail(401, "Not signed in");
    const { data: me } = await admin.from("members").select("org,role,active").eq("user_id", who.user.id).maybeSingle();
    if (!me?.active || me.role === "ca") throw new Fail(403, "No access");
    const org = me.org as string, canWrite = WRITERS.includes(me.role);
    const b = await req.json().catch(() => ({}));
    const act = String(b.action ?? "");
    const needDownload = () => { if (!canWrite) throw new Fail(403, "Your role can view Nexder but not download its files"); };
    const needWrite = () => { if (!canWrite) throw new Fail(403, "Your role can view Nexder but not change it"); };
    const referenced = async (id: string) => { const { data } = await admin.rpc("nexder_referenced", { p_org: org, p_id: id }); return !!data; };

    if (act === "quota") return json(await space());

    if (act === "folder") { // → design folder: Nexder / <category> / <design>
      needWrite();
      const cat = String(b.cat ?? "").trim().slice(0, 80), label = String(b.label ?? "").trim().slice(0, 120);
      if (!cat || !label) throw new Fail(400, "Missing names");
      const root = await folder("Nexder", null, org, "root"), c = await folder(cat, root, org, "cat");
      return json({ id: await folder(label, c, org, "design") });
    }

    if (act === "start") {
      needWrite();
      const parent = String(b.folder ?? ""), name = String(b.name ?? "").slice(0, 200), mime = String(b.mime ?? "") || "application/octet-stream", size = Number(b.size);
      if (!name || !(size >= 0)) throw new Fail(400, "Bad upload");
      const f = await mine(parent, org); if (!f || f.mimeType !== FOLDER) throw new Fail(404, "Folder not found");
      const sp = await space();
      if (sp.limit !== null && sp.usage + size + RESERVE > sp.limit) throw new Fail(409, `Not enough space in Google Drive: ${gb(Math.max(0, sp.limit - sp.usage - RESERVE))} free, this file is ${gb(size)}`);
      const origin = req.headers.get("Origin") ?? "";
      const init = await drive("/upload/drive/v3/files?uploadType=resumable&fields=id", { method: "POST",
        headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(size), ...(origin ? { Origin: origin } : {}) },
        body: JSON.stringify({ name, parents: [parent], appProperties: { app: "nexder", org, kind: "file", by: who.user.id } }) });
      const session = init.headers.get("Location");
      if (!init.ok || !session) throw new Fail(502, "Drive refused the upload: " + init.status);
      return json({ session });
    }

    if (act === "confirm") {
      needWrite();
      const m = await mine(String(b.id ?? ""), org);
      if (!m || m.trashed) throw new Fail(404, "File not found in Drive");
      if (!m.parents?.includes(String(b.folder ?? ""))) throw new Fail(409, "File is in the wrong folder");
      if (b.size !== undefined && Number(m.size ?? 0) !== Number(b.size)) throw new Fail(409, "Uploaded size does not match");
      return json({ id: m.id, name: m.name, size: Number(m.size ?? 0), mime: m.mimeType });
    }

    if (act === "ticket") { // downloading is limited to the roles that may change Nexder (owner, partner, manager)
      needDownload();
      const files = Array.isArray(b.files) ? b.files.slice(0, 50) : [];
      const t = await google(), out: string[] = [];
      for (const f of files) {
        const m = await mine(String(f.id ?? ""), org);
        if (!m || m.mimeType === FOLDER) throw new Fail(404, "File not found in Drive");
        out.push(await seal({ t, f: m.id, n: String(f.name || m.name).slice(0, 200), s: Number(m.size ?? 0), e: Date.now() + TICKET_MS }));
      }
      return json({ tickets: out });
    }

    if (act === "trash") {
      needWrite();
      const m = await mine(String(b.id ?? ""), org); if (!m) return json({ ok: true });
      const r = await drive(`/drive/v3/files/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: !!b.on }) });
      if (!r.ok) throw new Fail(502, "Drive error " + r.status);
      return json({ ok: true });
    }

    if (act === "purge") { // real deletion, only for items no record (live or in the Bin) still points at
      needWrite();
      const ids: string[] = (Array.isArray(b.ids) ? b.ids : []).slice(0, 100), done: string[] = [], kept: string[] = [];
      for (const id of ids) {
        const m = await mine(String(id), org); if (!m) { done.push(id); continue; }
        if (await referenced(m.id)) { kept.push(id); continue; }
        /* Never a real DELETE: the item goes to Drive's trash, where it stays recoverable for 30 days. */
        const r = await drive(`/drive/v3/files/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
        if (r.ok || r.status === 404) done.push(id); else throw new Fail(502, "Drive error " + r.status);
      }
      return json({ deleted: done, kept });
    }

    /* Abandoned-upload clean-up is switched OFF. It used to hard-delete (no Drive trash) every Nexder file or folder no live record pointed at,
       which destroys the originals of any design whose record was lost or wrongly tombstoned. Nothing in Emerald may delete data on its own. */
    if (act === "sweep") return json({ deleted: 0, disabled: true });

    if (act === "inventory") { // read-only: everything Nexder keeps in Drive for this organisation, to rebuild lost records from
      needWrite();
      const cond = `appProperties has { key='app' and value='nexder' } and appProperties has { key='org' and value='${q(org)}' } and trashed=false`;
      const items: unknown[] = []; let page = "";
      do {
        const r = await (await drive(`/drive/v3/files?q=${encodeURIComponent(cond)}&fields=nextPageToken,files(id,name,size,mimeType,parents,createdTime,appProperties)&pageSize=200${page ? "&pageToken=" + page : ""}`)).json();
        items.push(...(r.files ?? [])); page = r.nextPageToken ?? "";
      } while (page && items.length < 5000);
      return json({ items });
    }

    throw new Fail(400, "Unknown action");
  } catch (e) {
    if (e instanceof Fail) return json({ error: e.message }, e.status);
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
