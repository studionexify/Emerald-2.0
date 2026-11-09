import type { ComponentChildren } from "preact";
import { signal } from "@preact/signals";
import { navigate, useLocation } from "../router";
import { syncState } from "../data/sync";
import { NAV, NAV_GROUPS, type NavItem } from "../nav";
import { AskHost, Icon } from "../ui";
import { searchQ } from "../data/search";
import { segmentOf } from "../data/inventory";
import { attention, batchesSig, binSig, tasksSig, can, isExternal, me, moduleOf, ordersSig, packSig, spoolsSig } from "../data";
import { theme, toggleTheme } from "./theme";

/** Module key for the themed accent: first path segment; home-like pages share the brand emerald. */
export const modOf = (path: string) => { const k = path.split("/")[1] || "home"; return ["search", "more"].includes(k) ? "home" : k; };

const isActive = (path: string, href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/"));

/* Breakpoints: phone < 768 (dock), tablet 768–1023 (icon rail, expandable), desktop ≥ 1024 (full sidebar, collapsible).
   Collapse is remembered per device; default = rail on tablet, labels on desktop. */
const readCollapsed = () => {
  try { const v = localStorage.getItem("nav-collapsed"); if (v !== null) return v === "1"; } catch {}
  return innerWidth < 1024;
};
const collapsed = signal(readCollapsed());
const toggleNav = () => {
  collapsed.value = !collapsed.value;
  try { localStorage.setItem("nav-collapsed", collapsed.value ? "1" : "0"); } catch {}
};

addEventListener("keydown", (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); const el = document.getElementById("global-search") as HTMLInputElement | null; if (el && el.offsetParent) el.focus(); else navigate("/search"); } });
const ALL = [...NAV, { href: "/settings", label: "Settings", icon: "settings" }];
const titleOf = (path: string) => (path === "/more" ? "More" : path === "/search" ? "Search" : [...ALL].sort((a, b) => b.href.length - a.href.length).find((n) => isActive(path, n.href))?.label ?? "Emerald");

/** Exact match for the production segments (they share the /work prefix); prefix match elsewhere. */
const SEG_HREFS = ["/work", "/work/b2b", "/work/inhouse"];
const navOn = (path: string, href: string) => (SEG_HREFS.includes(href) ? path === href || (href === "/work" && path.startsWith("/work/") && !SEG_HREFS.includes(path)) : isActive(path, href));

function navCount(href: string) {
  const live = ordersSig.value.filter((o) => o.stage !== "archived");
  if (href === "/work") return live.filter((o) => segmentOf(o) === "client").length;
  if (href === "/work/b2b") return live.filter((o) => segmentOf(o) === "bulk").length;
  if (href === "/work/inhouse") return live.filter((o) => segmentOf(o) === "inhouse").length;
  if (href === "/todo") return tasksSig.value.filter((t) => !t.done).length;
  if (href === "/alerts") return Object.values(attention(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value)).flat().filter((a) => a.t === "danger").length;
  if (href === "/bin") return binSig.value.length;
  return 0;
}

function Sidebar() {
  const { path } = useLocation();
  const c = collapsed.value;
  if (isExternal()) return null;
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => can(moduleOf(n.href))) })).filter((g) => g.items.length);
  const item = (n: NavItem) => {
    const on = navOn(path, n.href), k = navCount(n.href), hot = n.href === "/alerts" && k > 0;
    return (
      <a key={n.href} href={n.href} data-mod={modOf(n.href)} aria-current={on ? "page" : undefined} title={n.label}
        class={`relative flex items-center ${c ? "flex-col justify-center gap-1 h-[54px] px-1 rounded-2xl text-[10.5px] leading-tight text-center" : "gap-3 h-10 pl-3 pr-2 rounded-xl text-[14px]"} ${on ? "bg-acc text-on-acc font-semibold shadow-sm" : "text-c4 font-medium hover:bg-c1"}`}>
        <span class={`shrink-0 ${on ? "" : "text-acc"}`}><Icon name={n.icon} size={c ? 18 : 17} /></span>
        <span class={`min-w-0 ${c ? "max-w-full truncate" : "flex-1 truncate"}`}>{c ? n.label.split(" ")[0] : n.label}</span>
        {k > 0 && (c
          ? <span class={`absolute top-1 right-2 min-w-4 h-4 px-1 rounded-full text-[9.5px] leading-4 num font-bold ${hot ? "bg-warn text-black" : on ? "bg-c0 text-c4" : "bg-c1 text-c3"}`}>{k}</span>
          : <span class={`min-w-6 h-5 px-1.5 rounded-full text-[11px] leading-5 text-center num font-bold ${hot ? "bg-warn text-black" : on ? "bg-c0/25 text-on-acc" : "bg-c1 text-c3"}`}>{k}</span>)}
      </a>
    );
  };
  return (
    <aside aria-label="Main navigation"
      class={`hidden md:flex flex-col shrink-0 min-h-0 bg-c0 rounded-[22px] my-2 ml-[max(8px,env(safe-area-inset-left))] mr-2 ${c ? "w-[88px]" : "w-60 2xl:w-64"}`}>
      <nav class="flex-1 min-h-0 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden flex flex-col p-2.5">
        {groups.map((g, gi) => (
          <div key={g.label || gi} class={gi ? "mt-2 pt-2 border-t border-line" : ""}>
            {g.label && (c
              ? <div class="text-[9px] font-bold uppercase tracking-[0.08em] text-c2 text-center pb-1">{g.label === "Production" ? "Prod." : g.label === "Operations" ? "Ops" : "Space"}</div>
              : <div class="px-3 pt-1 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-c2">{g.label}</div>)}
            <div class={`flex flex-col gap-0.5 ${g.label === "Production" && !c ? "rounded-2xl bg-c1/50 p-1" : ""}`}>{g.items.map(item)}</div>
          </div>
        ))}
        <div class="mt-auto pt-2 border-t border-line">{item({ href: "/settings", label: "Settings", icon: "settings" })}</div>
      </nav>
    </aside>
  );
}

/** Bell: a link to the Attention page (inline, never a popup). Badge counts urgent items only. */
function Bell() {
  const n = Object.values(attention(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value)).flat().filter((a) => a.t === "danger").length;
  return (
    <a href="/alerts" aria-label={`Attention (${n} urgent)`} class="w-11 h-11 md:w-8 md:h-8 rounded-lg hover:bg-c1 flex items-center justify-center relative shrink-0">
      <Icon name="bell" size={16} />
      {n > 0 && <span class="absolute top-0 right-0 min-w-3.5 h-3.5 px-0.5 rounded-full bg-warn text-black text-[9px] leading-[14px] text-center num">{n}</span>}
    </a>
  );
}

const SYNC: Record<string, [string, string]> = { synced: ["bg-c4", "Synced"], sending: ["bg-c2 animate-pulse", "Saving"], offline: ["bg-warn", "Offline"], error: ["bg-warn", "Sync error"] };
function SyncDot() {
  const s = SYNC[syncState.value];
  return s ? <span role="status" aria-label={s[1]} title={s[1]} class={`w-2 h-2 rounded-full shrink-0 ${s[0]}`} /> : null;
}

/** Top bar. Phone: slim context bar (title, sync, search, bell, profile). Tablet/desktop: brand, search field, actions. */
function TopBar() {
  const { path, route } = useLocation();
  return (
    <header class="shrink-0 bg-canvas relative z-10 pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div class="h-12 flex items-center gap-1 md:gap-2 px-1.5 md:px-3">
        <button onClick={toggleNav} aria-label={collapsed.value ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed.value}
          class="hidden md:flex w-8 h-8 rounded-lg hover:bg-c1 items-center justify-center cursor-pointer shrink-0">
          <Icon name="menu" size={16} />
        </button>
        <a href="/" aria-label="Emerald home" class="flex items-center gap-2 shrink-0 md:w-[148px] pl-1.5 md:pl-0">
          <span data-mod="home" class="w-6 h-6 rounded-md bg-acc text-on-acc flex items-center justify-center text-[12px] font-bold">E</span>
          <span class="hidden md:inline text-[15px] font-semibold tracking-tight">Emerald</span>
        </a>
        <div class="md:hidden flex-1 min-w-0 flex items-center gap-2 pl-1">
          <span class="text-[15px] font-semibold tracking-tight truncate">{titleOf(path)}</span>
          <SyncDot />
        </div>
        <label class="hidden md:flex flex-1 min-w-0 max-w-[320px] h-8 bg-c0 rounded-full items-center gap-1.5 px-3 text-c2">
          <Icon name="search" size={13} />
          <input id="global-search" type="search" enterKeyHint="search" value={searchQ.value} onInput={(e) => { searchQ.value = (e.target as HTMLInputElement).value; if (path !== "/search") route("/search"); }} class="flex-1 bg-transparent outline-none text-c4 placeholder:text-c2 text-[13px] min-w-0" placeholder="Search" aria-label="Search" />
          <kbd class="hidden lg:inline text-[10px] text-c2 border border-line rounded px-1 font-sans">⌘K</kbd>
        </label>
        <div class="ml-auto flex items-center gap-0 md:gap-1 shrink-0">
          <span class="hidden md:inline-flex mr-1"><SyncDot /></span>
          <a href="/search" aria-label="Search" class="md:hidden w-11 h-11 rounded-lg flex items-center justify-center"><Icon name="search" size={18} /></a>
          <a href="/work/orders" class="h-8 px-3.5 mr-1 rounded-full bg-c4 text-c0 hidden md:inline-flex items-center gap-1 text-[13px] font-semibold">
            <Icon name="plus" size={13} /> New
          </a>
          <button onClick={toggleTheme} aria-label="Toggle theme" class="w-8 h-8 shrink-0 rounded-lg hover:bg-c1 hidden md:flex items-center justify-center cursor-pointer">
            <Icon name={theme.value === "dark" ? "sun" : "moon"} size={16} />
          </button>
          <Bell />
          <a href="/settings" aria-label={`Settings — ${me.value?.name}`} title={me.value?.name} class="w-11 h-11 md:w-8 md:h-8 md:ml-1 flex items-center justify-center shrink-0">
            <span class="w-7 h-7 rounded-full bg-c4 text-c0 flex items-center justify-center text-[12px] font-semibold">{me.value?.name[0]}</span>
          </a>
        </div>
      </div>
    </header>
  );
}

/** Phone-only dock (< 768px): 5 thumb-zone tabs, in layout flow so it never covers content. */
function Dock() {
  const { path } = useLocation();
  const urgent = Object.values(attention(ordersSig.value, spoolsSig.value, packSig.value, batchesSig.value)).flat().filter((a) => a.t === "danger").length;
  const items = isExternal()
    ? [{ href: "/mauny/gst", label: "GST desk", icon: "money" }, { href: "/settings", label: "Settings", icon: "settings" }]
    : [NAV[0], NAV[1], NAV[2], NAV[4], { href: "/more", label: "More", icon: "grid" }].filter((n) => n.href === "/more" || can(moduleOf(n.href)));
  const moreOn = !items.filter((n) => n.href !== "/more").some((n) => isActive(path, n.href));
  return (
    <nav class="md:hidden relative z-30 isolate shrink-0 bg-c0 rounded-t-[22px] shadow-[0_-1px_0_var(--line)] [transform:translateZ(0)] flex px-[max(4px,env(safe-area-inset-left))] pb-[env(safe-area-inset-bottom)]" aria-label="Main">
      {items.map((n) => {
        const on = n.href === "/more" ? moreOn : isActive(path, n.href);
        return (
          <a key={n.href} href={n.href} data-mod={n.href === "/more" ? undefined : modOf(n.href)} aria-current={on ? "page" : undefined}
            class={`flex-1 relative flex flex-col items-center justify-center h-14 gap-0.5 text-[10px] min-w-0 ${on ? "text-c4 font-semibold" : "text-c2 font-medium"}`}>
            <span class={`relative inline-flex items-center justify-center h-8 w-12 rounded-full ${on ? "bg-acc text-on-acc" : ""}`}><Icon name={n.icon} size={20} />
              {n.href === "/more" && urgent > 0 && <span class="absolute -top-1.5 -right-2 min-w-3.5 h-3.5 px-0.5 rounded-full bg-warn text-black text-[9px] leading-[14px] text-center num">{urgent}</span>}
            </span>
            <span class="truncate max-w-full">{n.label.split(" ")[0]}</span>
          </a>
        );
      })}
    </nav>
  );
}

export function Frame({ children }: { children: ComponentChildren }) {
  const mod = modOf(useLocation().path);
  if (document.documentElement.dataset.mod !== mod) document.documentElement.dataset.mod = mod;
  return (
    <div class="h-full flex flex-col overflow-hidden bg-canvas">
      <TopBar />
      <div class="flex-1 min-h-0 flex">
        <Sidebar />
        <main class="overflow-hidden flex-1 min-w-0 min-h-0 pr-[env(safe-area-inset-right)] md:pl-0 pl-[env(safe-area-inset-left)]">{children}</main>
      </div>
      <Dock />
      <AskHost />
    </div>
  );
}
