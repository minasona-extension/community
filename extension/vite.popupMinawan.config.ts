import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        content: "popupMinawan.ts",
      },
      output: {
        inlineDynamicImports: true,
        entryFileNames: "popupMinawan.js",
      },
    },
    emptyOutDir: false,
  },
});
