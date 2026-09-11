import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { alias: { "@": new URL("./src", import.meta.url).pathname } },
	test: {
		name: "web-dom",
		environment: "jsdom",
		setupFiles: ["./src/__tests__/setup.ts"],
		include: ["src/**/*.test.tsx"],
	},
});
