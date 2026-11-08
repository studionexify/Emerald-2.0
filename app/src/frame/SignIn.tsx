import { useState } from "preact/hooks";
import { cloudSignIn, syncState } from "../data/sync";

/** Accounts are created by the owner in Settings → Users; there is no sign-up. */
export function SignIn() {
  const [u, setU] = useState(""), [p, setP] = useState(""), [msg, setMsg] = useState(syncState.value === "error" ? "This account is disabled or not set up yet." : ""), [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault(); if (busy) return;
    setBusy(true); setMsg("");
    const err = await cloudSignIn(u, p);
    setBusy(false); if (err) setMsg(err);
  };
  const input = "w-full h-11 px-3 rounded-2xl bg-c1 text-c4 text-[15px] outline-none focus:ring-2 focus:ring-c2";
  return (
    <main class="min-h-dvh grid place-items-center bg-canvas px-4">
      <form onSubmit={submit} class="w-full max-w-[340px] grid gap-3">
        <h1 class="t-title text-center mb-2">Emerald</h1>
        <label class="grid gap-1"><span class="t-meta">Username</span><input class={input} autocomplete="username" autocapitalize="none" spellcheck={false} value={u} onInput={(e) => setU((e.target as HTMLInputElement).value)} required /></label>
        <label class="grid gap-1"><span class="t-meta">Password</span><input class={input} type="password" autocomplete="current-password" value={p} onInput={(e) => setP((e.target as HTMLInputElement).value)} required /></label>
        <button class="h-11 rounded-2xl bg-c4 text-c0 font-semibold text-[15px] disabled:opacity-50 mt-1" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
        <p class="t-meta text-center min-h-4" role="status">{msg}</p>
        <p class="t-meta text-center">Accounts are created by the owner.</p>
      </form>
    </main>
  );
}
