/** Number fields behave like a calculator display, everywhere in the app:
 *  - Tapping a field that already holds a number (a 0 or 1 default included) selects it, so the first key typed replaces it.
 *  - While you are typing, the app never rewrites what you typed. A field that must stay at least 1 no longer snaps
 *    back to "1" the moment you clear it (which left a stuck first digit: "1" + "5" = "15").
 *    Whatever the app wants to show is put in when you leave the field. */
const numeric = (el: EventTarget | null): el is HTMLInputElement =>
  el instanceof HTMLInputElement && (el.type === "number" || el.inputMode === "numeric" || el.inputMode === "decimal" || ((el.type === "text" || el.type === "tel") && /^-?[\d.,]+$/.test(el.value)));

const desc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
const editing = new WeakSet<HTMLInputElement>();
const held = new WeakMap<HTMLInputElement, string>();

if (desc?.get && desc.set) {
  const { get, set } = desc;
  Object.defineProperty(HTMLInputElement.prototype, "value", {
    configurable: true,
    enumerable: desc.enumerable,
    get() { return get.call(this); },
    set(v: unknown) {
      if (editing.has(this) && document.activeElement === this) { held.set(this, v == null ? "" : String(v)); return; }
      set.call(this, v);
    },
  });

  // Typing: from now until the field is left, the user's text is the truth. Runs before the app's own handler.
  document.addEventListener("input", (e) => { const el = e.target; if (numeric(el)) { editing.add(el); held.delete(el); } }, true);
  // Enter submits: let the app clear or reset the field straight away.
  document.addEventListener("keydown", (e) => { if (e.key === "Enter") { const el = e.target as HTMLInputElement; editing.delete(el); const v = held.get(el); held.delete(el); if (v !== undefined) set.call(el, v); } }, true);
  document.addEventListener("focusout", (e) => {
    const el = e.target as HTMLInputElement;
    if (!editing.has(el)) return;
    editing.delete(el);
    const v = held.get(el);
    held.delete(el);
    if (v !== undefined && v !== get.call(el)) set.call(el, v);
  }, true);
}

let justFocused: HTMLInputElement | null = null;
document.addEventListener("focusin", (e) => {
  const el = e.target;
  if (!numeric(el) || el.readOnly || el.disabled || el.value === "") return;
  justFocused = el;
  setTimeout(() => { try { if (document.activeElement === el) el.select(); } catch { /* some types refuse selection */ } }, 0);
});
// A mouse click's mouseup would put the caret back and undo the selection: keep it for that first click only.
document.addEventListener("mouseup", (e) => { if (justFocused && e.target === justFocused) e.preventDefault(); justFocused = null; }, true);
