import { render } from "preact";
import { App } from "./app";
import "./styles.css";

if (import.meta.env.MODE === "artifact") await import("./data/demo");

render(<App />, document.getElementById("app")!);

if (import.meta.env.PROD && import.meta.env.MODE !== "artifact" && "serviceWorker" in navigator && location.protocol !== "file:")
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));

/* Cloud sync loads after first paint and only when configured. */
if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.MODE !== "artifact")
  addEventListener("load", () => import("./data/sync").then((m) => m.initSync()), { once: true });
