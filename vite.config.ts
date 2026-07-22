import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Split long-lived vendor code into its own chunks so a change to app
    // code doesn't bust the (large, stable) React/Supabase caches. `three` is
    // already emitted as its own lazy chunk via dynamic import.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (/[\\/]react(-dom|-router-dom)?[\\/]/.test(id)) return "react-vendor";
            if (id.includes("@supabase")) return "supabase";
          }
          // Everything else (incl. `three`, reached only via dynamic import)
          // keeps Rollup's default chunking so lazy chunks stay lazy.
          return undefined;
        },
      },
    },
    // Trim a little build time; we don't read the gzip-size report.
    reportCompressedSize: false,
  },
});
