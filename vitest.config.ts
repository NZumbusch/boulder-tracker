import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  // The svelte plugin compiles `.svelte.ts` rune modules, so the reactive
  // stores in `src/lib/stores/` can be tested directly rather than only
  // through the pure modules beneath them - which matters most for
  // `SessionStore`, whose job is persistence, the one-session-at-a-time
  // invariant and the ticker's lifecycle, none of which the pure layer sees.
  plugins: [svelte()],
  resolve: {
    // Rune modules have to be compiled in their browser form; the server
    // build's `$state` handling makes reads come back stale.
    conditions: ["browser"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,js}", "scripts/**/*.test.ts"],
  },
});
