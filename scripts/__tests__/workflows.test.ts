import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "../..");

function readWorkflow(name: string): Promise<string> {
	return readFile(path.join(root, ".github/workflows", name), "utf8");
}

describe("Cloudflare preview workflows", () => {
	it("skips fork previews and snapshots only newly created PR databases", async () => {
		const workflow = await readWorkflow("preview-deploy.yml");
		expect(workflow).toContain(
			"github.event.pull_request.head.repo.full_name == github.repository"
		);
		expect(workflow).toContain('if [ "$IS_NEW" = "true" ]; then');
		expect(workflow).toContain("apply_preview_migrations");
		expect(workflow.lastIndexOf("apply_preview_migrations")).toBeGreaterThan(
			workflow.indexOf('if [ "$IS_NEW" = "true" ]; then')
		);
	});

	it("keeps PR cleanup safe to repeat", async () => {
		const workflow = await readWorkflow("preview-cleanup.yml");
		expect(workflow).toContain('test "$status" = 200 -o "$status" = 404');
		expect(workflow).toContain('if [ "$status" = 404 ]; then');
		expect(workflow).toContain('if [ -n "$database_id" ]; then');
	});
});
