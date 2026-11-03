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
  const items = [...NAV, { href: "/settings", label: "Settings", icon: "settings" }];
  return (
    <aside class="hidden md:flex flex-col shrink-0 bg-c0 rounded-[var(--radius-card)] m-3 mr-0 p-2 xl:p-4 w-[76px] xl:w-60 sticky top-3 h-[calc(100vh-24px)]">
      <a href="/" class="flex items-center justify-center xl:justify-start gap-2 xl:px-3 py-2 mb-4 xl:mb-6" aria-label="Emerald home">
        <span class="w-9 h-9 rounded-lg bg-c4 text-c0 flex items-center justify-center font-bold">E</span>
        <span class="hidden xl:inline text-lg font-semibold tracking-tight">Emerald</span>
      </a>
      <nav class="flex flex-col gap-1 flex-1" aria-label="Main">
        {items.map((n) => {
          const on = isActive(path, n.href);
          return (
            <a key={n.href} href={n.href} aria-current={on ? "page" : undefined} title={n.label}
              class={`flex flex-col xl:flex-row items-center gap-1 xl:gap-3 py-2 xl:py-0 xl:h-10 xl:px-3 rounded-2xl xl:rounded-full text-[10px] leading-tight xl:text-sm text-center ${n.href === "/settings" ? "mt-auto" : ""} ${on ? "bg-c4 text-c0" : "text-c3 hover:bg-c1 hover:text-c4"}`}>
              <Icon name={n.icon} size={20} />
              <span class="xl:hidden">{n.label.split(" ")[0]}</span>
              <span class="hidden xl:inline">{n.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

function TopBar() {
  const [bell, setBell] = useState(false);
  const alerts = db.orders.filter((o) => o.blocked);
  return (
    <header class="flex items-center gap-2 md:gap-3 mb-4">
      <a href="/" class="md:hidden shrink-0 w-9 h-9 rounded-lg bg-c4 text-c0 flex items-center justify-center font-bold">E</a>
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
            <div class="absolute right-0 top-13 z-30 w-[min(20rem,calc(100vw-2rem))] bg-c0 rounded-2xl p-4 border border-c1">
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
  const items = [NAV[0], NAV[1], NAV[4], NAV[5], { href: "/more", label: "More", icon: "grid" }];
  return (
    <nav class="md:hidden fixed bottom-3 left-4 right-4 z-20 bg-c0 rounded-full h-16 flex items-center justify-around px-2 border border-c1" aria-label="Main">
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
    <div class="flex min-h-full max-w-[1920px] mx-auto">
      <Sidebar />
      <main class="flex-1 min-w-0 px-4 pt-4 md:p-5 xl:p-6 pb-24 md:pb-6">
        <TopBar />
        {children}
      </main>
      <MobileNav />
    </div>
  );
}
