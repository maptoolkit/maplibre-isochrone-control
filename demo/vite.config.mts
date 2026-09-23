import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

function copyMaplibreWorkerFiles(): Plugin {
  return {
    name: "copy-maplibre-worker-files",
    apply: "build",
    closeBundle() {
      const src = fileURLToPath(new URL("../node_modules/maplibre-gl/dist/", import.meta.url));
      const outDir = fileURLToPath(new URL("../demo-dist/assets/", import.meta.url));
      mkdirSync(outDir, { recursive: true });
      for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
        copyFileSync(src + file, outDir + file);
      }
    },
  };
}

export default defineConfig({
  root: "demo",
  base: "./",
  optimizeDeps: { exclude: ["maplibre-gl"] },
  plugins: [copyMaplibreWorkerFiles()],
  build: {
    outDir: "../demo-dist",
    emptyOutDir: true,
  },
});
