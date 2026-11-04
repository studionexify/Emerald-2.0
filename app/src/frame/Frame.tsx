import type { ComponentChildren } from "preact";
import { signal } from "@preact/signals";
import { useLocation } from "../router";
import { NAV } from "../nav";
import { Icon } from "../ui";
import { searchQ } from "../data/search";
import { attention, batchesSig, can, isExternal, me, moduleOf, ordersSig, packSig, spoolsSig } from "../data";
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
      class={`hidden md:flex flex-col shrink-0 min-h-0 bg-canvas border-r border-line ${c ? "w-[84px]" : "w-52 2xl:w-56"}`}>
      <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col gap-0.5 p-2">
        {ALL.filter((n) => (isExternal() ? n.href === "/settings" : can(moduleOf(n.href)))).concat(isExternal() ? [{ href: "/mauny/gst", label: "GST desk", icon: "money" }] : []).map((n) => {
          const on = isActive(path, n.href);
          return (
            <a key={n.href} href={n.href} aria-current={on ? "page" : undefined} title={n.label}
              class={`flex items-center rounded-lg ${n.href === "/settings" ? "mt-auto" : ""} ${c ? "flex-col justify-center gap-1 py-2 px-1 text-[10px] leading-tight text-center" : "gap-2.5 h-8 px-2.5 text-[13px]"} ${on ? "bg-c1 text-c4 font-semibold" : "text-c3 font-medium hover:bg-c1/60 hover:text-c4"}`}>
              <Icon name={n.icon} size={c ? 18 : 16} />
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
    <a href="/alerts" aria-label={`Attention (${n} urgent)`} class="w-8 h-8 rounded-lg hover:bg-c1 flex items-center justify-center relative shrink-0">
      <Icon name="bell" size={16} />
      {n > 0 && <span class="absolute top-0 right-0 min-w-3.5 h-3.5 px-0.5 rounded-full bg-warn text-black text-[9px] leading-[14px] text-center num">{n}</span>}
    </a>
  );
}

/** Fixed top bar: menu toggle + brand on the left, search in the middle, actions on the right. */
function TopBar() {
  const { path, route } = useLocation();
  return (
    <header class="shrink-0 h-12 flex items-center gap-2 px-2 md:px-3 bg-c0/80 backdrop-blur-md border-b border-line relative z-10">
      <button onClick={toggleNav} aria-label={collapsed.value ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed.value}
        class="hidden md:flex w-8 h-8 rounded-lg hover:bg-c1 items-center justify-center cursor-pointer shrink-0">
        <Icon name="menu" size={16} />
      </button>
      <a href="/" class="flex items-center gap-2 shrink-0 md:w-[148px]">
        <span class="w-6 h-6 rounded-md bg-c4 text-c0 flex items-center justify-center text-[12px] font-bold">E</span>
        <span class="hidden md:inline text-[15px] font-semibold tracking-tight">Emerald</span>
      </a>
      <label class="flex-1 min-w-0 max-w-[320px] h-7 bg-c1 rounded-md flex items-center gap-1.5 px-2 text-c2">
        <Icon name="search" size={13} />
        <input id="global-search" value={searchQ.value} onInput={(e) => { searchQ.value = (e.target as HTMLInputElement).value; if (path !== "/search") route("/search"); }} class="flex-1 bg-transparent outline-none text-c4 placeholder:text-c2 text-[13px] min-w-0" placeholder="Search" aria-label="Search" />
        <kbd class="hidden md:inline text-[10px] text-c2 border border-line rounded px-1 font-sans">⌘K</kbd>
      </label>
      <div class="ml-auto flex items-center gap-1 shrink-0">
        <a href="/work/orders" class="h-7 px-2.5 mr-1 rounded-md bg-c4 text-c0 hidden md:inline-flex items-center gap-1 text-[13px] font-semibold">
          <Icon name="plus" size={13} /> New
        </a>
        <button onClick={toggleTheme} aria-label="Toggle theme" class="w-8 h-8 shrink-0 rounded-lg hover:bg-c1 hidden md:flex items-center justify-center cursor-pointer">
          <Icon name={theme.value === "dark" ? "sun" : "moon"} size={16} />
        </button>
        <Bell />
        <a href="/settings" aria-label={`Settings — ${me.value?.name}`} title={me.value?.name} class="w-7 h-7 ml-1 rounded-full bg-c4 text-c0 flex items-center justify-center text-[12px] font-semibold shrink-0">{me.value?.name[0]}</a>

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
    <nav class={`md:hidden shrink-0 bg-c0 border-t border-line grid ${isExternal() ? "grid-cols-2" : "grid-cols-5"} px-2 pt-1 pb-[max(4px,env(safe-area-inset-bottom))]`} aria-label="Main">
      {items.map((n) => {
        const on = n.href === "/more" ? moreOn : isActive(path, n.href);
        return (
          <a key={n.href} href={n.href} aria-current={on ? "page" : undefined}
            class={`flex flex-col items-center justify-center h-11 rounded-lg text-[10px] gap-0.5 ${on ? "text-c4 font-semibold" : "text-c2"}`}>
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
    <div class="h-full flex flex-col overflow-hidden bg-canvas">
      <TopBar />
      <div class="flex-1 min-h-0 flex">
        <Sidebar />
        <main class="flex-1 min-w-0 min-h-0">{children}</main>
      </div>
      <BottomBar />
    </div>
  );
}
