import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TriggerDefinition {
	name: string;
	sql: string;
}

export interface PreviewDatabaseAdapter {
	execute(sql: string): Promise<void>;
	listTriggers(): Promise<TriggerDefinition[]>;
}

const MIGRATION_PATTERN = /^\d+_.+\.sql$/;
const TRAILING_SEMICOLON_PATTERN = /;\s*$/u;
const FOREIGN_KEYS_OFF_PATTERN =
	/PRAGMA\s+foreign_keys\s*=\s*(?:OFF|false|0)\s*;/giu;

export function prepareDataDump(dump: string): string {
	const withoutMigrationRows = dump.replace(
		/INSERT\s+INTO\s+["`]?d1_migrations["`]?\b[\s\S]*?;/giu,
		""
	);
	const safeDump = withoutMigrationRows.replaceAll(
		FOREIGN_KEYS_OFF_PATTERN,
		"PRAGMA defer_foreign_keys = true;"
	);
	const statements = safeDump.replaceAll(/--[^\n]*/g, "").trim();
	if (!statements) {
		return "";
	}
	return `PRAGMA defer_foreign_keys = true;\n${safeDump.trim()}\n`;
}

export function renderTriggerSql(triggers: TriggerDefinition[]): {
	drop: string;
	rearm: string;
} {
	const drop = triggers
		.map(
			({ name }) => `DROP TRIGGER IF EXISTS \`${name.replaceAll("`", "``")}\`;`
		)
		.join("\n");
	const create = triggers
		.map(({ sql }) => `${sql.replace(TRAILING_SEMICOLON_PATTERN, "")};`)
		.join("\n");
	return {
		drop: drop ? `${drop}\n` : "",
		rearm: drop ? `${drop}\n${create}\n` : "",
	};
}

export async function restorePreviewData(
	adapter: PreviewDatabaseAdapter,
	rawDump: string
): Promise<void> {
	const triggers = await adapter.listTriggers();
	const scripts = renderTriggerSql(triggers);
	const dump = prepareDataDump(rawDump);
	let restoreError: unknown;
	let rearmError: unknown;

	try {
		if (scripts.drop) {
			await adapter.execute(scripts.drop);
		}
		if (dump) {
			await adapter.execute(dump);
		}
	} catch (error) {
		restoreError = error;
	}

	try {
		if (scripts.rearm) {
			await adapter.execute(scripts.rearm);
		}
	} catch (error) {
		rearmError = error;
	}

	if (restoreError && rearmError) {
		throw new AggregateError(
			[restoreError, rearmError],
			"D1 import and trigger restoration both failed"
		);
	}

	if (restoreError) {
		throw restoreError;
	}
	if (rearmError) {
		throw rearmError;
	}
}

interface StageMigrationsOptions {
	lastApplied: string;
	migrationsDirectory: string;
	stashDirectory: string;
}

export async function stageUnreleasedMigrations({
	lastApplied,
	migrationsDirectory,
	stashDirectory,
}: StageMigrationsOptions): Promise<string[]> {
	await mkdir(stashDirectory, { recursive: true });
	const files = await readdir(migrationsDirectory);
	const unreleased = files
		.filter((file) => MIGRATION_PATTERN.test(file))
		.filter((file) => !lastApplied || file > lastApplied)
		.sort();

	for (const file of unreleased) {
		await rename(
			path.join(migrationsDirectory, file),
			path.join(stashDirectory, file)
		);
	}
	return unreleased;
}

export async function restoreStagedMigrations(
	migrationsDirectory: string,
	stashDirectory: string
): Promise<string[]> {
	let files: string[];
	try {
		files = await readdir(stashDirectory);
	} catch {
		return [];
	}
	const migrations = files
		.filter((file) => MIGRATION_PATTERN.test(file))
		.sort();
	for (const file of migrations) {
		await rename(
			path.join(stashDirectory, file),
			path.join(migrationsDirectory, file)
		);
	}
	return migrations;
}

async function runWrangler(args: string[]): Promise<string> {
	const process = Bun.spawn(["bunx", "wrangler", ...args], {
		stdout: "pipe",
		stderr: "inherit",
	});
	const output = await new Response(process.stdout).text();
	if ((await process.exited) !== 0) {
		throw new Error(`Wrangler failed: ${args.join(" ")}`);
	}
	return output;
}

function readOption(args: string[], option: string): string {
	const index = args.indexOf(option);
	const value = index >= 0 ? args[index + 1] : undefined;
	if (!value) {
		throw new Error(`Missing required option ${option}`);
	}
	return value;
}

function readOptionalOption(args: string[], option: string): string {
	const index = args.indexOf(option);
	return index >= 0 ? (args[index + 1] ?? "") : "";
}

async function restoreCommand(args: string[]): Promise<void> {
	const database = readOption(args, "--database");
	const config = readOption(args, "--config");
	const dumpPath = readOption(args, "--dump");
	const rawDump = await readFile(dumpPath, "utf8");
	const tempDirectory = await mkdtemp(path.join(tmpdir(), "preview-d1-"));

	const execute = async (sql: string) => {
		const sqlPath = path.join(tempDirectory, "command.sql");
		await writeFile(sqlPath, sql);
		await runWrangler([
			"d1",
			"execute",
			database,
			"--remote",
			`--file=${sqlPath}`,
			"-c",
			config,
		]);
	};

	try {
		await restorePreviewData(
			{
				execute,
				async listTriggers() {
					const output = await runWrangler([
						"d1",
						"execute",
						database,
						"--remote",
						"--json",
						"--command=SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL ORDER BY name",
						"-c",
						config,
					]);
					const payload = JSON.parse(output) as Array<{
						results?: TriggerDefinition[];
					}>;
					return payload[0]?.results ?? [];
				},
			},
			rawDump
		);
	} finally {
		await rm(tempDirectory, { force: true, recursive: true });
	}
}

async function main(): Promise<void> {
	const [command, ...args] = Bun.argv.slice(2);
	if (command === "restore") {
		await restoreCommand(args);
		return;
	}
	if (command === "stage") {
		const staged = await stageUnreleasedMigrations({
			lastApplied: readOptionalOption(args, "--last-applied"),
			migrationsDirectory: readOption(args, "--migrations"),
			stashDirectory: readOption(args, "--stash"),
		});
		console.log(staged.join("\n"));
		return;
	}
	if (command === "unstage") {
		const restored = await restoreStagedMigrations(
			readOption(args, "--migrations"),
			readOption(args, "--stash")
		);
		console.log(restored.join("\n"));
		return;
	}
	throw new Error("Expected one of: restore, stage, unstage");
}

if (import.meta.main) {
	await main();
}
