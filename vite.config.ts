import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    // PHASE 3C — pré-rendu pilote (10 pages SEO seulement). Jamais bloquant :
    // si la base est injoignable, le build produit le SPA normal.
    {
      name: "vrac-prerender-seo-pilot",
      apply: "build",
      async closeBundle() {
        try {
          const { prerenderPilot } = await import("./scripts/prerender-seo-pilot");
          const slugs = await prerenderPilot(path.resolve(__dirname, "dist"));
          this.warn?.(`[prerender-pilot] ${slugs.length} pages pré-rendues`);
        } catch (e) {
          console.warn("[prerender-pilot] ignoré :", (e as Error)?.message);
        }
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
