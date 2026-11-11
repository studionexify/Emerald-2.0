/** Paste an image (Ctrl/⌘+V) onto any photo upload spot under the cursor: the clipboard image goes into that spot's file picker. */
let x = -1, y = -1;
addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; }, { passive: true });

function target(): HTMLInputElement | null {
  const active = document.activeElement as HTMLElement | null;
  const start = (x >= 0 ? document.elementFromPoint(x, y) : null) ?? active;
  // Walk up a few levels from the spot under the cursor to the nearest single file picker (placeholder, "Upload"/"Change" link, drop box).
  for (let el = start as HTMLElement | null, n = 0; el && n < 4; el = el.parentElement, n++) {
    if (el instanceof HTMLInputElement && el.type === "file") return el;
    const ins = el.querySelectorAll<HTMLInputElement>('input[type="file"]');
    if (ins.length === 1) return ins[0];
    if (ins.length > 1) return null;
  }
  return null;
}

document.addEventListener("paste", (e) => {
  const files = [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return;
  const input = target();
  if (!input || input.disabled || (input.accept && !/image|\*/.test(input.accept))) return;
  e.preventDefault();
  const dt = new DataTransfer();
  const f = files[0];
  dt.items.add(new File([f], f.name && f.name !== "image.png" ? f.name : `pasted-${Date.now()}.${f.type.split("/")[1] || "png"}`, { type: f.type }));
  input.files = dt.files;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
