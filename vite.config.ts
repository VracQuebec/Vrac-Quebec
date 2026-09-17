import { defineConfig, type Plugin } from "vite";
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
    // Pré-rendu SEO global (pages SEO publiées + articles de blogue publiés).
    // Jamais bloquant : si la base est injoignable, le build produit le SPA normal.
    {
      name: "vrac-prerender-seo",
      apply: "build",
      async closeBundle() {
        try {
          const { prerenderSeo } = await import("./scripts/prerender-seo");
          const r = await prerenderSeo(path.resolve(__dirname, "dist"));
          console.log(`[prerender] ${r.written.length} pages pré-rendues, ${r.skipped.length} ignorées`);
        } catch (e) {
          console.warn("[prerender] ignoré :", (e as Error)?.message);
        }
      },
    } satisfies Plugin,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
