import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { applyD1Migrations } from "../d1-migrate";

const roots: string[] = [];

async function createRoot(sql?: string): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "d1-migrate-test-"));
	roots.push(root);
	await mkdir(path.join(root, "packages/db/src/migrations"), {
		recursive: true,
	});
	await mkdir(path.join(root, "apps/server"), { recursive: true });
	await writeFile(
		path.join(root, "apps/server/wrangler.jsonc"),
		JSON.stringify({ d1_databases: [{ database_name: "example-db" }] })
	);
	if (sql) {
		await writeFile(
			path.join(root, "packages/db/src/migrations/0000_first.sql"),
			sql
		);
	}
	return root;
}

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true }))
	);
});

describe("D1 migration runner", () => {
	test("accepts an empty migration directory", async () => {
		const spawn = vi.fn();
		expect(
			await applyD1Migrations(await createRoot(), "local", spawn as never)
		).toBe(false);
		expect(spawn).not.toHaveBeenCalled();
	});

	test("applies SQL migrations to the selected target", async () => {
		const spawn = vi.fn(() => ({ exited: Promise.resolve(0) }));
		const root = await createRoot("CREATE TABLE example (id INTEGER);");
		expect(await applyD1Migrations(root, "remote", spawn as never)).toBe(true);
		expect(spawn).toHaveBeenCalledWith(
			expect.arrayContaining(["DB", "--remote"]),
			expect.objectContaining({ cwd: root })
		);
	});
});
