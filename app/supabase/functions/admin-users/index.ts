// Owner-only account management. The service-role key never leaves Supabase.
import { createClient } from "npm:@supabase/supabase-js@2";

const DOMAIN = "emerald.app";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const ROLES = ["owner", "manager", "operator", "accountant", "ca"];
const USER_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
  const { data: who } = await admin.auth.getUser(token);
  if (!who?.user) return json({ error: "Not signed in" }, 401);
  const { data: me } = await admin.from("members").select("org,role,active").eq("user_id", who.user.id).maybeSingle();
  if (!me || me.role !== "owner" || !me.active) return json({ error: "Only the owner can manage accounts" }, 403);

  const b = await req.json().catch(() => ({}));
  const target = async (id: string) => (await admin.from("members").select("user_id,org").eq("user_id", id).eq("org", me.org).maybeSingle()).data;
  switch (b.action) {
    case "create": {
      const username = String(b.username ?? "").trim().toLowerCase();
      if (!USER_RE.test(username)) return json({ error: "Username: 3–32 letters, digits, . _ -" }, 400);
      if (String(b.password ?? "").length < 8) return json({ error: "Password needs 8+ characters" }, 400);
      if (!ROLES.includes(b.role)) return json({ error: "Unknown role" }, 400);
      const { data, error } = await admin.auth.admin.createUser({ email: `${username}@${DOMAIN}`, password: b.password, email_confirm: true });
      if (error) return json({ error: error.message.includes("already") ? "That username is taken" : error.message }, 400);
      const { error: e2 } = await admin.from("members").insert({ user_id: data.user.id, org: me.org, role: b.role, username, name: String(b.name ?? username) });
      if (e2) { await admin.auth.admin.deleteUser(data.user.id); return json({ error: e2.message }, 400); }
      return json({ ok: true, user_id: data.user.id });
    }
    case "reset_password": {
      if (!(await target(b.user_id))) return json({ error: "No such account" }, 404);
      if (String(b.password ?? "").length < 8) return json({ error: "Password needs 8+ characters" }, 400);
      const { error } = await admin.auth.admin.updateUserById(b.user_id, { password: b.password });
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    case "update": {
      if (!(await target(b.user_id))) return json({ error: "No such account" }, 404);
      if (b.user_id === who.user.id && (b.role !== "owner" || b.active === false)) return json({ error: "You can't demote or disable yourself" }, 400);
      if (b.role && !ROLES.includes(b.role)) return json({ error: "Unknown role" }, 400);
      const patch: Record<string, unknown> = {};
      if (b.role) patch.role = b.role;
      if (typeof b.name === "string") patch.name = b.name;
      if (typeof b.active === "boolean") {
        patch.active = b.active;
        await admin.auth.admin.updateUserById(b.user_id, { ban_duration: b.active ? "none" : "876000h" });
      }
      const { error } = await admin.from("members").update(patch).eq("user_id", b.user_id);
      return error ? json({ error: error.message }, 400) : json({ ok: true });
    }
    default: return json({ error: "Unknown action" }, 400);
  }
});
