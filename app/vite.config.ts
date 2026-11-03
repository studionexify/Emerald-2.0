import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";

// `vite build --mode artifact` emits one JS + one CSS file, which scripts/artifact.mjs inlines into a single page.
export default defineConfig(({ mode }) => ({
  plugins: [preact(), tailwindcss()],
  build: mode === "artifact"
    ? { outDir: "dist-artifact", cssCodeSplit: false, modulePreload: false, rolldownOptions: { output: { inlineDynamicImports: true } }, rollupOptions: { output: { inlineDynamicImports: true } } }
    : {},
}));
