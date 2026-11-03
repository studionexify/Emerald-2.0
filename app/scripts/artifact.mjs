// Inline the artifact build into one HTML body (the Artifact host adds doctype/head/body).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const dir = "dist-artifact/assets";
const files = readdirSync(dir);
const js = files.filter((f) => f.endsWith(".js")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n").replace(/<\/script/gi, "<\\/script");
const css = files.filter((f) => f.endsWith(".css")).map((f) => readFileSync(`${dir}/${f}`, "utf8")).join("\n").replace(/<\/style/gi, "<\\/style");
const html = `<title>Emerald</title>
<style>${css}</style>
<div id="app"></div>
<script type="module">${js}</script>
`;
writeFileSync(process.argv[2] ?? "dist-artifact/emerald.html", html);
console.log("wrote", (html.length / 1024).toFixed(1), "KB from", files.join(", "));
