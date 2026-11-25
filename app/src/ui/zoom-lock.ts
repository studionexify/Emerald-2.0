/**
 * No zooming anywhere in the app, except on a document (quotation / invoice / PDF preview), which can be pinched to read.
 * Covers what the viewport tag cannot: iOS Safari ignores user-scalable=no, so pinch (gesture* and two-finger touches) and
 * double-tap are blocked here. Inside a document the guards step aside and the viewport is opened up while it is on screen.
 */
const DOC = ".doc-scroll, .doc-a4, [data-zoomable]";
const inDoc = (t: EventTarget | null) => t instanceof Element && !!t.closest(DOC);
const meta = () => document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
const LOCKED = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
const OPEN = "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes, viewport-fit=cover";

if (typeof document !== "undefined") {
  for (const ev of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(ev, (e) => { if (!inDoc(e.target)) e.preventDefault(); }, { passive: false } as AddEventListenerOptions);
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 && !inDoc(e.target)) e.preventDefault(); }, { passive: false });
  let last = 0;
  document.addEventListener("touchend", (e) => { const n = Date.now(); if (n - last < 320 && !inDoc(e.target) && !(e.target as Element)?.closest?.("input,textarea,select")) e.preventDefault(); last = n; }, { passive: false });
  /* a document on screen → pinch allowed; otherwise locked again */
  let open = false;
  const sync = () => { const want = !!document.querySelector(DOC); if (want !== open) { open = want; meta()?.setAttribute("content", want ? OPEN : LOCKED); } };
  new MutationObserver(sync).observe(document.body, { childList: true, subtree: true });
  sync();
}
export {};
