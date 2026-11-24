/** Make a quotation's PDF and save it (the PDF library loads only when needed). */
import type { Quote } from "../../data";

export const pdfName = (q: Quote, customer: string) => `Quotation ${q.no} - ${customer}.pdf`.replace(/[\\/:*?"<>|]/g, "");
export async function quoteBlob(q: Quote): Promise<Blob> {
  const [{ quotePdf }, { fromQuote }] = await Promise.all([import("../work/quote-pdf"), import("../work/Doc")]);
  return quotePdf(fromQuote(q));
}
export function saveBlob(b: Blob, name: string) {
  const a = document.createElement("a"), u = URL.createObjectURL(b); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000);
}
/** Download a quotation as a PDF. */
export async function quotePdf(q: Quote, customer?: string) {
  saveBlob(await quoteBlob(q), pdfName(q, customer ?? q.customer));
}
