// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            output: {
              // The Anthropic SDK re-exports Node built-ins as namespaces
              // (internal/node.mjs). When Rollup merges that module into a
              // shared chunk the namespace bindings get dropped and the Worker
              // crashes with "stream is not defined". Keep the SDK in its own chunk.
              manualChunks(id) {
                if (id.includes("node_modules/@anthropic-ai/sdk")) return "anthropic-sdk";
              },
            },
          },
        },
      },
    },
  },
});
