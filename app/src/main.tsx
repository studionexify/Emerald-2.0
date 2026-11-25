import { render } from "preact";
import { App } from "./app";
import "./styles.css";
import "./ui/paste";
import "./ui/inputs";

/* iOS home-screen app: 100% / innerHeight can come up short by the status-bar inset, leaving a dead band under the dock.
   Size the app to the whole screen there instead (the dock already pads for the home indicator). */
if ((navigator as { standalone?: boolean }).standalone) {
  const fit = () => {
    const long = Math.max(screen.width, screen.height), short = Math.min(screen.width, screen.height);
    const [w, h] = innerWidth > innerHeight ? [long, short] : [short, long];
    // only when the window fills the screen (not iPad split view), and never taller than the gap it fixes
    const full = Math.abs(innerWidth - w) < 2 && h - innerHeight < 80 ? h : innerHeight;
    document.documentElement.style.setProperty("--app-h", `${Math.max(innerHeight, full)}px`);
  };
  fit();
  addEventListener("resize", fit);
  addEventListener("orientationchange", () => setTimeout(fit, 300));
}
/* loaded right after first paint: keeps the entry chunk inside its size budget */
addEventListener("DOMContentLoaded", () => void import("./ui/zoom-lock"), { once: true });

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
