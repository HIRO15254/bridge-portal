import { defineConfig, devices } from "@playwright/test";

const apiUrl = "http://127.0.0.1:8787";
const webUrl = "http://127.0.0.1:3001";

export default defineConfig({
	fullyParallel: false,
	outputDir: "test-results/playwright",
	projects: [
		{
			name: "chrome",
			use: { ...devices["Desktop Chrome"], channel: "chrome" },
		},
	],
	reporter: process.env.CI
		? [
				["line"],
				[
					"html",
					{ open: "never", outputFolder: "test-results/playwright-report" },
				],
			]
		: [
				["list"],
				[
					"html",
					{ open: "never", outputFolder: "test-results/playwright-report" },
				],
			],
	retries: process.env.CI ? 1 : 0,
	testDir: "e2e",
	timeout: 60_000,
	use: {
		baseURL: webUrl,
		screenshot: "only-on-failure",
		trace: "retain-on-failure",
	},
	webServer: [
		{
			command: "bun scripts/e2e-server.ts",
			reuseExistingServer: false,
			timeout: 120_000,
			url: `${apiUrl}/`,
		},
		{
			command:
				"bun run --filter @bridge-portal/web dev -- --host 127.0.0.1 --port 3001 --strictPort",
			env: { ...process.env, VITE_SERVER_URL: apiUrl },
			reuseExistingServer: false,
			timeout: 120_000,
			url: webUrl,
		},
	],
});
