#!/usr/bin/env node
// Re-project an already-curated v1 file through its JSON Schema allowlist.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const retainStandings = args.includes("--retain-standings");
const files = args.filter((arg) => !arg.startsWith("--"));
if (files.length < 1 || files.length > 2) {
	console.error(
		"Usage: node curate-export.mjs <input.json> [output.json] [--retain-standings]"
	);
	process.exit(2);
}
const input = path.resolve(files[0]);
const output = path.resolve(files[1] ?? files[0]);
const data = JSON.parse(fs.readFileSync(input, "utf8"));
const schemaNames = {
	FUNBRIDGE_EXPORT: "tournament.schema.json",
	FUNBRIDGE_HISTORY_INDEX: "history-index.schema.json",
};
const schemaName = schemaNames[data.format];
if (!schemaName) {
	throw new Error(`Unsupported format ${data.format}`);
}
const schema = JSON.parse(
	fs.readFileSync(
		path.join(
			path.dirname(fileURLToPath(import.meta.url)),
			"../schemas",
			schemaName
		),
		"utf8"
	)
);
function resolve(rule) {
	if (rule?.$ref) {
		return resolve(schema.$defs[rule.$ref.split("/").at(-1)]);
	}
	return rule;
}
function project(value, originalRule, key = "") {
	if (value === undefined) {
		return undefined;
	}
	const rule = resolve(originalRule);
	if (Array.isArray(value)) {
		let items = rule?.items;
		if (key === "tournaments" && data.format === "FUNBRIDGE_HISTORY_INDEX") {
			const rows = {
				BP_CIRCUIT: "bpRow",
				SERIES: "seriesRow",
				DAILY: "dailyRow",
			};
			if (!rows[data.family]) {
				throw new Error(`Unknown family ${data.family}`);
			}
			items = { $ref: `#/$defs/${rows[data.family]}` };
		}
		return value.map((entry) => project(entry, items));
	}
	if (value !== null && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(rule?.properties ?? {})
				.filter(([field]) => value[field] !== undefined)
				.map(([field, property]) => [
					field,
					project(value[field], property, field),
				])
				.filter(([, projected]) => projected !== undefined)
		);
	}
	if (key === "rawScore" && value === -32_000) {
		return undefined;
	}
	return value;
}
const curated = project(data, schema);
if (data.format === "FUNBRIDGE_EXPORT" && !retainStandings) {
	curated.standings = undefined;
	curated.standingsCoverage = {
		scope: "NONE",
		totalCount:
			data.standingsCoverage?.totalCount ??
			data.tournament?.participantCount ??
			0,
		rowCount: 0,
	};
}
fs.writeFileSync(output, `${JSON.stringify(curated, null, 2)}\n`);
console.log(`Curated ${data.format} to ${output}`);
