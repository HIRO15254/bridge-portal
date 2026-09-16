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

type PreviewRow = Record<string, unknown>;

interface PreviewSourceDatabase {
	query(sql: string): { all(...params: unknown[]): PreviewRow[] };
}

const previewTableOrder = [
	"user",
	"account",
	"bridge_system",
	"system_draft",
	"system_version",
	"tournament",
	"import_revision",
	"history_index",
	"history_index_entry",
	"tournament_revision",
	"deal",
	"board_attempt",
	"auction_call",
	"play_action",
	"board_score",
	"evaluation_run",
	"rule_evaluation",
	"rule_evaluation_override",
	"double_dummy_result",
] as const;

function quoteIdentifier(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlLiteral(value: unknown): string {
	if (value === null || value === undefined) {
		return "NULL";
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			throw new Error("Preview data contains a non-finite numeric value");
		}
		return String(value);
	}
	if (typeof value === "bigint") {
		return value.toString();
	}
	if (value instanceof Uint8Array) {
		return `X'${Buffer.from(value).toString("hex")}'`;
	}
	return `'${String(value).replaceAll("'", "''")}'`;
}

function hasTable(database: PreviewSourceDatabase, table: string): boolean {
	return (
		database
			.query(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1"
			)
			.all(table).length > 0
	);
}

function selectRows(
	database: PreviewSourceDatabase,
	table: string,
	where = "",
	parameters: unknown[] = []
): PreviewRow[] {
	if (!hasTable(database, table)) {
		return [];
	}
	return database
		.query(`SELECT * FROM ${quoteIdentifier(table)} ${where}`)
		.all(...parameters);
}

function selectRowsByIds(
	database: PreviewSourceDatabase,
	table: string,
	column: string,
	ids: string[]
): PreviewRow[] {
	if (ids.length === 0) {
		return [];
	}
	const placeholders = ids.map(() => "?").join(", ");
	return selectRows(
		database,
		table,
		`WHERE ${quoteIdentifier(column)} IN (${placeholders})`,
		ids
	);
}

function ids(rows: PreviewRow[]): string[] {
	return rows.flatMap((row) => (typeof row.id === "string" ? [row.id] : []));
}

function renderRows(table: string, rows: PreviewRow[]): string {
	if (rows.length === 0) {
		return "";
	}
	const columns = Object.keys(rows[0] ?? {});
	if (columns.length === 0) {
		return "";
	}
	const columnList = columns.map(quoteIdentifier).join(", ");
	return rows
		.map((row) => {
			const values = columns
				.map((column) => sqlLiteral(row[column]))
				.join(", ");
			return `INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${values});`;
		})
		.join("\n");
}

export interface PreviewUserData {
	r2Keys: string[];
	sql: string;
}

export function extractPreviewUserData(
	database: PreviewSourceDatabase,
	userEmail: string
): PreviewUserData {
	const users = selectRows(database, "user", "WHERE email = ?", [userEmail]);
	if (users.length !== 1) {
		throw new Error(
			`Expected exactly one preview user for ${userEmail}, found ${users.length}`
		);
	}
	const previewUser = users[0];
	if (typeof previewUser?.id !== "string") {
		throw new Error("Preview user is missing an ID");
	}
	const userId = previewUser.id;
	const rows = new Map<string, PreviewRow[]>([["user", users]]);

	rows.set(
		"account",
		selectRowsByIds(database, "account", "user_id", [userId])
	);
	const systems = selectRowsByIds(database, "bridge_system", "user_id", [
		userId,
	]);
	rows.set("bridge_system", systems);
	rows.set(
		"system_draft",
		selectRowsByIds(database, "system_draft", "system_id", ids(systems))
	);
	rows.set(
		"system_version",
		selectRowsByIds(database, "system_version", "system_id", ids(systems))
	);
	const tournaments = selectRowsByIds(database, "tournament", "user_id", [
		userId,
	]);
	rows.set("tournament", tournaments);
	const imports = selectRowsByIds(database, "import_revision", "user_id", [
		userId,
	]);
	rows.set("import_revision", imports);
	const historyIndexes = selectRowsByIds(database, "history_index", "user_id", [
		userId,
	]);
	rows.set("history_index", historyIndexes);
	rows.set(
		"history_index_entry",
		selectRowsByIds(
			database,
			"history_index_entry",
			"history_index_id",
			ids(historyIndexes)
		)
	);
	const revisions = selectRowsByIds(
		database,
		"tournament_revision",
		"tournament_id",
		ids(tournaments)
	);
	rows.set("tournament_revision", revisions);
	const boards = selectRowsByIds(
		database,
		"board_attempt",
		"tournament_revision_id",
		ids(revisions)
	);
	rows.set("board_attempt", boards);
	rows.set(
		"deal",
		selectRowsByIds(
			database,
			"deal",
			"id",
			boards.flatMap((board) =>
				typeof board.deal_id === "string" ? [board.deal_id] : []
			)
		)
	);
	const boardIds = ids(boards);
	rows.set(
		"auction_call",
		selectRowsByIds(database, "auction_call", "board_attempt_id", boardIds)
	);
	rows.set(
		"play_action",
		selectRowsByIds(database, "play_action", "board_attempt_id", boardIds)
	);
	rows.set(
		"board_score",
		selectRowsByIds(database, "board_score", "board_attempt_id", boardIds)
	);
	const evaluationRuns = selectRowsByIds(
		database,
		"evaluation_run",
		"board_attempt_id",
		boardIds
	);
	rows.set("evaluation_run", evaluationRuns);
	const evaluations = selectRowsByIds(
		database,
		"rule_evaluation",
		"evaluation_run_id",
		ids(evaluationRuns)
	);
	rows.set("rule_evaluation", evaluations);
	const overrides = selectRowsByIds(
		database,
		"rule_evaluation_override",
		"rule_evaluation_id",
		ids(evaluations)
	).filter((override) => override.corrected_by_user_id === userId);
	rows.set("rule_evaluation_override", overrides);
	rows.set(
		"double_dummy_result",
		selectRowsByIds(
			database,
			"double_dummy_result",
			"board_attempt_id",
			boardIds
		)
	);

	const r2Keys = imports.flatMap((row) =>
		typeof row.r2_key === "string" ? [row.r2_key] : []
	);
	if (r2Keys.some((key) => !key.startsWith(`${userId}/`))) {
		throw new Error("Preview user has an R2 key outside its user prefix");
	}
	return {
		r2Keys,
		sql: previewTableOrder
			.map((table) => renderRows(table, rows.get(table) ?? []))
			.filter(Boolean)
			.join("\n"),
	};
}

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

async function extractCommand(args: string[]): Promise<void> {
	const dumpPath = readOption(args, "--dump");
	const outputPath = readOption(args, "--output");
	const r2KeysPath = readOption(args, "--r2-keys");
	const userEmail = readOption(args, "--user-email");
	const { Database } = await import("bun:sqlite");
	const database = new Database(":memory:");
	try {
		database.exec(await readFile(dumpPath, "utf8"));
		const previewData = extractPreviewUserData(database, userEmail);
		await writeFile(outputPath, previewData.sql);
		await writeFile(r2KeysPath, previewData.r2Keys.join("\n"));
	} finally {
		database.close();
	}
}

async function main(): Promise<void> {
	const [command, ...args] = Bun.argv.slice(2);
	if (command === "extract") {
		await extractCommand(args);
		return;
	}
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
	throw new Error("Expected one of: extract, restore, stage, unstage");
}

if (import.meta.main) {
	await main();
}
