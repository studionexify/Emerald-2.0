/**
 * Cloud sync (Supabase). Local-first: the UI never waits on the network.
 * - Outgoing: changed records queue in an outbox and go up as batched upserts of 300.
 * - Incoming: one Realtime channel per business pushes other devices' edits in < 1 s.
 * - Reconnect: fetch only rows changed since the last sync. No polling anywhere.
 * Loaded lazily after first paint; does nothing when VITE_SUPABASE_URL is unset.
 */
import { signal } from "@preact/signals";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { sessionSig, usersSig, type Role } from "./auth";
import { storeMedia, uploadPending } from "./media";
import { billsSig, photosSig } from "./ledger";
import { allRecords, applyRemote, localGet, localSet, setSyncSink, type Change } from "./store";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudEnabled = !!(URL_ && KEY);
export type SyncState = "off" | "checking" | "signed-out" | "synced" | "sending" | "offline" | "error";
export const syncState = signal<SyncState>(cloudEnabled ? "checking" : "off");
export const cloudUser = signal<{ id: string; username: string; org: string; role: Role } | null>(null);
export const DOMAIN = "emerald.app";
export const toEmail = (username: string) => (username.includes("@") ? username : `${username.trim().toLowerCase()}@${DOMAIN}`);
type Member = { user_id: string; org: string; role: Role; username: string; name: string; active: boolean };

let sb: SupabaseClient | null = null;
let channel: RealtimeChannel | null = null;
let org = "";
const outbox = new Map<string, Change>(localGet<[string, Change][]>("sync:outbox", []));
const keyOf = (c: Change) => c.kind + "/" + c.id;
const strip = (c: Change): Change => (c.kind === "users" && c.data && typeof c.data === "object" ? { ...c, data: { ...(c.data as any), pass: undefined } } : c);

async function client() {
  if (!sb) { const { createClient } = await import("@supabase/supabase-js"); sb = createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true } }); }
  return sb;
}

let sending: Promise<void> | null = null, again = false;
async function push() {
  if (!org || !outbox.size) return;
  if (sending) { again = true; return sending; }
  sending = (async () => {
    syncState.value = "sending";
    const batch = [...outbox.values()];
    // Sent in chunks so a big change (an Emerald 1 import is ~2,700 rows) never exceeds one request's size; each chunk that lands leaves the outbox.
    const c0 = await client();
    for (let i = 0; i < batch.length; i += 300) {
      const part = batch.slice(i, i + 300);
      const rows = part.map((c) => ({ org, kind: c.kind, id: c.id, data: c.data ?? null, deleted: c.deleted }));
      const { error } = await c0.from("records").upsert(rows, { onConflict: "org,kind,id" });
      if (error) { localSet("sync:outbox", [...outbox]); syncState.value = navigator.onLine ? "error" : "offline"; return; }
      for (const c of part) if (outbox.get(keyOf(c)) === c) outbox.delete(keyOf(c));
      localSet("sync:outbox", [...outbox]);
    }
    syncState.value = "synced";
  })().finally(() => { sending = null; if (again) { again = false; push(); } });
  return sending;
}
let pushTimer: ReturnType<typeof setTimeout> | 0 = 0;
function enqueue(changes: Change[]) {
  for (const c of changes) outbox.set(keyOf(c), strip(c));
  localSet("sync:outbox", [...outbox]);
  if (!pushTimer) pushTimer = setTimeout(() => { pushTimer = 0; push(); }, 300);
}

type Row = { kind: string; id: string; data: unknown; deleted: boolean; updated_at: string };
const toChange = (r: Row): Change => ({ kind: r.kind, id: r.id, data: r.data, deleted: r.deleted });
async function catchUp() {
  const last = localGet<string>("sync:last", "1970-01-01T00:00:00Z");
  let newest = last, from = 0;
  for (;;) {
    const { data, error } = await (await client()).from("records").select("kind,id,data,deleted,updated_at").eq("org", org).gt("updated_at", last).order("updated_at").range(from, from + 999);
    if (error) throw error;
    const rows = (data ?? []) as Row[];
    // Our own unsent edits win over older server copies.
    applyRemote(rows.filter((r) => !outbox.has(r.kind + "/" + r.id)).map(toChange));
    if (rows.length) newest = rows[rows.length - 1].updated_at;
    if (rows.length < 1000) break; from += 1000;
  }
  localSet("sync:last", newest);
  return last.startsWith("1970");
}

function listen() {
  channel?.unsubscribe();
  channel = sb!.channel("records:" + org)
    .on("postgres_changes", { event: "*", schema: "public", table: "records", filter: `org=eq.${org}` }, (p: any) => {
      const r = p.new as Row; if (!r?.kind) return;
      if (!outbox.has(r.kind + "/" + r.id)) applyRemote([toChange(r)]);
      if (r.updated_at > localGet("sync:last", "")) localSet("sync:last", r.updated_at);
    })
    .subscribe((s) => { if (s === "SUBSCRIBED") { syncState.value = outbox.size ? "sending" : "synced"; catchUp().then(push).catch(() => {}); } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") syncState.value = "offline"; });
}

/** Tiniest daily touch: one upsert of today's heartbeat row, at most once a day per device. */
async function heartbeat() {
  const day = new Date().toISOString().slice(0, 10);
  if (localGet("sync:beat", "") === day) return;
  const { error } = await (await client()).rpc("beat");
  if (!error) localSet("sync:beat", day);
}

/** Members are the source of truth for who can sign in and with which role; mirror them into the app's roster. */
function mirrorMembers(ms: Member[]) {
  const byId = new Map(usersSig.value.map((u) => [u.id, u]));
  for (const m of ms) {
    const prev = byId.get(m.user_id);
    byId.set(m.user_id, { ...(prev ?? { job: "", pass: "" }), id: m.user_id, name: m.name || m.username, email: m.username, role: m.role, active: m.active, login: true } as any);
  }
  usersSig.value = [...byId.values()];
}
let memberChannel: RealtimeChannel | null = null;
export async function loadMembers() {
  const { data } = await (await client()).from("members").select("user_id,org,role,username,name,active").eq("org", org);
  mirrorMembers((data ?? []) as Member[]);
}

async function start(userId: string) {
  const c = await client();
  const { data, error } = await c.from("members").select("user_id,org,role,username,name,active").eq("user_id", userId).maybeSingle();
  if (error || !data || !data.active) { syncState.value = "error"; await c.auth.signOut(); return; }
  org = data.org; cloudUser.value = { id: userId, username: data.username, org, role: data.role };
  const firstSync = await catchUp().catch(() => false);
  if (firstSync && localGet("sync:seeded:" + org, false) === false) {
    const { count } = await c.from("records").select("id", { count: "exact", head: true }).eq("org", org);
    if (!count) enqueue(allRecords());
    localSet("sync:seeded:" + org, true);
  }
  setSyncSink(enqueue);
  await loadMembers();
  sessionSig.value = { userId, at: Date.now() };
  memberChannel = c.channel("members:" + org).on("postgres_changes", { event: "*", schema: "public", table: "members", filter: `org=eq.${org}` }, () => loadMembers()).subscribe();
  listen(); push(); heartbeat();
  moveInlineFiles(); uploadPending();
}

/** One-time move of files saved inside records (older versions) out to Drive; the records keep only a reference. */
function moveInlineFiles() {
  if (photosSig.value.some((p) => p.data?.startsWith("data:"))) photosSig.value = photosSig.value.map((p) => (p.data?.startsWith("data:") ? { ...p, data: storeMedia(p.data, p.name) } : p));
  if (billsSig.value.some((b) => b.file?.startsWith("data:"))) billsSig.value = billsSig.value.map((b) => (b.file?.startsWith("data:") ? { ...b, file: storeMedia(b.file, b.vendor || "bill") } : b));
}
/** Drive file id on success, null when offline or failing (the caller retries later). */
export async function mediaUpload(body: { id: string; name: string; mime: string; data: string }): Promise<string | null> {
  const { data, error } = await (await client()).functions.invoke("drive-media", { body });
  return error || !(data as any)?.drive ? null : (data as any).drive;
}
export async function mediaDownload(driveId: string): Promise<Blob | null> {
  const { data: s } = await (await client()).auth.getSession(); if (!s.session) return null;
  const r = await fetch(`${URL_}/functions/v1/drive-media?drive=${encodeURIComponent(driveId)}`, { headers: { Authorization: "Bearer " + s.session.access_token, apikey: KEY! } }).catch(() => null);
  return r?.ok ? r.blob() : null;
}

export async function initSync() {
  if (!cloudEnabled) return;
  const c = await client();
  addEventListener("online", () => push());
  addEventListener("offline", () => (syncState.value = "offline"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  c.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { channel?.unsubscribe(); memberChannel?.unsubscribe(); setSyncSink(null); org = ""; cloudUser.value = null; sessionSig.value = null; syncState.value = "signed-out"; }
    else if (s?.user && !org && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) setTimeout(() => start(s.user.id));
    else if (ev === "INITIAL_SESSION" && !s) { sessionSig.value = null; syncState.value = "signed-out"; }
  });
}
export async function cloudSignIn(username: string, password: string) {
  const { error } = await (await client()).auth.signInWithPassword({ email: toEmail(username), password });
  return error ? (error.message.includes("Invalid") ? "Username or password is wrong" : error.message) : null;
}
/** Signing out also clears this device's copy, so a shared iPad never shows the previous person's data. */
export async function cloudSignOut() {
  await push().catch(() => {});
  await (await client()).auth.signOut();
  try { Object.keys(localStorage).filter((k) => k.startsWith("emerald:")).forEach((k) => localStorage.removeItem(k)); } catch {}
  location.reload();
}
/** Owner-only account actions, executed by the admin-users Edge Function. */
export async function adminUsers(body: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await (await client()).functions.invoke("admin-users", { body });
  if (error) { try { return (await (error as any).context.json()).error; } catch { return error.message; } }
  await loadMembers();
  return (data as any)?.error ?? null;
}
