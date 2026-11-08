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
