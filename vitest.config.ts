import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		projects: [
			"apps/web/vitest.dom.config.ts",
			"apps/web/vitest.node.config.ts",
			"apps/server/vitest.config.ts",
			"packages/api/vitest.config.ts",
			"packages/db/vitest.config.ts",
			"packages/env/vitest.config.ts",
			"scripts/vitest.config.ts",
		],
		coverage: {
			provider: "istanbul",
			include: [
				"apps/*/src/**/*.{ts,tsx}",
				"packages/*/src/**/*.ts",
				"scripts/*.ts",
			],
			exclude: [
				"**/__tests__/**",
				"**/*.test.{ts,tsx}",
				"**/*.d.ts",
				"**/routeTree.gen.ts",
				"**/migrations/**",
			],
			reporter: ["text-summary", "json-summary", "html", "lcov"],
		},
	},
});
