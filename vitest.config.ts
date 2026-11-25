import { configDefaults, defineConfig } from "vitest/config";

// `npm test` (Vitest) runs tests/integration/** and tests/abuse/**. Playwright owns tests/e2e/**
// (`npm run test:e2e`), so Vitest must not load those files.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "tests/e2e/**", ".next/**", "playwright-report/**", "test-results/**"],
  },
});
