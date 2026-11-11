import { render } from "preact";
import { App } from "./app";
import "./styles.css";
import "./ui/paste";

if (import.meta.env.MODE === "artifact") await import("./data/demo");

render(<App />, document.getElementById("app")!);

if (import.meta.env.PROD && import.meta.env.MODE !== "artifact" && "serviceWorker" in navigator && location.protocol !== "file:")
{
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  // A new build is ready: swap to it the next time the app is in the background, so nobody sees a jump.
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data !== "emerald:update") return;
    // Only after a minute in the background, so a quick switch to the camera or WhatsApp never loses a half-filled form.
    let t = 0;
    const go = () => { clearTimeout(t); if (document.hidden) t = setTimeout(() => document.hidden && location.reload(), 60000) as any; };
    document.addEventListener("visibilitychange", go);
  });
}

/* Cloud sync loads after first paint and only when configured. */
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.MODE !== "artifact")
  addEventListener("load", () => import("./data/sync").then((m) => m.initSync()), { once: true });
