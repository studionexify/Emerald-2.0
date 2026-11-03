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

export function lazy<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  let C: ComponentType<P> | null = null;
  let pending: Promise<void> | null = null;
  return function Lazy(props: P) {
    const [, set] = useState(0);
    if (C) return h(C, props);
    pending ??= load().then((m) => { C = m; });
    pending.then(() => set(1));
    return null;
  };
}
