import type { ComponentChildren } from "preact";
import { useState } from "preact/hooks";
import { useLocation } from "preact-iso";
import { NAV } from "../nav";
import { Icon } from "../ui";
import { db } from "../data";
import { theme, toggleTheme } from "./theme";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

function Sidebar() {
  const { path } = useLocation();
  return (
    <aside class="hidden lg:flex flex-col w-60 shrink-0 bg-c0 rounded-[var(--radius-card)] p-4 m-4 mr-0">
      <a href="/" class="flex items-center gap-2 px-3 py-2 mb-6">
        <span class="w-8 h-8 rounded-lg bg-c4 text-c0 flex items-center justify-center font-bold">E</span>
        <span class="text-lg font-semibold tracking-tight">Emerald</span>
      </a>
      <nav class="flex flex-col gap-1" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.href} href={n.href} aria-current={isActive(path, n.href) ? "page" : undefined}
            class={`flex items-center gap-3 h-10 px-3 rounded-full text-sm ${isActive(path, n.href) ? "bg-c4 text-c0" : "text-c3 hover:bg-c1 hover:text-c4"}`}>
            <Icon name={n.icon} size={18} />
            {n.label}
          </a>
        ))}
      </nav>
      <div class="mt-auto flex flex-col gap-1">
        <a href="/settings" class={`flex items-center gap-3 h-10 px-3 rounded-full text-sm ${isActive(path, "/settings") ? "bg-c4 text-c0" : "text-c3 hover:bg-c1"}`}>
          <Icon name="settings" size={18} /> Settings
        </a>
      </div>
    </aside>
  );
}

function TopBar() {
  const [bell, setBell] = useState(false);
  const alerts = db.orders.filter((o) => o.blocked);
  return (
    <header class="flex items-center gap-2 md:gap-3 mb-5">
      <a href="/" class="lg:hidden w-9 h-9 rounded-lg bg-c4 text-c0 flex items-center justify-center font-bold">E</a>
      <label class="flex-1 min-w-0 max-w-md h-11 bg-c0 rounded-full flex items-center gap-2 px-4 text-c3">
        <Icon name="search" size={18} />
        <input class="flex-1 bg-transparent outline-none text-c4 placeholder:text-c2 text-sm min-w-0" placeholder="Search orders, clients, bills…" aria-label="Search" />
      </label>
      <div class="ml-auto flex items-center gap-2">
        <a href="/work/orders?new=1" class="h-11 px-5 rounded-full bg-c4 text-c0 hidden sm:inline-flex items-center gap-2 text-sm font-medium">
          <Icon name="plus" size={16} /> Create
        </a>
        <button onClick={toggleTheme} aria-label="Toggle theme" class="w-11 h-11 shrink-0 rounded-full bg-c0 hidden sm:flex items-center justify-center cursor-pointer">
          <Icon name={theme.value === "dark" ? "sun" : "moon"} />
        </button>
        <div class="relative">
          <button onClick={() => setBell(!bell)} aria-label={`Alerts (${alerts.length})`} class="w-11 h-11 rounded-full bg-c0 flex items-center justify-center cursor-pointer relative">
            <Icon name="bell" />
            {alerts.length > 0 && <span class="absolute top-2 right-2.5 w-2.5 h-2.5 rounded-full bg-c4 border-2 border-c0" />}
          </button>
          {bell && (
            <div class="absolute right-0 top-13 z-30 w-80 bg-c0 rounded-2xl p-4 border border-c1">
              <div class="font-semibold mb-2">Needs attention</div>
              {alerts.map((o) => (
                <a key={o.id} href="/work/orders" class="block py-2 border-t border-c1 text-sm">
                  <div class="font-medium">{o.no} · {o.customer}</div>
                  <div class="text-c3">{o.blocked}</div>
                </a>
              ))}
            </div>
          )}
        </div>
        <a href="/settings" aria-label="Settings" class="w-11 h-11 rounded-full bg-c4 text-c0 flex items-center justify-center font-semibold">Y</a>
      </div>
    </header>
  );
}

function MobileNav() {
  const { path } = useLocation();
  const items = [...NAV.slice(0, 4), { href: "/more", label: "More", icon: "grid" }];
  return (
    <nav class="lg:hidden fixed bottom-3 left-4 right-4 z-20 bg-c0 rounded-full h-16 flex items-center justify-around px-2 border border-c1" aria-label="Main">
      {items.map((n) => (
        <a key={n.href} href={n.href} aria-label={n.label} aria-current={isActive(path, n.href) ? "page" : undefined}
          class={`flex flex-col items-center justify-center w-14 h-12 rounded-full text-[10px] gap-0.5 ${isActive(path, n.href) ? "bg-c4 text-c0" : "text-c3"}`}>
          <Icon name={n.icon} size={18} />
          {n.label.split(" ")[0]}
        </a>
      ))}
    </nav>
  );
}

export function Frame({ children }: { children: ComponentChildren }) {
  return (
    <div class="flex min-h-full">
      <Sidebar />
      <main class="flex-1 min-w-0 p-4 md:p-6 pb-24 lg:pb-6">
        <TopBar />
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
