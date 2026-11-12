/** Direct PDF download of invoices: each page is drawn off-screen at true A4 size and saved as a PDF on the device. */
import { render } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import { DocSheet, type DocData } from "./Doc";

const A4_PX = 793.7; // 210 mm at 96 dpi

async function fontsReady() {
  const f = (document as any).fonts; if (!f) return;
  await Promise.all(["700 17px Montserrat", "400 12px Montserrat", "600 12px Montserrat", "400 19px Comfortaa", "600 28px 'Dancing Script'"].map((x) => f.load(x).catch(() => null)));
  await f.ready;
}

/** Save one PDF with one A4 page per copy label (undefined = no copy label). */
export async function downloadInvoicePdf(d: DocData, copies: (string | undefined)[], filename: string) {
  const [{ jsPDF }, h2c] = await Promise.all([import("jspdf"), import("html2canvas-pro")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0;width:210mm;background:#fff;z-index:-1";
  document.body.appendChild(host);
  try {
    render(<div>{copies.map((c, k) => <DocSheet key={k} d={d} copy={c} />)}</div>, host);
    await fontsReady();
    await Promise.all([...host.querySelectorAll("img")].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
    const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
    const pages = [...host.querySelectorAll<HTMLElement>(".doc-a4")];
    for (let i = 0; i < pages.length; i++) {
      const el = pages[i]; el.style.border = "0"; el.style.boxShadow = "none";
      const c = await h2c.default(el, { scale: 2.5, backgroundColor: "#ffffff", useCORS: true, logging: false });
      const h = Math.min(297, (210 * c.height) / c.width);
      if (i) pdf.addPage();
      pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, 210, h);
    }
    pdf.save(filename);
  } finally { render(null, host); host.remove(); }
}

/** Shows an A4 page shrunk to fit the available width (phones, tablets, dialogs) — never cropped. */
export function FitA4({ children }: { children: ComponentChildren }) {
  const box = useRef<HTMLDivElement>(null), inner = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1), [h, setH] = useState(0);
  useLayoutEffect(() => {
    const fit = () => { const w = box.current?.clientWidth ?? A4_PX; const s = Math.min(1, w / A4_PX); setK(s); setH((inner.current?.scrollHeight ?? 0) * s); };
    fit(); const ro = new ResizeObserver(fit); if (box.current) ro.observe(box.current); if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, []);
  return <div ref={box} class="w-full overflow-hidden" style={{ height: h || undefined }}>
    <div ref={inner} style={{ width: A4_PX, transform: `scale(${k})`, transformOrigin: "top left" }}>{children}</div>
  </div>;
}
