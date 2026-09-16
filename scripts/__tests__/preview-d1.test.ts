import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	extractPreviewUserData,
	prepareDataDump,
	renderTriggerSql,
	restorePreviewData,
	restoreStagedMigrations,
	stageUnreleasedMigrations,
} from "../preview-d1";

const miniflares: Miniflare[] = [];

afterEach(async () => {
	await Promise.all(
		miniflares.splice(0).map((miniflare) => miniflare.dispose())
	);
});

describe("preview D1 data restoration", () => {
	it("extracts only the selected user's complete data graph", () => {
		const database = new DatabaseSync(":memory:");
		try {
			database.exec(`
				CREATE TABLE user (id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL);
				CREATE TABLE account (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, password TEXT);
				CREATE TABLE session (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, token TEXT NOT NULL);
				CREATE TABLE verification (id TEXT PRIMARY KEY, identifier TEXT NOT NULL);
				CREATE TABLE bridge_system (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL);
				CREATE TABLE system_draft (id TEXT PRIMARY KEY, system_id TEXT NOT NULL);
				CREATE TABLE system_version (id TEXT PRIMARY KEY, system_id TEXT NOT NULL);
				CREATE TABLE tournament (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
				CREATE TABLE import_revision (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, r2_key TEXT NOT NULL);
				CREATE TABLE history_index (id TEXT PRIMARY KEY, user_id TEXT NOT NULL);
				CREATE TABLE history_index_entry (id TEXT PRIMARY KEY, history_index_id TEXT NOT NULL);
				CREATE TABLE tournament_revision (id TEXT PRIMARY KEY, tournament_id TEXT NOT NULL);
				CREATE TABLE deal (id TEXT PRIMARY KEY, deal_hash TEXT NOT NULL);
				CREATE TABLE board_attempt (id TEXT PRIMARY KEY, tournament_revision_id TEXT NOT NULL, deal_id TEXT NOT NULL);
				CREATE TABLE auction_call (id TEXT PRIMARY KEY, board_attempt_id TEXT NOT NULL);
				CREATE TABLE play_action (id TEXT PRIMARY KEY, board_attempt_id TEXT NOT NULL);
				CREATE TABLE board_score (id TEXT PRIMARY KEY, board_attempt_id TEXT NOT NULL);
				CREATE TABLE evaluation_run (id TEXT PRIMARY KEY, board_attempt_id TEXT NOT NULL);
				CREATE TABLE rule_evaluation (id TEXT PRIMARY KEY, evaluation_run_id TEXT NOT NULL);
				CREATE TABLE rule_evaluation_override (id TEXT PRIMARY KEY, rule_evaluation_id TEXT NOT NULL, corrected_by_user_id TEXT NOT NULL);
				CREATE TABLE double_dummy_result (id TEXT PRIMARY KEY, board_attempt_id TEXT NOT NULL);
				INSERT INTO user VALUES ('developer', 'developer@example.test', 'Developer'), ('other', 'other@example.test', 'Other');
				INSERT INTO account VALUES ('developer-account', 'developer', 'hash'), ('other-account', 'other', 'other-hash');
				INSERT INTO session VALUES ('developer-session', 'developer', 'secret-token'), ('other-session', 'other', 'other-token');
				INSERT INTO verification VALUES ('developer-verification', 'developer@example.test');
				INSERT INTO bridge_system VALUES ('developer-system', 'developer', 'System'), ('other-system', 'other', 'Other system');
				INSERT INTO system_draft VALUES ('developer-draft', 'developer-system'), ('other-draft', 'other-system');
				INSERT INTO system_version VALUES ('developer-version', 'developer-system'), ('other-version', 'other-system');
				INSERT INTO tournament VALUES ('developer-tournament', 'developer'), ('other-tournament', 'other');
				INSERT INTO import_revision VALUES ('developer-import', 'developer', 'developer/daily/source.json'), ('other-import', 'other', 'other/daily/source.json');
				INSERT INTO history_index VALUES ('developer-index', 'developer'), ('other-index', 'other');
				INSERT INTO history_index_entry VALUES ('developer-entry', 'developer-index'), ('other-entry', 'other-index');
				INSERT INTO tournament_revision VALUES ('developer-revision', 'developer-tournament'), ('other-revision', 'other-tournament');
				INSERT INTO deal VALUES ('developer-deal', 'developer-hash'), ('other-deal', 'other-hash');
				INSERT INTO board_attempt VALUES ('developer-board', 'developer-revision', 'developer-deal'), ('other-board', 'other-revision', 'other-deal');
				INSERT INTO auction_call VALUES ('developer-auction', 'developer-board'), ('other-auction', 'other-board');
				INSERT INTO play_action VALUES ('developer-play', 'developer-board'), ('other-play', 'other-board');
				INSERT INTO board_score VALUES ('developer-score', 'developer-board'), ('other-score', 'other-board');
				INSERT INTO evaluation_run VALUES ('developer-run', 'developer-board'), ('other-run', 'other-board');
				INSERT INTO rule_evaluation VALUES ('developer-evaluation', 'developer-run'), ('other-evaluation', 'other-run');
				INSERT INTO rule_evaluation_override VALUES ('developer-override', 'developer-evaluation', 'developer'), ('other-override', 'other-evaluation', 'other');
				INSERT INTO double_dummy_result VALUES ('developer-double-dummy', 'developer-board'), ('other-double-dummy', 'other-board');
			`);

			const preview = extractPreviewUserData(
				{
					query(sql) {
						return {
							all: (...parameters) =>
								database.prepare(sql).all(...(parameters as SQLInputValue[])),
						};
					},
				},
				"developer@example.test"
			);

			expect(preview.r2Keys).toEqual(["developer/daily/source.json"]);
			expect(preview.sql).toContain("developer-account");
			expect(preview.sql).toContain("developer-double-dummy");
			expect(preview.sql).not.toContain("other-account");
			expect(preview.sql).not.toContain("developer-session");
			expect(preview.sql).not.toContain("developer-verification");
		} finally {
			database.close();
		}
	});

	it("imports related rows without firing production triggers and rearms them", async () => {
		const miniflare = new Miniflare({
			cf: false,
			compatibilityDate: "2026-04-08",
			d1Databases: ["DB"],
			modules: true,
			script: "export default { fetch() { return new Response('ok'); } }",
		});
		miniflares.push(miniflare);
		const database = await miniflare.getD1Database("DB");
		await database.exec(`
			CREATE TABLE parent (id INTEGER PRIMARY KEY);
			CREATE TABLE child (id INTEGER PRIMARY KEY, parent_id INTEGER NOT NULL REFERENCES parent(id));
			CREATE TABLE audit (child_id INTEGER NOT NULL);
			CREATE TRIGGER child_audit AFTER INSERT ON child BEGIN INSERT INTO audit VALUES (NEW.id); END;
		`);

		await restorePreviewData(
			{
				execute: (sql) => database.exec(sql).then(() => undefined),
				async listTriggers() {
					const result = await database
						.prepare(
							"SELECT name, sql FROM sqlite_master WHERE type = 'trigger' AND sql IS NOT NULL"
						)
						.all<{ name: string; sql: string }>();
					return result.results;
				},
			},
			`INSERT INTO child VALUES (2, 1);
			 INSERT INTO parent VALUES (1);
			 INSERT INTO d1_migrations VALUES (1, '0000_initial.sql', 0);`
		);

		expect(await database.prepare("SELECT * FROM child").first()).toEqual({
			id: 2,
			parent_id: 1,
		});
		expect(await database.prepare("SELECT * FROM audit").all()).toMatchObject({
			results: [],
		});
		await database.prepare("INSERT INTO child VALUES (3, 1)").run();
		expect(await database.prepare("SELECT * FROM audit").first()).toEqual({
			child_id: 3,
		});
	});

	it("restores triggers after a failed import", async () => {
		const execute = vi
			.fn<(sql: string) => Promise<void>>()
			.mockResolvedValueOnce()
			.mockRejectedValueOnce(new Error("import failed"))
			.mockResolvedValueOnce();

		await expect(
			restorePreviewData(
				{
					execute,
					listTriggers: () =>
						Promise.resolve([
							{
								name: "audit",
								sql: "CREATE TRIGGER audit AFTER INSERT ON x BEGIN SELECT 1; END",
							},
						]),
				},
				"INSERT INTO x VALUES (1);"
			)
		).rejects.toThrow("import failed");
		expect(execute).toHaveBeenCalledTimes(3);
		expect(execute.mock.calls[2]?.[0]).toContain("CREATE TRIGGER audit");
	});

	it("reports both import and trigger restoration failures", async () => {
		const execute = vi
			.fn<(sql: string) => Promise<void>>()
			.mockResolvedValueOnce()
			.mockRejectedValueOnce(new Error("import failed"))
			.mockRejectedValueOnce(new Error("rearm failed"));

		const restoration = restorePreviewData(
			{
				execute,
				listTriggers: () =>
					Promise.resolve([
						{
							name: "audit",
							sql: "CREATE TRIGGER audit AFTER INSERT ON x BEGIN SELECT 1; END",
						},
					]),
			},
			"INSERT INTO x VALUES (1);"
		);

		await expect(restoration).rejects.toMatchObject({
			errors: [new Error("import failed"), new Error("rearm failed")],
		});
		expect(execute).toHaveBeenCalledTimes(3);
	});

	it("treats an empty migration-only dump as a no-op", () => {
		expect(
			prepareDataDump("-- data\nINSERT INTO d1_migrations VALUES (1, 'x', 0);")
		).toBe("");
	});

	it("replaces an exported foreign-key disable pragma with deferred checks", () => {
		const dump = prepareDataDump(
			"PRAGMA foreign_keys=OFF;\nINSERT INTO parent VALUES (1);"
		);
		expect(dump).not.toContain("foreign_keys=OFF");
		expect(dump).toContain("PRAGMA defer_foreign_keys = true;");
	});
});

describe("preview D1 migration staging", () => {
	it("stages only migrations newer than production and restores them", async () => {
		const root = await mkdtemp(path.join(tmpdir(), "preview-migrations-"));
		const migrations = path.join(root, "migrations");
		const stash = path.join(root, "stash");
		const { mkdir, rm } = await import("node:fs/promises");
		await mkdir(migrations);
		await writeFile(path.join(migrations, "0000_base.sql"), "SELECT 1;");
		await writeFile(path.join(migrations, "0001_new.sql"), "SELECT 2;");

		try {
			expect(
				await stageUnreleasedMigrations({
					lastApplied: "0000_base.sql",
					migrationsDirectory: migrations,
					stashDirectory: stash,
				})
			).toEqual(["0001_new.sql"]);
			expect(
				await readFile(path.join(migrations, "0000_base.sql"), "utf8")
			).toBe("SELECT 1;");
			expect(await restoreStagedMigrations(migrations, stash)).toEqual([
				"0001_new.sql",
			]);
			expect(
				await readFile(path.join(migrations, "0001_new.sql"), "utf8")
			).toBe("SELECT 2;");
		} finally {
			await rm(root, { force: true, recursive: true });
		}
	});
});

describe("renderTriggerSql", () => {
	it("uses idempotent drops before recreated trigger DDL", () => {
		expect(
			renderTriggerSql([
				{
					name: "sync",
					sql: "CREATE TRIGGER sync AFTER INSERT ON x BEGIN SELECT 1; END;",
				},
			]).rearm
		).toBe(
			"DROP TRIGGER IF EXISTS `sync`;\nCREATE TRIGGER sync AFTER INSERT ON x BEGIN SELECT 1; END;\n"
		);
	});
});
