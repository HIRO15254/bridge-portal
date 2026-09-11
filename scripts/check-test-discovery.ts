import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Glob, spawn } from "bun";

const root = path.resolve(import.meta.dirname, "..");
const child = spawn(
	[process.execPath, "x", "vitest", "list", "--filesOnly", "--json"],
	{ cwd: root, stdout: "pipe", stderr: "inherit" }
);
const output = await new Response(child.stdout).text();
if ((await child.exited) !== 0) {
	throw new Error("Vitest discovery failed");
}

const discovered = JSON.parse(output) as Array<{
	file: string;
	projectName: string;
}>;
const assignments = new Map<string, string[]>();
for (const entry of discovered) {
	const file = path.relative(root, entry.file).replaceAll("\\", "/");
	assignments.set(file, [...(assignments.get(file) ?? []), entry.projectName]);
}

const errors: string[] = [];
for await (const file of new Glob(
	"{apps,packages,scripts}/**/*.{test,spec}.{ts,tsx}"
).scan(root)) {
	const normalizedFile = file.replaceAll("\\", "/");
	if (normalizedFile.split("/").includes("node_modules")) {
		continue;
	}
	const projects = assignments.get(normalizedFile) ?? [];
	if (projects.length !== 1) {
		errors.push(
			`${normalizedFile}: expected one Vitest project, found ${projects.join(", ") || "none"}`
		);
	}
}

await mkdir(path.join(root, "test-results"), { recursive: true });
await writeFile(
	path.join(root, "test-results/discovery.json"),
	JSON.stringify(discovered, null, 2)
);
if (errors.length > 0) {
	throw new Error(errors.join("\n"));
}
console.log(`Discovery: ${discovered.length} files, no missing assignments.`);
