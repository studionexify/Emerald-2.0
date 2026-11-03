import type { ComponentChildren } from "preact";
import { signal } from "@preact/signals";
import { useLocation } from "../router";
import { NAV } from "../nav";
import { Icon } from "../ui";
import { searchQ } from "../data/search";
import { attention, batchesSig, can, isExternal, logout, me, moduleOf, ordersSig, packSig, spoolsSig } from "../data";
import { theme, toggleTheme } from "./theme";

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/* Sidebar collapse: remembered per device; default open on wide screens, collapsed on iPad. */
const readCollapsed = () => {
  try { const v = localStorage.getItem("nav-collapsed"); if (v !== null) return v === "1"; } catch {}
  return innerWidth < 1280;
};
const collapsed = signal(readCollapsed());
const toggleNav = () => {
  collapsed.value = !collapsed.value;
  try { localStorage.setItem("nav-collapsed", collapsed.value ? "1" : "0"); } catch {}
};

addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); (document.getElementById("global-search") as HTMLInputElement | null)?.focus(); } });
const ALL = [...NAV, { href: "/settings", label: "Settings", icon: "settings" }];

function Sidebar() {
  const { path } = useLocation();
  const c = collapsed.value;
  return (
    <aside aria-label="Main navigation"
      class={`hidden md:flex flex-col shrink-0 min-h-0 bg-c0 border-r border-c1 ${c ? "w-[76px]" : "w-60 2xl:w-64"}`}>
      <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col gap-1 p-2.5">
        {ALL.filter((n) => (isExternal() ? n.href === "/settings" : can(moduleOf(n.href)))).concat(isExternal() ? [{ href: "/mauny/gst", label: "GST desk", icon: "money" }] : []).map((n) => {
          const on = isActive(path, n.href);
          return (
            <a key={n.href} href={n.href} aria-current={on ? "page" : undefined} title={n.label}
              class={`flex items-center rounded-xl ${n.href === "/settings" ? "mt-auto" : ""} ${c ? "flex-col justify-center gap-1 py-2 text-[10px] leading-tight text-center" : "gap-3 h-10 px-3 text-sm"} ${on ? "bg-c4 text-c0" : "text-c3 hover:bg-c1 hover:text-c4"}`}>
              <Icon name={n.icon} size={c ? 20 : 18} />
              <span class="min-w-0">{c ? n.label.split(" ")[0] : n.label}</span>
            </a>
          );
        })}
      </nav>
    </aside>
  );
}

/** Bell: a link to the Attention page (inline, never a popup). Badge counts urgent items only. */
function Bell() {
  const n = Object.values(attention(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value)).flat().filter((a) => a.t === "danger").length;
  return (
    <a href="/alerts" aria-label={`Attention (${n} urgent)`} class="w-9 h-9 md:w-10 md:h-10 rounded-full bg-c1 flex items-center justify-center relative shrink-0">
      <Icon name="bell" size={18} />
      {n > 0 && <span class="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-c4 text-c0 text-[10px] leading-4 text-center num">{n}</span>}
    </a>
  );
}

/** Fixed top bar: menu toggle + brand on the left, search in the middle, actions on the right. */
function TopBar() {
  const { path, route } = useLocation();
  return (
    <header class="shrink-0 h-13 md:h-14 xl:h-16 flex items-center gap-2 md:gap-3 px-3 md:px-4 bg-c0 border-b border-c1">
      <button onClick={toggleNav} aria-label={collapsed.value ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed.value}
        class="hidden md:flex w-10 h-10 rounded-xl hover:bg-c1 items-center justify-center cursor-pointer shrink-0">
        <Icon name="menu" />
      </button>
      <a href="/" class="flex items-center gap-2 shrink-0 md:w-[120px] 2xl:w-[180px]">
        <span class="w-9 h-9 rounded-lg bg-c4 text-c0 flex items-center justify-center font-bold">E</span>
        <span class="hidden md:inline text-lg font-semibold tracking-tight">Emerald</span>
      </a>
      <label class="flex-1 min-w-0 max-w-xl h-10 bg-c1 rounded-full flex items-center gap-2 px-4 text-c3">
        <Icon name="search" size={18} />
        <input id="global-search" value={searchQ.value} onInput={(e) => { searchQ.value = (e.target as HTMLInputElement).value; if (path !== "/search") route("/search"); }} class="flex-1 bg-transparent outline-none text-c4 placeholder:text-c2 text-sm min-w-0" placeholder="Search  ⌘K" aria-label="Search" />
      </label>
      <div class="ml-auto flex items-center gap-2 shrink-0">
        <a href="/work/orders" class="h-10 px-4 rounded-full bg-c4 text-c0 hidden md:inline-flex items-center gap-2 text-sm font-medium">
          <Icon name="plus" size={16} /> Create
        </a>
        <button onClick={toggleTheme} aria-label="Toggle theme" class="w-10 h-10 shrink-0 rounded-full bg-c1 hidden md:flex items-center justify-center cursor-pointer">
          <Icon name={theme.value === "dark" ? "sun" : "moon"} size={18} />
        </button>
        <Bell />
        <a href="/settings" aria-label={`Settings — ${me.value?.name}`} title={me.value?.name} class="w-9 h-9 md:w-10 md:h-10 rounded-full bg-c4 text-c0 flex items-center justify-center font-semibold shrink-0">{me.value?.name[0]}</a>
        <button onClick={logout} aria-label="Sign out" title="Sign out" class="hidden md:flex w-10 h-10 rounded-full bg-c1 items-center justify-center cursor-pointer text-xs">⎋</button>
      </div>
    </header>
  );
}

/** Phone bottom bar: in the layout flow, so it never covers content. */
function BottomBar() {
  const { path } = useLocation();
  const items = isExternal() ? [{ href: "/mauny/gst", label: "GST desk", icon: "money" }, { href: "/settings", label: "Settings", icon: "settings" }] : [NAV[0], NAV[1], NAV[4], NAV[6], { href: "/more", label: "More", icon: "grid" }];
  const moreOn = !items.slice(0, 4).some((n) => isActive(path, n.href));
  return (
    <nav class={`md:hidden shrink-0 bg-c0 border-t border-c1 grid ${isExternal() ? "grid-cols-2" : "grid-cols-5"} px-2 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]`} aria-label="Main">
      {items.map((n) => {
        const on = n.href === "/more" ? moreOn : isActive(path, n.href);
        return (
          <a key={n.href} href={n.href} aria-current={on ? "page" : undefined}
            class={`flex flex-col items-center justify-center h-11 rounded-xl text-[10px] gap-0 ${on ? "bg-c4 text-c0" : "text-c3"}`}>
            <Icon name={n.icon} size={19} />
            {n.label.split(" ")[0]}
          </a>
        );
      })}
    </nav>
  );
}

export function Frame({ children }: { children: ComponentChildren }) {
  return (
    <div class="h-full flex flex-col overflow-hidden bg-c1">
      <TopBar />
      <div class="flex-1 min-h-0 flex">
        <Sidebar />
        <main class="flex-1 min-w-0 min-h-0">{children}</main>
      </div>
      <BottomBar />
    </div>
  );
}
