import { useEffect, useState } from "preact/hooks";
import { mediaMime, useMedia } from "../data";
/** An image stored inline or in Drive. Shows a soft placeholder while it loads. */
export function MediaImg({ v, alt, class: cls }: { v?: string; alt: string; class?: string }) {
  const src = useMedia(v);
  return src ? <img src={src} alt={alt} class={cls} loading="lazy" /> : <div class={(cls ?? "") + " bg-c1"} aria-label={alt} />;
}
/** Any stored file: images preview, other files (PDF) open in a new tab. */
export function MediaFile({ v, alt, class: cls, fallback }: { v?: string; alt: string; class?: string; fallback: preact.ComponentChildren }) {
  const src = useMedia(v);
  if (!v) return <>{fallback}</>;
  if (mediaMime(v).startsWith("image/")) return src ? <img src={src} alt={alt} class={cls} /> : <span class="text-xs text-c3">Loading…</span>;
  return src ? <a href={src} target="_blank" rel="noopener" class="text-xs underline">Open file</a> : <span class="text-xs text-c3">Loading…</span>;
}

/** Full-screen viewer for an internal reference image. Esc or tap to close. */
export function Lightbox({ v, alt, onClose }: { v: string; alt: string; onClose: () => void }) {
  const src = useMedia(v);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose()); addEventListener("keydown", k, true); return () => removeEventListener("keydown", k, true); }, []);
  return <div class="fixed inset-0 z-[80] bg-black/90 grid place-items-center p-4 cursor-zoom-out sheet-fade" onClick={onClose} role="dialog" aria-label={alt}>
    {src ? <img src={src} alt={alt} class="max-w-full max-h-full object-contain rounded-lg" /> : <span class="text-white/70 text-sm">Loading…</span>}
    <span class="absolute top-3 right-4 text-white/80 text-[13px]">{alt} · Esc to close</span>
  </div>;
}
/** Small thumbnail; opens the reduced image full screen. */
export function Thumb({ thumb, full, alt, class: cls = "w-11 h-11", onAdd }: { thumb?: string; full?: string; alt: string; class?: string; /** placeholder: pick a file */ onAdd?: (f: File) => void }) {
  const [open, setOpen] = useState(false);
  if (!thumb && !full) return <label onClick={(e) => e.stopPropagation()} title={onAdd ? "Add photo — click, or hover and press Ctrl+V to paste" : "No photo yet"} class={`${cls} shrink-0 rounded-lg border border-dashed border-c3/60 bg-c1/60 grid place-items-center text-c3 ${onAdd ? "cursor-pointer hover:border-c4 hover:text-c4" : ""}`}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2.5" /><circle cx="9" cy="10" r="1.6" /><path d="m21 16-5-5-9 9" /></svg>
    {onAdd && <input type="file" accept="image/*" class="sr-only" onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) onAdd(f); }} />}
  </label>;
  return <>
    <button type="button" class={`${cls} shrink-0 rounded-lg overflow-hidden bg-c1 border border-line cursor-zoom-in !min-h-0 p-0`} onClick={(e) => { e.stopPropagation(); setOpen(true); }} aria-label={`View ${alt}`}><MediaImg v={thumb || full} alt={alt} class="w-full h-full object-cover" /></button>
    {open && <Lightbox v={full || thumb!} alt={alt} onClose={() => setOpen(false)} />}
  </>;
}
