/** Identity & roles. Fixed studio accounts, no self sign-up. Phase 2 moves hashes and sessions to the server. */
import { computed } from "@preact/signals";
import { persisted } from "./store";

export type Role = "owner" | "manager" | "operator" | "accountant" | "ca";
export type Module = "dashboard" | "work" | "workshop" | "calculator" | "mauny" | "books" | "gst" | "todo" | "logs" | "bin" | "settings" | "alerts";
export type Level = "full" | "view" | "none";
export type User = { id: string; name: string; email: string; role: Role; pass: string; active: boolean };

export const MATRIX: Record<Role, Partial<Record<Module, Level>>> = {
  owner: { dashboard: "full", work: "full", workshop: "full", calculator: "full", mauny: "full", books: "full", gst: "full", todo: "full", logs: "full", bin: "full", settings: "full", alerts: "full" },
  manager: { dashboard: "full", work: "full", workshop: "full", calculator: "full", mauny: "view", books: "none", gst: "view", todo: "full", logs: "view", bin: "full", settings: "none", alerts: "full" },
  operator: { dashboard: "view", work: "full", workshop: "full", calculator: "view", mauny: "none", books: "none", gst: "none", todo: "full", logs: "none", bin: "full", settings: "none", alerts: "view" },
  accountant: { dashboard: "view", work: "view", workshop: "view", calculator: "view", mauny: "full", books: "full", gst: "full", todo: "full", logs: "view", bin: "full", settings: "none", alerts: "view" },
  ca: { gst: "full", bin: "none" },
};
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", operator: "Operator", accountant: "Accountant", ca: "CA (GST desk only)" };

const hash = (s: string) => { let h = 5381; for (const c of s) h = ((h << 5) + h + c.charCodeAt(0)) | 0; return "h" + (h >>> 0).toString(36); };
export const usersSig = persisted<User[]>("users", [
  { id: "u1", name: "Owner", email: "owner@studionexify.com", role: "owner", pass: hash("emerald"), active: true },
  { id: "u2", name: "Chintan", email: "chintan@studionexify.com", role: "manager", pass: hash("emerald"), active: true },
  { id: "u3", name: "Meet", email: "meet@studionexify.com", role: "operator", pass: hash("emerald"), active: true },
  { id: "u4", name: "CA desk", email: "ca@studionexify.com", role: "ca", pass: hash("emerald"), active: true },
]);
export const sessionSig = persisted<{ userId: string; at: number } | null>("session", null);
const attempts = persisted<{ n: number; until: number }>("loginAttempts", { n: 0, until: 0 });
export const me = computed(() => usersSig.value.find((u) => u.id === sessionSig.value?.userId && u.active) ?? null);

export function login(email: string, pass: string): string | null {
  if (Date.now() < attempts.value.until) return `Too many attempts — try again in ${Math.ceil((attempts.value.until - Date.now()) / 1000)} s`;
  const u = usersSig.value.find((x) => x.email.toLowerCase() === email.trim().toLowerCase() && x.active);
  if (!u || u.pass !== hash(pass)) { const n = attempts.value.n + 1; attempts.value = { n, until: n >= 5 ? Date.now() + 60000 : 0 }; return "Email or password is wrong"; }
  attempts.value = { n: 0, until: 0 }; sessionSig.value = { userId: u.id, at: Date.now() }; return null;
}
export const logout = () => (sessionSig.value = null);
export function changePassword(cur: string, next: string): string | null {
  const u = me.value; if (!u) return "Not signed in"; if (u.pass !== hash(cur)) return "Current password is wrong"; if (next.length < 8) return "Use at least 8 characters";
  usersSig.value = usersSig.value.map((x) => (x.id === u.id ? { ...x, pass: hash(next) } : x)); return null;
}
export const resetPassword = (id: string) => (usersSig.value = usersSig.value.map((x) => (x.id === id ? { ...x, pass: hash("emerald") } : x)));
export const saveUser = (u: User) => (usersSig.value = usersSig.value.some((x) => x.id === u.id) ? usersSig.value.map((x) => (x.id === u.id ? u : x)) : [...usersSig.value, { ...u, pass: hash("emerald") }]);

export const level = (m: Module): Level => (me.value ? MATRIX[me.value.role][m] ?? "none" : "none");
export const can = (m: Module, need: Level = "view") => { const l = level(m); return need === "view" ? l !== "none" : l === "full"; };
export const isExternal = () => me.value?.role === "ca";
export function moduleOf(path: string): Module {
  if (path === "/" || path === "/more") return "dashboard";
  if (path.startsWith("/mauny/books")) return "books";
  if (path.startsWith("/mauny/gst") || path.startsWith("/gst")) return "gst";
  const seg = path.split("/")[1]; return (["work", "workshop", "calculator", "mauny", "todo", "logs", "bin", "settings", "alerts"].includes(seg) ? seg : "dashboard") as Module;
}
