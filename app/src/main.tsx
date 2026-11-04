import { render } from "preact";
import { App } from "./app";
import "./styles.css";

render(<App />, document.getElementById("app")!);

if (import.meta.env.PROD && import.meta.env.MODE !== "artifact" && "serviceWorker" in navigator && location.protocol !== "file:")
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
