import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		name: "web-node",
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
