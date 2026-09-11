import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
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
