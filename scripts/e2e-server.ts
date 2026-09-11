import { rm } from "node:fs/promises";
import path from "node:path";

const workspace = path.resolve(import.meta.dirname, "..");
const testResults = path.resolve(workspace, "test-results");
const stateDirectory = path.resolve(testResults, "e2e-state");
if (!stateDirectory.startsWith(`${testResults}${path.sep}`)) {
	throw new Error("E2E state directory escaped test-results");
}
await rm(stateDirectory, { force: true, recursive: true });

const migration = Bun.spawn(
	[
		process.execPath,
		"x",
		"wrangler",
		"d1",
		"migrations",
		"apply",
		"bridge-portal-db",
		"--local",
		"--persist-to",
		stateDirectory,
		"-c",
		"apps/server/wrangler.jsonc",
	],
	{ cwd: workspace, stderr: "inherit", stdin: "ignore", stdout: "inherit" }
);
const migrationExitCode = await migration.exited;
if (migrationExitCode !== 0) {
	throw new Error(`E2E D1 migration failed with ${migrationExitCode}`);
}

const worker = Bun.spawn(
	[
		process.execPath,
		"x",
		"wrangler",
		"dev",
		"--local",
		"--ip",
		"127.0.0.1",
		"--port",
		"8787",
		"--persist-to",
		stateDirectory,
		"--var",
		"BETTER_AUTH_SECRET:e2e-secret-that-is-at-least-thirty-two-characters",
		"--var",
		"BOOTSTRAP_TOKEN:e2e-bootstrap-token-at-least-thirty-two-characters",
		"--show-interactive-dev-session=false",
		"--log-level",
		"warn",
		"-c",
		"apps/server/wrangler.jsonc",
	],
	{ cwd: workspace, stderr: "inherit", stdin: "ignore", stdout: "inherit" }
);
for (const signal of ["SIGINT", "SIGTERM"] as const) {
	process.on(signal, () => worker.kill());
}
process.exit(await worker.exited);
