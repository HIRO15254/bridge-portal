import { readFile } from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

const migrationsDirectory = path.resolve(
	import.meta.dirname,
	"../../packages/db/src/migrations"
);

async function applyMigration(db: DatabaseSync, name: string) {
	const sql = await readFile(path.join(migrationsDirectory, name), "utf8");
	db.exec(sql.replaceAll("--> statement-breakpoint", ""));
}

describe("published System Version immutability", () => {
	it("rejects database updates and deletes after publication", async () => {
		const db = new DatabaseSync(":memory:");
		await applyMigration(db, "0000_slimy_night_nurse.sql");
		await applyMigration(db, "0001_young_stepford_cuckoos.sql");
		await applyMigration(db, "0002_immutable_system_versions.sql");
		db.exec(`
			insert into user (id, name, email) values ('user-1', 'User', 'user@example.test');
			insert into bridge_system (id, user_id, name) values ('system-1', 'user-1', 'Standard');
			insert into system_version (
				id, system_id, version_number, name, ruleset_version,
				adopted_official_item_ids, selected_variants, settings, published_at
			) values (
				'version-1', 'system-1', 1, 'Standard', 'JCBL_LIST_A_2026_05_01',
				'[]', '{}', '{}', 1
			);
		`);

		expect(() =>
			db.exec(
				"update system_version set name = 'Changed' where id = 'version-1'"
			)
		).toThrow("published system versions are immutable");
		expect(() =>
			db.exec("delete from system_version where id = 'version-1'")
		).toThrow("published system versions are immutable");
		db.close();
	});
});
