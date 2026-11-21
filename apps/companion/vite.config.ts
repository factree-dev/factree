import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `vite build` builds the browser app into dist/ui.
// `vite build --ssr server/index.ts` bundles the server into one file with only Node built-ins.
export default defineConfig(({ isSsrBuild }) => ({
  plugins: isSsrBuild ? [] : [react()],
  build: isSsrBuild
    ? { target: "node20", emptyOutDir: true, rollupOptions: { output: { entryFileNames: "server.js" } } }
    : { outDir: "dist/ui", emptyOutDir: true },
  ssr: { noExternal: true },
  server: { port: 5173, proxy: { "/api": "http://localhost:4748" } },
  test: { include: ["test/**/*.test.ts"] },
}));
