import { readdir } from "node:fs/promises";
import path from "node:path";

export type MigrationTarget = "local" | "remote";

export async function listD1Migrations(directory: string): Promise<string[]> {
	return (await readdir(directory))
		.filter((file) => path.extname(file) === ".sql")
		.sort();
}

export async function applyD1Migrations(
	root: string,
	target: MigrationTarget,
	spawn: typeof Bun.spawn = Bun.spawn
): Promise<boolean> {
	const migrationsDirectory = path.join(root, "packages/db/src/migrations");
	const migrations = await listD1Migrations(migrationsDirectory);
	if (migrations.length === 0) {
		console.log("No D1 migrations to apply.");
		return false;
	}

	const configPath = path.join(root, "apps/server/wrangler.jsonc");
	const child = spawn(
		[
			"bunx",
			"wrangler",
			"d1",
			"migrations",
			"apply",
			"DB",
			`--${target}`,
			"-c",
			configPath,
		],
		{ cwd: root, stderr: "inherit", stdout: "inherit" }
	);
	if ((await child.exited) !== 0) {
		throw new Error(`D1 ${target} migration failed`);
	}
	return true;
}

async function main(): Promise<void> {
	const target = Bun.argv[2];
	if (target !== "local" && target !== "remote") {
		throw new Error("Expected migration target: local or remote");
	}
	await applyD1Migrations(path.resolve(import.meta.dirname, ".."), target);
}

if (import.meta.main) {
	await main();
}
