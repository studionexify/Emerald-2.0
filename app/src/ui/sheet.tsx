/** Bottom sheets (phone): swipe-to-dismiss panel anchored to the bottom, lifted above the on-screen keyboard. */
import type { ComponentChildren } from "preact";
import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "./icon";

/** True below 768px. Shared by every adaptive component so layout and sheet logic never disagree. */
const mq = typeof matchMedia === "function" ? matchMedia("(max-width: 767.98px)") : null;
export const isPhone = signal(!!mq?.matches);
mq?.addEventListener("change", (e) => (isPhone.value = e.matches));

/** Pixels the virtual keyboard covers at the bottom of the layout viewport. */
const kb = signal(0);
const vv = typeof window !== "undefined" ? window.visualViewport : null;
const syncKb = () => { if (vv) kb.value = Math.max(0, Math.round(innerHeight - vv.height - vv.offsetTop)); };
vv?.addEventListener("resize", syncKb);
vv?.addEventListener("scroll", syncKb);

const FOCUSABLE = "a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex='-1'])";

export function Sheet({ open = true, onClose, title, children, footer, full, wide }: {
  /** Wide, fixed-height dialog on desktop (settings). */ wide?: boolean;
  open?: boolean; onClose: () => void; title?: ComponentChildren; children: ComponentChildren;
  /** Sticky footer (submit row) kept above the keyboard / safe area. */ footer?: ComponentChildren;
  /** Full-height sheet (record detail) instead of content-height. */ full?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [dy, setDy] = useState(0);
  const drag = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const p = panel.current!;
    (p.querySelector<HTMLElement>("[autofocus]") ?? p).focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      if (e.key !== "Tab") return;
      const f = [...p.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!f.length) return;
      const [a, z] = [f[0], f[f.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); prev?.focus?.({ preventScroll: true }); };
  }, [open]);

  if (!open) return null;

  /* Drag from the handle/header always; from the body only when it is scrolled to the top. */
  const down = (e: PointerEvent) => {
    const body = (e.target as Element).closest("[data-sheet-body]") as HTMLElement | null;
    if (body && body.scrollTop > 0) return;
    if ((e.target as Element).closest("input,select,textarea,button,a")) return;
    drag.current = { y: e.clientY, t: performance.now() };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => { if (drag.current) setDy(Math.max(0, e.clientY - drag.current.y)); };
  const up = (e: PointerEvent) => {
    if (!drag.current) return;
    const v = (e.clientY - drag.current.y) / Math.max(1, performance.now() - drag.current.t);
    drag.current = null;
    if (dy > 120 || v > 0.6) onClose();
    setDy(0);
  };

  return (
    <div class={`fixed inset-0 z-50 flex flex-col justify-end ${wide ? "md:justify-center" : ""}`} style={{ paddingBottom: kb.value }}>
      <div class="absolute inset-0 bg-black/40 sheet-fade" onClick={onClose} aria-hidden="true" />
      <div ref={panel} role="dialog" aria-modal="true" tabIndex={-1} aria-label={typeof title === "string" ? title : undefined}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        class={`relative sheet-up outline-none bg-c0 rounded-t-2xl shadow-2xl flex flex-col min-h-0 md:w-full ${wide ? "md:max-w-3xl md:h-[min(680px,84dvh)] h-[88dvh]" : "md:max-w-lg"} md:mx-auto ${wide ? "" : "md:mb-[8vh]"} md:rounded-2xl pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] ${full ? "h-[92dvh]" : wide ? "" : "max-h-[92dvh]"}`}
        style={{ transform: dy ? `translateY(${dy}px)` : undefined, transition: dy ? "none" : undefined, touchAction: "pan-y" }}>
        <div class="shrink-0 pt-2 pb-1 flex justify-center cursor-grab" aria-hidden="true"><span class="w-9 h-1.5 rounded-full bg-c1" /></div>
        {title && (
          <div class="shrink-0 flex items-center gap-2 px-4 pb-2">
            <h2 class="flex-1 min-w-0 text-[17px] font-semibold tracking-tight truncate">{title}</h2>
            <button onClick={onClose} aria-label="Close" class="w-11 h-11 -mr-2 rounded-full flex items-center justify-center cursor-pointer"><span class="w-7 h-7 rounded-full bg-c1 flex items-center justify-center"><Icon name="close" size={14} /></span></button>
          </div>
        )}
        <div data-sheet-body class="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer && <div class="shrink-0 border-t border-line px-4 pt-2 flex gap-2 [&>*]:flex-1 [&_button]:h-12" style={{ paddingBottom: kb.value ? 8 : "max(8px, env(safe-area-inset-bottom))" }}>{footer}</div>}
        {!footer && <div class="shrink-0 h-[env(safe-area-inset-bottom)]" />}
      </div>
    </div>
  );
}

/* ── Confirmation: promise-based replacement for window.confirm. Sheet on phone, centred card on larger screens. ── */
type Ask = { msg: string; ok: string; danger?: boolean; done: (v: boolean) => void };
const asking = signal<Ask | null>(null);
export function ask(msg: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((done) => (asking.value = { msg, ok: opts.ok ?? "Confirm", danger: opts.danger, done }));
}
const settle = (v: boolean) => { asking.value?.done(v); asking.value = null; };

export function AskHost() {
  const a = asking.value;
  if (!a) return null;
  const btns = (
    <>
      <button onClick={() => settle(false)} class="h-12 md:h-9 px-4 rounded-lg border border-line bg-c0 text-c4 text-[15px] md:text-[13px] font-semibold cursor-pointer">Cancel</button>
      <button autofocus onClick={() => settle(true)} class="h-12 md:h-9 px-4 rounded-lg bg-c4 text-c0 text-[15px] md:text-[13px] font-semibold cursor-pointer">{a.ok}</button>
    </>
  );
  if (isPhone.value) return <Sheet onClose={() => settle(false)} footer={btns}><p class="text-[15px] leading-snug pt-2 pb-2">{a.msg}</p></Sheet>;
  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4" onKeyDown={(e) => e.key === "Escape" && settle(false)}>
      <div class="absolute inset-0 bg-black/30 sheet-fade" onClick={() => settle(false)} aria-hidden="true" />
      <div role="alertdialog" aria-modal="true" class="relative w-full max-w-sm bg-c0 rounded-2xl shadow-2xl p-5 flex flex-col gap-4">
        <p class="text-[14px] leading-snug">{a.msg}</p>
        <div class="flex justify-end gap-2">{btns}</div>
      </div>
    </div>
  );
}

/* ── Filter & Sort: phone collapses a toolbar into one trigger that opens a sheet. ── */
export function FilterSheet({ children, label = "Filter & sort" }: { children: ComponentChildren; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} class="h-11 w-full px-3 rounded-lg border border-line bg-c0 text-c4 text-[14px] font-semibold inline-flex items-center justify-center gap-2 cursor-pointer">
        <Icon name="rows" size={15} /> {label}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label} footer={<button onClick={() => setOpen(false)} class="rounded-lg bg-c4 text-c0 text-[15px] font-semibold cursor-pointer">Done</button>}>
        <div class="flex flex-col items-stretch gap-3 pt-1 [&_select]:w-full [&_label]:w-full [&_label]:block">{children}</div>
      </Sheet>
    </>
  );
}

