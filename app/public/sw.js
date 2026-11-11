/* Emerald offline shell.
 * - Page: served from cache instantly, refreshed in the background (next open gets the new build).
 * - Hashed assets: cache-first, but only real JS/CSS/etc. are cached — never the HTML that Cloudflare's
 *   SPA fallback returns for a missing old chunk (caching that froze pages until a hard refresh).
 * - Old builds' assets are trimmed so the cache never grows without bound. */
const C = "emerald-v2";
const MAX_ASSETS = 120;
self.addEventListener("install", (e) => { e.waitUntil(caches.open(C).then((c) => c.addAll(["./", "./manifest.webmanifest"])).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
const isHtml = (res) => (res.headers.get("content-type") || "").includes("text/html");
async function trim(c) {
  const ks = (await c.keys()).filter((r) => r.url.includes("/assets/"));
  for (let i = 0; i < ks.length - MAX_ASSETS; i++) await c.delete(ks[i]);
}
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.includes("/assets/")) {
    e.respondWith(caches.match(r).then((hit) => {
      if (hit && !isHtml(hit)) return hit;
      return fetch(r).then((res) => {
        if (!res.ok || isHtml(res)) return new Response("", { status: 404 }); // missing chunk: let the app retry/reload
        const cp = res.clone();
        e.waitUntil(caches.open(C).then((c) => c.put(r, cp).then(() => trim(c))));
        return res;
      });
    }));
  } else if (r.mode === "navigate") {
    const net = fetch(r).then(async (res) => {
      if (res.ok && isHtml(res)) {
        const c = await caches.open(C), old = await c.match("./"), fresh = await res.clone().text();
        await c.put("./", res.clone());
        // New build deployed: tell open tabs so they switch over quietly (when hidden or on next tap).
        if (old && (await old.text()) !== fresh) (await self.clients.matchAll()).forEach((w) => w.postMessage("emerald:update"));
      }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match("./").then((hit) => hit || net).catch(() => net));
  }
});
