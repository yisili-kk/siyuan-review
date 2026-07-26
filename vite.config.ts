import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    {
      name: "copy-siyuan-plugin-assets",
      writeBundle() {
        copyFileSync(resolve("plugin.json"), resolve("dist/plugin.json"));
        copyFileSync(resolve("README.md"), resolve("dist/README.md"));
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    lib: {
      entry: "src/index.ts",
      formats: ["cjs"],
      fileName: () => "index.js",
    },
    rollupOptions: {
      external: ["siyuan"],
      output: {
        assetFileNames: (assetInfo) => {
          return assetInfo.name?.endsWith(".css") ? "index.css" : "[name][extname]";
        },
      },
    },
  },
});
