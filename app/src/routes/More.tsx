import { NAV } from "../nav";
import { Icon, Page } from "../ui";
import { theme, toggleTheme } from "../frame/theme";

export default function More() {
  const items = [...NAV, { href: "/settings", label: "Settings", icon: "settings" }];
  return (
    <Page title="All sections" >
      <ul class="bg-c0 rounded-[var(--radius-card)] p-2">
        {items.map((n) => (
          <li key={n.href}><a href={n.href} class="flex items-center gap-3 p-3 rounded-2xl hover:bg-c1">
            <span class="w-10 h-10 rounded-full bg-c4 text-c0 flex items-center justify-center"><Icon name={n.icon} size={18} /></span>
            <span class="flex-1 font-medium">{n.label}</span>
            <Icon name="arrow" size={18} />
          </a></li>
        ))}
      </ul>
      <button onClick={toggleTheme} class="mt-3 w-full flex items-center gap-3 p-3 rounded-[var(--radius-card)] bg-c0 cursor-pointer">
        <span class="w-10 h-10 rounded-full bg-c1 flex items-center justify-center"><Icon name={theme.value === "dark" ? "sun" : "moon"} size={18} /></span>
        <span class="flex-1 text-left font-medium">{theme.value === "dark" ? "Light" : "Dark"} theme</span>
      </button>
    </Page>
  );
}
