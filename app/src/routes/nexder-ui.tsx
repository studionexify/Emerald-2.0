/** Small pieces shared by the Nexder page and its lazy-loaded design view. */
import { useEffect, useRef, useState } from "preact/hooks";
import { Icon } from "../ui";
import { previewUrl } from "../data/nexder";

/** Object URL of one photo's small preview ("" until it arrives). */
export function usePreview(id?: string, ref?: { current: Element | null }): string {
  const [u, setU] = useState(""), [near, setNear] = useState(!ref);
  /* a card far below the fold fetches nothing until it is about to scroll into view */
  useEffect(() => {
    if (near || !ref?.current) return;
    if (typeof IntersectionObserver !== "function") { setNear(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setNear(true); io.disconnect(); } }, { rootMargin: "400px" });
    io.observe(ref.current); return () => io.disconnect();
  }, [near, id]);
  useEffect(() => { let live = true; setU(""); if (id && near) previewUrl(id).then((x) => live && setU(x)); return () => { live = false; }; }, [id, near]);
  return u;
}
export const mb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
export const kind = (name: string) => (/\.([A-Za-z0-9]{1,5})$/.exec(name)?.[1] ?? "file").toUpperCase();
export const g = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(2)} kg` : `${Math.round(n)} g`);
export const chipCls = "inline-flex items-center rounded-full px-2 h-5 text-[11px] font-semibold whitespace-nowrap";
export const Ph = () => <span class="w-full h-full flex items-center justify-center text-c2"><Icon name="image" size={22} /></span>;

/** A stored photo's small preview, or a placeholder. */
export function Pic({ id, alt, class: cls = "" }: { id?: string; alt: string; class?: string }) {
  const box = useRef<HTMLSpanElement>(null), src = usePreview(id, box);
  return <span ref={box} class="block w-full h-full">{src ? <img src={src} alt={alt} loading="lazy" decoding="async" class={`w-full h-full object-cover ${cls}`} /> : <Ph />}</span>;
}

export const mins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
