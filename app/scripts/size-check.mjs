// Fails the build when the gzipped entry or any page chunk outgrows its budget.
import { readdirSync, readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
const dir = "dist/assets", KB = 1024; let bad = 0;
for (const f of readdirSync(dir)) {
  const gz = gzipSync(readFileSync(`${dir}/${f}`), { level: 9 }).length;
  // The entry is ~36.6 KB gz when the Supabase env vars are set (Cloudflare build), ~34.3 KB without; 38 KB leaves headroom.
  // supabase-js ("dist-*") loads only after first paint, and only when cloud sync is configured.
  // PDF libraries load only when someone downloads an invoice PDF.
  const pdf = /^(jspdf|html2canvas|purify|index\.es)/.test(f);
  const cap = pdf ? 160 * KB : f.startsWith("index-") ? 38 * KB : f.startsWith("dist-") ? 60 * KB : 17 * KB;
  if (gz > cap) { console.error(`✗ ${f} ${(gz / KB).toFixed(1)} KB gz > ${cap / KB} KB`); bad++; }
}
console.log(bad ? "size-check failed" : "size-check ok"); process.exit(bad ? 1 : 0);
