import { h, type ComponentType } from "preact";
import { useState } from "preact/hooks";
import { signal } from "@preact/signals";

/** Hash routing with flat names (#work-orders) so it works on static hosts and in artifacts. */
const toHash = (p: string) => (p === "/" ? "home" : p.slice(1).replace(/^settings/, "account").replace(/\//g, "-"));
const fromHash = (raw: string) => {
  const s = raw.replace(/^#/, "");
  return !s || s === "home" ? "/" : "/" + s.replace(/^account/, "settings").replace(/-/g, "/");
};

export const path = signal(fromHash(location.hash));
addEventListener("hashchange", () => (path.value = fromHash(location.hash)));

export function navigate(p: string) {
  const clean = p.split("?")[0] || "/";
  path.value = clean;
  const hash = toHash(clean);
  if (location.hash.slice(1) !== hash) location.hash = hash;
}

document.addEventListener("click", (e) => {
  const a = (e.target as Element)?.closest?.("a[href^='/']");
  if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey) return;
  e.preventDefault();
  navigate(a.getAttribute("href")!);
});

export const useLocation = () => ({ path: path.value, route: navigate });

/** Retries a failed chunk load once; if it still fails (a new deploy removed the old file), reloads once to pick up the new build. */
function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  return load().catch(() => new Promise<T>((ok, bad) => setTimeout(() => load().then(ok, bad), 400))).catch((e) => {
    const k = "emerald:chunk-reload";
    let last = 0; try { last = +(sessionStorage.getItem(k) || 0); } catch {}
    if (Date.now() - last > 30000) { try { sessionStorage.setItem(k, String(Date.now())); } catch {} location.reload(); }
    throw e;
  });
}

export function lazy<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  let C: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  let failed = false;
  const start = () => (pending ??= loadChunk(load).then((m) => { C = m; }, () => { failed = true; pending = null; }));
  function Lazy(props: P) {
    const [, set] = useState(0);
    if (C) return h(C, props);
    if (failed) return h("div", { class: "p-6 text-center text-[13px] text-c3" }, "Couldn't load this page. ",
      h("button", { class: "underline font-semibold", onClick: () => { failed = false; set((n) => n + 1); } }, "Try again"));
    start().then(() => set((n) => n + 1));
    return h("div", { class: "p-6 animate-pulse", "aria-busy": "true" }, h("div", { class: "h-5 w-40 rounded bg-c1 mb-4" }), h("div", { class: "h-24 rounded bg-c1" }));
  }
  /** Start fetching the page's code early (finger down / hover on a link) so the tap itself is instant. */
  Lazy.preload = () => { if (!C && !failed) start(); };
  return Lazy;
}
