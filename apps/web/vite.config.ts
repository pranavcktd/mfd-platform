import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { config } from "dotenv";
import { resolve } from "node:path";

// vite.config.ts runs standalone (no dotenv loader ahead of it, unlike
// apps/api's main.ts / apps/workers' index.ts) — without this, process.env.API_PORT
// below is always undefined and the proxy silently falls back to its default
// port, which can point at a totally unrelated process if something else is
// squatting that port.
config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.API_PORT ?? 3000}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
