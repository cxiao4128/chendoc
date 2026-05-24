import { defineConfig, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import bundleObfuscator from "vite-plugin-bundle-obfuscator";

function cleanId(id: string) {
  return id.replace(/\\/g, "/");
}

function editorGroup(id: string) {
  if (id.includes("/@tiptap/") || id.includes("/src/components/editor/")) return chunkNames.editor;
  if (id.includes("/@floating-ui/")
    || id.includes("/prosemirror-")
    || id.includes("/orderedmap/")
    || id.includes("/rope-sequence/")
    || id.includes("/w3c-keyname/")
    || id.includes("/linkifyjs/")
    || id.includes("/lowlight/")) return chunkNames.editorDeps;
  return null;
}

const chunkNames = {
  auth: "core-a",
  session: "core-b",
  request: "core-c",
  crypto: "core-d",
  editor: "feature-a",
  docCore: "feature-b",
  editorDeps: "feature-c",
  vendor: "vendor",
  pageLogin: "page-a",
  pageRegister: "page-b",
  pageShell: "page-c",
  pageDocs: "page-d",
  pageEditor: "page-e",
  pageSettings: "page-f"
} as const;

function pageGroup(id: string) {
  if (!id.includes("/src/pages/")) return null;
  if (id.endsWith("/src/pages/admin/App.vue")) return null;
  if (id.endsWith("/src/pages/docs/DocEditorPage.vue")) return chunkNames.pageEditor;
  if (id.includes("/src/pages/login/")) return chunkNames.pageLogin;
  if (id.includes("/src/pages/register/")) return chunkNames.pageRegister;
  if (id.includes("/src/pages/admin/")) return chunkNames.pageShell;
  if (id.includes("/src/pages/docs/")) return chunkNames.pageDocs;
  if (id.includes("/src/pages/settings/")) return chunkNames.pageSettings;
  return null;
}

function manualChunks(id: string) {
  const normalized = cleanId(id);

  const editorChunk = editorGroup(normalized);
  if (editorChunk) return editorChunk;

  if (normalized.includes("/node_modules/")) return chunkNames.vendor;

  if (normalized.endsWith("/src/api/auth.ts")) return chunkNames.auth;
  if (normalized.endsWith("/src/api/docs.ts") || normalized.endsWith("/src/stores/doc.ts")) return chunkNames.docCore;

  if (
    normalized.endsWith("/src/security/cryptoClient.ts")
  ) return chunkNames.crypto;
  if (normalized.endsWith("/src/security/sessionToken.ts") || normalized.endsWith("/src/stores/auth.ts")) return chunkNames.session;
  if (
    normalized.endsWith("/src/api/request.ts")
    || normalized.endsWith("/src/api/endpoints.ts")
    || normalized.endsWith("/src/security/responseCrypto.ts")
    || normalized.endsWith("/src/security/runtimeGuard.ts")
  ) return chunkNames.request;

  return pageGroup(normalized) ?? undefined;
}

function chunkFileNames(chunk: { name: string }) {
  if (chunk.name === chunkNames.vendor || chunk.name === chunkNames.editor || chunk.name === chunkNames.editorDeps) return "assets/v-[hash].js";
  if (chunk.name === chunkNames.crypto) return "assets/c-[hash].js";
  if (chunk.name === chunkNames.request) return "assets/b-[hash].js";
  if (chunk.name === chunkNames.auth || chunk.name === chunkNames.session) return "assets/a-[hash].js";
  if (chunk.name === chunkNames.docCore || chunk.name.startsWith("page-")) return "assets/p-[hash].js";
  return "assets/p-[hash].js";
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
      excludes: [/^assets\/v-[\w-]+\.js$/],
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
      cssCodeSplit: true,
      minify: "esbuild",
      rollupOptions: {
        output: {
          entryFileNames: "assets/a-[hash].js",
          chunkFileNames,
          assetFileNames: "assets/a-[hash][extname]",
          manualChunks
        }
      }
    }
  };
});
