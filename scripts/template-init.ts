import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const TEMPLATE_SLUG = ["better", "t", "app", "template"].join("-");
const TEMPLATE_DISPLAY_NAME = ["Better", "T", "App", "Template"].join(" ");
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PATH_SEPARATOR_PATTERN = /[\\/]/;
const TEXT_EXTENSIONS = new Set([
	"",
	".css",
	".html",
	".json",
	".jsonc",
	".lock",
	".md",
	".sql",
	".toml",
	".ts",
	".tsx",
	".yaml",
	".yml",
]);
const IGNORED_SEGMENTS = new Set([
	".git",
	".wrangler",
	"coverage",
	"dist",
	"node_modules",
	"playwright-report",
	"test-results",
]);

export interface TemplateInitOptions {
	displayName: string;
	dryRun: boolean;
	slug: string;
}

function defaultDisplayName(slug: string): string {
	return slug
		.split("-")
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join(" ");
}

export function parseTemplateInitArgs(args: string[]): TemplateInitOptions {
	let displayName: string | undefined;
	let dryRun = false;
	let slug: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === "--dry-run") {
			dryRun = true;
			continue;
		}
		if (argument === "--display-name") {
			displayName = args[index + 1];
			index += 1;
			continue;
		}
		if (argument?.startsWith("--")) {
			throw new Error(`Unknown option: ${argument}`);
		}
		if (slug) {
			throw new Error("Only one project slug may be provided");
		}
		slug = argument;
	}

	if (!(slug && SLUG_PATTERN.test(slug))) {
		throw new Error(
			"Project slug must be kebab-case using lowercase letters and numbers"
		);
	}
	if (displayName !== undefined && displayName.trim().length === 0) {
		throw new Error("Display name must not be empty");
	}

	return {
		displayName: displayName?.trim() ?? defaultDisplayName(slug),
		dryRun,
		slug,
	};
}

export function replaceTemplateTokens(
	contents: string,
	options: Pick<TemplateInitOptions, "displayName" | "slug">
): string {
	return contents
		.replaceAll(TEMPLATE_DISPLAY_NAME, options.displayName)
		.replaceAll(TEMPLATE_SLUG, options.slug);
}

function isTextFile(file: string): boolean {
	const segments = file.split(PATH_SEPARATOR_PATTERN);
	return (
		!segments.some((segment) => IGNORED_SEGMENTS.has(segment)) &&
		TEXT_EXTENSIONS.has(path.extname(file))
	);
}

async function listFiles(root: string, directory = ""): Promise<string[]> {
	const entries = await readdir(path.join(root, directory), {
		withFileTypes: true,
	});
	const files: string[] = [];
	for (const entry of entries) {
		const file = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			if (!IGNORED_SEGMENTS.has(entry.name)) {
				files.push(...(await listFiles(root, file)));
			}
			continue;
		}
		if (entry.isFile()) {
			files.push(file);
		}
	}
	return files;
}

export async function initializeTemplate(
	root: string,
	options: TemplateInitOptions
): Promise<string[]> {
	const packageJsonPath = path.join(root, "package.json");
	const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
		name?: string;
	};
	if (packageJson.name !== TEMPLATE_SLUG) {
		throw new Error("This repository has already been initialized");
	}

	const changedFiles: string[] = [];
	for (const file of await listFiles(root)) {
		if (!isTextFile(file)) {
			continue;
		}
		const absolutePath = path.join(root, file);
		const contents = await readFile(absolutePath, "utf8");
		const updated = replaceTemplateTokens(contents, options);
		if (updated === contents) {
			continue;
		}
		changedFiles.push(file.replaceAll("\\", "/"));
		if (!options.dryRun) {
			await writeFile(absolutePath, updated);
		}
	}

	return changedFiles.sort();
}

async function main(): Promise<void> {
	const options = parseTemplateInitArgs(Bun.argv.slice(2));
	const changedFiles = await initializeTemplate(process.cwd(), options);
	const verb = options.dryRun ? "Would update" : "Updated";
	console.log(`${verb} ${changedFiles.length} files for ${options.slug}.`);
	for (const file of changedFiles) {
		console.log(`- ${file}`);
	}
}

if (import.meta.main) {
	await main();
}
