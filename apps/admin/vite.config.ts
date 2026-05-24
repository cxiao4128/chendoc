import { defineConfig, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import bundleObfuscator from "vite-plugin-bundle-obfuscator";

function cleanId(id: string) {
  return id.replace(/\\/g, "/");
}

function isEditorModule(id: string) {
  return id.includes("/@tiptap/")
    || id.includes("/@floating-ui/")
    || id.includes("/prosemirror-")
    || id.includes("/orderedmap/")
    || id.includes("/rope-sequence/")
    || id.includes("/w3c-keyname/")
    || id.includes("/linkifyjs/")
    || id.includes("/lowlight/")
    || id.includes("/src/components/editor/");
}

function pageGroup(id: string) {
  if (!id.includes("/src/pages/")) return null;
  if (id.endsWith("/src/pages/docs/DocEditorPage.vue")) return "pages-editor";
  if (id.includes("/src/pages/login/") || id.includes("/src/pages/register/")) return "pages-auth";
  if (id.includes("/src/pages/admin/")) return "pages-shell";
  if (id.includes("/src/pages/docs/")) return "pages-docs";
  if (id.includes("/src/pages/settings/")) return "pages-settings";
  return "pages-admin";
}

function manualChunks(id: string) {
  const normalized = cleanId(id);

  if (isEditorModule(normalized)) return "editor";

  if (normalized.includes("/node_modules/")) return "vendor";

  if (
    normalized.endsWith("/src/security/cryptoClient.ts")
    || normalized.endsWith("/src/api/auth.ts")
    || normalized.endsWith("/src/api/crypto.ts")
  ) return "crypto";
  if (normalized.endsWith("/src/security/sessionToken.ts") || normalized.endsWith("/src/stores/auth.ts")) return "session";
  if (
    normalized.endsWith("/src/api/request.ts")
    || normalized.endsWith("/src/api/endpoints.ts")
    || normalized.endsWith("/src/security/responseCrypto.ts")
    || normalized.endsWith("/src/security/runtimeGuard.ts")
  ) return "request";

  return pageGroup(normalized) ?? undefined;
}

function chunkFileNames(chunk: { name: string }) {
  if (chunk.name === "crypto") return "assets/c-[hash].js";
  if (chunk.name === "session") return "assets/s-[hash].js";
  if (chunk.name === "request") return "assets/r-[hash].js";
  if (chunk.name === "editor") return "assets/e-[hash].js";
  if (chunk.name === "vendor") return "assets/v-[hash].js";
  if (chunk.name.startsWith("pages-")) return "assets/p-[hash].js";
  return "assets/i-[hash].js";
}

const obfuscatorOptions = {
  compact: true,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.25,
  stringArrayRotate: true,
  splitStrings: false,
  identifierNamesGenerator: "hexadecimal",
  selfDefending: false,
  debugProtection: false,
  disableConsoleOutput: false
} as const;

export default defineConfig(({ command, mode }) => {
  const isProductionBuild = command === "build" && mode === "production";
  const plugins: PluginOption[] = [vue()];

  if (isProductionBuild) {
    plugins.push(bundleObfuscator({
      apply: "build",
      enable: true,
      log: false,
      autoExcludeNodeModules: false,
      threadPool: true,
      excludes: [/^assets\/v-[\w-]+\.js$/, /^assets\/e-[\w-]+\.js$/],
      options: obfuscatorOptions
    }));
  }

  return {
    plugins,
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8985",
        "/r": "http://127.0.0.1:8985"
      }
    },
    build: {
      sourcemap: false,
      minify: "esbuild",
      rollupOptions: {
        output: {
          entryFileNames: "assets/i-[hash].js",
          chunkFileNames,
          assetFileNames: "assets/[name]-[hash][extname]",
          manualChunks
        }
      }
    }
  };
});
