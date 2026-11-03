import { signal } from "@preact/signals";

type Theme = "light" | "dark";
const read = (): Theme => {
  try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") return t; } catch {}
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};
export const theme = signal<Theme>(read());
document.documentElement.dataset.theme = theme.value;
export function toggleTheme() {
  theme.value = theme.value === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme.value;
  try { localStorage.setItem("theme", theme.value); } catch {}
}
