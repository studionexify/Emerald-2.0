/**
 * Cloud sync (Supabase). Local-first: the UI never waits on the network.
 * - Outgoing: changed records queue in an outbox and go up as one batched upsert.
 * - Incoming: one Realtime channel per business pushes other devices' edits in < 1 s.
 * - Reconnect: fetch only rows changed since the last sync. No polling anywhere.
 * Loaded lazily after first paint; does nothing when VITE_SUPABASE_URL is unset.
 */
import { signal } from "@preact/signals";
import type { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { allRecords, applyRemote, localGet, localSet, setSyncSink, type Change } from "./store";

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const cloudEnabled = !!(URL_ && KEY);
export type SyncState = "off" | "signed-out" | "synced" | "sending" | "offline" | "error";
export const syncState = signal<SyncState>(cloudEnabled ? "signed-out" : "off");
export const cloudUser = signal<{ email: string; org: string; role: string } | null>(null);

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
    const rows = batch.map((c) => ({ org, kind: c.kind, id: c.id, data: c.data ?? null, deleted: c.deleted }));
    const { error } = await (await client()).from("records").upsert(rows, { onConflict: "org,kind,id" });
    if (error) { syncState.value = navigator.onLine ? "error" : "offline"; return; }
    for (const c of batch) if (outbox.get(keyOf(c)) === c) outbox.delete(keyOf(c));
    localSet("sync:outbox", [...outbox]);
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

async function start(email: string) {
  const { data, error } = await (await client()).from("members").select("org,role").maybeSingle();
  if (error || !data) { syncState.value = "error"; return; }
  org = data.org; cloudUser.value = { email, org, role: data.role };
  const firstSync = await catchUp().catch(() => false);
  if (firstSync && localGet("sync:seeded:" + org, false) === false) {
    // A business with no cloud data yet takes this device's data as the starting point.
    const { count } = await sb!.from("records").select("id", { count: "exact", head: true }).eq("org", org);
    if (!count) enqueue(allRecords());
    localSet("sync:seeded:" + org, true);
  }
  setSyncSink(enqueue);
  listen(); push(); heartbeat();
}

export async function initSync() {
  if (!cloudEnabled) return;
  const c = await client();
  addEventListener("online", () => push());
  addEventListener("offline", () => (syncState.value = "offline"));
  document.addEventListener("visibilitychange", () => { if (document.hidden) push(); });
  c.auth.onAuthStateChange((ev, s) => {
    if (ev === "SIGNED_OUT") { channel?.unsubscribe(); setSyncSink(null); org = ""; cloudUser.value = null; syncState.value = "signed-out"; }
    else if (s?.user && !org && (ev === "SIGNED_IN" || ev === "INITIAL_SESSION")) start(s.user.email ?? "");
  });
}
export async function cloudSignIn(email: string, password: string) {
  const { error } = await (await client()).auth.signInWithPassword({ email, password });
  return error?.message ?? null;
}
export async function cloudSignOut() { await (await client()).auth.signOut(); }
