import { defineConfig, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";
import bundleObfuscator from "vite-plugin-bundle-obfuscator";

function cleanId(id: string) {
  return id.replace(/\\/g, "/");
}

const chunkNames = {
  auth: "core-a",
  session: "core-b",
  request: "core-c",
  gateway: "gateway",
  crypto: "core-d",
  docCore: "feature-doc-core",
  editorShell: "editor-shell",
  editorRuntime: "editor-runtime",
  editorCore: "editor-core",
  editorProsemirror: "editor-prosemirror",
  editorHighlight: "editor-highlight",
  editorUpload: "editor-upload",
  pageDocs: "page-docs",
  pageEditor: "page-editor",
  pageSettings: "page-settings",
  vendor: "vendor"
} as const;

function editorGroup(id: string) {
  if (id.includes("/src/components/editor/editor-runtime.ts")) return chunkNames.editorRuntime;
  if (id.includes("/src/components/editor/chendoc-image-extension.ts") || id.includes("/src/components/editor/video-extension.ts")) {
    return chunkNames.editorRuntime;
  }
  if (id.includes("/src/components/editor/")) return chunkNames.editorShell;
  if (id.includes("/src/composables/useUpload.ts") || id.includes("/src/api/uploads.ts")) return chunkNames.editorUpload;
  if (!id.includes("/node_modules/")) return null;
  if (id.includes("/@tiptap/extension-code-block-lowlight/") || id.includes("/lowlight/") || id.includes("/highlight.js/")) {
    return chunkNames.editorHighlight;
  }
  if (
    id.includes("/@tiptap/pm/")
    || id.includes("/prosemirror-")
    || id.includes("/orderedmap/")
    || id.includes("/rope-sequence/")
    || id.includes("/w3c-keyname/")
  ) return chunkNames.editorProsemirror;
  if (
    id.includes("/@tiptap/")
    || id.includes("/@floating-ui/")
    || id.includes("/linkifyjs/")
  ) return chunkNames.editorCore;
  return null;
}

function pageGroup(id: string) {
  if (!id.includes("/src/pages/")) return null;
  if (id.endsWith("/src/pages/docs/DocEditorPage.vue")) return chunkNames.pageEditor;
  if (id.includes("/src/pages/docs/")) return chunkNames.pageDocs;
  if (id.includes("/src/pages/settings/")) return chunkNames.pageSettings;
  return null;
}

function manualChunks(id: string) {
  const normalized = cleanId(id);

  const editorChunk = editorGroup(normalized);
  if (editorChunk) return editorChunk;

  if (normalized.includes("/node_modules/")) return chunkNames.vendor;

  if (normalized.includes("/src/gateway/") || normalized.endsWith("/src/api/endpoints.ts")) return chunkNames.gateway;
  if (normalized.endsWith("/src/security/cryptoClient.ts")) return chunkNames.crypto;
  if (normalized.endsWith("/src/security/sessionToken.ts") || normalized.endsWith("/src/stores/auth.ts")) return chunkNames.session;
  if (normalized.endsWith("/src/api/auth.ts")) return chunkNames.auth;
  if (normalized.endsWith("/src/api/docs.ts") || normalized.endsWith("/src/stores/doc.ts")) return chunkNames.docCore;
  if (
    normalized.endsWith("/src/api/request.ts")
    || normalized.endsWith("/src/security/runtimeGuard.ts")
  ) return chunkNames.request;

  return pageGroup(normalized) ?? undefined;
}

function chunkFileNames(chunk: { name: string }) {
  if (chunk.name === chunkNames.vendor) return "assets/v-[hash].js";
  if (chunk.name.startsWith("editor-")) return "assets/e-[hash].js";
  if (chunk.name === chunkNames.crypto) return "assets/c-[hash].js";
  if (chunk.name === chunkNames.request) return "assets/b-[hash].js";
  if (chunk.name === chunkNames.gateway) return "assets/g-[hash].js";
  if (chunk.name === chunkNames.auth || chunk.name === chunkNames.session) return "assets/a-[hash].js";
  if (chunk.name === chunkNames.docCore) return "assets/p-[hash].js";
  if (chunk.name.startsWith("page-")) return "assets/p-[hash].js";
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
      threadPool: false,
      excludes: [/^(?!assets\/g-).*\.js$/],
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
        onLog(level, log, handler) {
          if (level === "warn") throw new Error(`Build warning: ${log.message}`);
          handler(level, log);
        },
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
