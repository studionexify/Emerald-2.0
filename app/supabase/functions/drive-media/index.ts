// Photos & bill files live in the owner's Google Drive (15 GB free), not in the database.
// POST {id, name, mime, data(base64)} → uploads once (idempotent on id) → {drive}
// GET ?drive=<fileId>                 → streams the file back to signed-in members of the same business.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN. Files go in an "Emerald files" folder the function creates once.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const env = (k: string) => Deno.env.get(k) ?? "";
const MAX = 8 * 1024 * 1024;
const ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

let token = "", tokenUntil = 0;
async function google() {
  if (token && Date.now() < tokenUntil) return token;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID"), client_secret: env("GOOGLE_CLIENT_SECRET"), refresh_token: env("GOOGLE_REFRESH_TOKEN"), grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!r.ok) throw new Error("Google sign-in failed: " + (j.error_description ?? j.error ?? r.status));
  token = j.access_token; tokenUntil = Date.now() + (j.expires_in - 120) * 1000; return token;
}
const drive = async (path: string, init: RequestInit = {}) => fetch("https://www.googleapis.com" + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: "Bearer " + (await google()) } });

let folder = "";
async function folderId() {
  if (folder) return folder;
  const q = encodeURIComponent("name='Emerald files' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const hit = await (await drive(`/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`)).json();
  if (hit?.files?.[0]?.id) return (folder = hit.files[0].id);
  const mk = await (await drive("/drive/v3/files?fields=id", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Emerald files", mimeType: "application/vnd.google-apps.folder" }) })).json();
  if (!mk?.id) throw new Error("Could not create the Drive folder");
  return (folder = mk.id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
    const { data: who } = await admin.auth.getUser((req.headers.get("Authorization") ?? "").replace(/^Bearer /, ""));
    if (!who?.user) return json({ error: "Not signed in" }, 401);
    const { data: me } = await admin.from("members").select("org,active").eq("user_id", who.user.id).maybeSingle();
    if (!me?.active) return json({ error: "No access" }, 403);

    if (req.method === "GET") {
      const id = new URL(req.url).searchParams.get("drive") ?? "";
      if (!ID_RE.test(id)) return json({ error: "Bad id" }, 400);
      const meta = await (await drive(`/drive/v3/files/${id}?fields=mimeType,appProperties`)).json();
      if (meta?.appProperties?.org !== me.org) return json({ error: "Not found" }, 404);
      const f = await drive(`/drive/v3/files/${id}?alt=media`);
      if (!f.ok) return json({ error: "Drive error " + f.status }, 502);
      return new Response(f.body, { headers: { ...cors, "Content-Type": meta.mimeType ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" } });
    }
    if (req.method !== "POST") return json({ error: "GET or POST" }, 405);

    const b = await req.json().catch(() => ({}));
    const id = String(b.id ?? ""), mime = String(b.mime ?? "application/octet-stream"), name = String(b.name ?? id).slice(0, 120);
    if (!ID_RE.test(id) || typeof b.data !== "string") return json({ error: "Bad upload" }, 400);
    const bytes = Uint8Array.from(atob(b.data), (c) => c.charCodeAt(0));
    if (bytes.length > MAX) return json({ error: "File over 8 MB" }, 413);

    // Idempotent: a retried upload returns the file already stored for this id.
    const q = encodeURIComponent(`appProperties has { key='mid' and value='${id}' } and trashed=false`);
    const found = await (await drive(`/drive/v3/files?q=${q}&fields=files(id)&pageSize=1`)).json();
    if (found?.files?.[0]?.id) return json({ drive: found.files[0].id });

    const meta = { name, parents: [await folderId()], appProperties: { org: me.org, mid: id } };
    const boundary = "emerald" + crypto.randomUUID();
    const head = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
    const tail = new TextEncoder().encode(`\r\n--${boundary}--`);
    const body = new Uint8Array(head.length + bytes.length + tail.length); body.set(head); body.set(bytes, head.length); body.set(tail, head.length + bytes.length);
    const up = await drive("/upload/drive/v3/files?uploadType=multipart&fields=id", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body });
    const j = await up.json();
    return up.ok ? json({ drive: j.id }) : json({ error: j?.error?.message ?? "Drive upload failed" }, 502);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
});
