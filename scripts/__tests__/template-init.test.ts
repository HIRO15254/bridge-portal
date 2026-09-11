import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
	initializeTemplate,
	parseTemplateInitArgs,
	replaceTemplateTokens,
} from "../template-init";

const ALREADY_INITIALIZED_PATTERN = /already been initialized/u;
const KEBAB_CASE_PATTERN = /kebab-case/u;
const TEMPLATE_DISPLAY_NAME = ["Better", "T", "App", "Template"].join(" ");
const TEMPLATE_SLUG = ["better", "t", "app", "template"].join("-");

const temporaryDirectories: string[] = [];

async function createFixture(): Promise<string> {
	const root = await mkdtemp(path.join(tmpdir(), "template-init-test-"));
	temporaryDirectories.push(root);
	await writeFile(
		path.join(root, "package.json"),
		JSON.stringify({ name: TEMPLATE_SLUG })
	);
	await writeFile(
		path.join(root, "README.md"),
		`# ${TEMPLATE_DISPLAY_NAME}\n@${TEMPLATE_SLUG}/api\n`
	);
	await writeFile(
		path.join(root, "bun.lock"),
		`"@${TEMPLATE_SLUG}/api": "workspace:*"\n`
	);
	await mkdir(path.join(root, ".agents/skills/example"), { recursive: true });
	await writeFile(
		path.join(root, ".agents/skills/example/SKILL.md"),
		`# ${TEMPLATE_DISPLAY_NAME}\nUse @${TEMPLATE_SLUG}/web.\n`
	);
	return root;
}

afterEach(async () => {
	const { rm } = await import("node:fs/promises");
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true }))
	);
});

describe("parseTemplateInitArgs", () => {
	it("accepts a slug, display name, and dry-run flag", () => {
		expect(
			parseTemplateInitArgs([
				"my-app",
				"--display-name",
				"My Application",
				"--dry-run",
			])
		).toEqual({
			displayName: "My Application",
			dryRun: true,
			slug: "my-app",
		});
	});

	it.each([
		{ args: [] },
		{ args: ["My-App"] },
		{ args: ["my_app"] },
		{ args: ["-my-app"] },
		{ args: ["my-app-"] },
	])("rejects invalid slug arguments: $args", ({ args }) => {
		expect(() => parseTemplateInitArgs(args)).toThrow(KEBAB_CASE_PATTERN);
	});
});

describe("replaceTemplateTokens", () => {
	it("replaces the valid package scope and display name", () => {
		expect(
			replaceTemplateTokens(
				`${TEMPLATE_DISPLAY_NAME} uses @${TEMPLATE_SLUG}/api`,
				{
					displayName: "Acme App",
					slug: "acme-app",
				}
			)
		).toBe("Acme App uses @acme-app/api");
	});
});

describe("initializeTemplate", () => {
	it("reports changes without writing in dry-run mode", async () => {
		const root = await createFixture();
		const changed = await initializeTemplate(root, {
			displayName: "Acme App",
			dryRun: true,
			slug: "acme-app",
		});

		expect(changed).toEqual([
			".agents/skills/example/SKILL.md",
			"README.md",
			"bun.lock",
			"package.json",
		]);
		expect(await readFile(path.join(root, "package.json"), "utf8")).toContain(
			TEMPLATE_SLUG
		);
	});

	it("updates every template token in text files", async () => {
		const root = await createFixture();
		await initializeTemplate(root, {
			displayName: "Acme App",
			dryRun: false,
			slug: "acme-app",
		});

		expect(await readFile(path.join(root, "README.md"), "utf8")).toBe(
			"# Acme App\n@acme-app/api\n"
		);
		expect(await readFile(path.join(root, "package.json"), "utf8")).toContain(
			"acme-app"
		);
		expect(await readFile(path.join(root, "bun.lock"), "utf8")).not.toContain(
			TEMPLATE_SLUG
		);
		expect(
			await readFile(path.join(root, ".agents/skills/example/SKILL.md"), "utf8")
		).toBe("# Acme App\nUse @acme-app/web.\n");
	});

	it("rejects a second initialization", async () => {
		const root = await createFixture();
		await writeFile(
			path.join(root, "package.json"),
			JSON.stringify({ name: "acme-app" })
		);

		await expect(
			initializeTemplate(root, {
				displayName: "Another App",
				dryRun: false,
				slug: "another-app",
			})
		).rejects.toThrow(ALREADY_INITIALIZED_PATTERN);
	});
});
