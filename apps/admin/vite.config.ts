import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8985",
      "/r": "http://127.0.0.1:8985"
    }
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@tiptap")) return "editor";
          if (id.includes("node_modules")) return "vendor";
        }
      }
    }
  }
});
