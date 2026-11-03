import { useState } from "preact/hooks";
import { Button, Field, inputCls } from "../ui";
import { login } from "../data";

export default function Login() {
  const [email, setEmail] = useState("owner@studionexify.com");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div class="h-full overflow-y-auto bg-c1 flex items-center justify-center p-4">
      <form class="w-full max-w-sm bg-c0 rounded-[var(--radius-card)] p-5 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); setErr(login(email, pass) ?? ""); }}>
        <div class="flex items-center gap-2 mb-1"><span class="w-9 h-9 rounded-xl bg-c4 text-c0 flex items-center justify-center font-bold">E</span><b class="text-lg">Emerald</b></div>
        <Field label="Email"><input class={inputCls} type="email" autoComplete="username" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></Field>
        <Field label="Password"><input class={inputCls} type="password" autoComplete="current-password" value={pass} onInput={(e) => setPass((e.target as HTMLInputElement).value)} /></Field>
        {err && <p class="text-sm font-semibold" role="alert">{err}</p>}
        <Button>Sign in</Button>
        <button type="button" class="text-xs underline text-c3 cursor-pointer" onClick={() => setSent(true)}>Forgot password</button>
        {sent && <p class="text-xs text-c3">A reset link goes to the studio mailbox only (never an address typed here). Email sending connects with the backend.</p>}
        <p class="text-[11px] text-c3 border-t border-c1 pt-2">Prototype accounts — password <b>emerald</b>: owner@, chintan@ (manager), meet@ (operator), ca@ (GST desk only) · @studionexify.com</p>
      </form>
    </div>
  );
}
