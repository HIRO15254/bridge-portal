#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "funbridge-export");
const families = {
	"bp-circuit": "BP_CIRCUIT",
	series: "SERIES",
	daily: "DAILY",
};
const report = {
	indexRows: 0,
	detailFiles: 0,
	boards: 0,
	byFamily: {},
	withoutResults: [],
};
for (const [directory, family] of Object.entries(families)) {
	const folder = path.join(root, directory);
	const names = fs.readdirSync(folder).filter((name) => name.endsWith(".json"));
	const indexFiles = names.filter((name) => name.startsWith("history-index-"));
	if (indexFiles.length !== 1) {
		throw new Error(`${directory}: expected one history index`);
	}
	const index = JSON.parse(
		fs.readFileSync(path.join(folder, indexFiles[0]), "utf8")
	);
	if (
		index.family !== family ||
		index.coverage.scope !== "FULL" ||
		index.tournaments.length !== index.coverage.totalCount
	) {
		throw new Error(`${directory}: history index is incomplete`);
	}
	const rows = index.tournaments;
	const details = names
		.filter((name) => !name.startsWith("history-index-"))
		.map((name) =>
			JSON.parse(fs.readFileSync(path.join(folder, name), "utf8"))
		);
	const byId = new Map();
	for (const detail of details) {
		if (detail.tournament.family !== family) {
			throw new Error(`${directory}: detail family mismatch`);
		}
		if (byId.has(detail.source.sourceTournamentId)) {
			throw new Error(`${directory}: duplicate detail source ID`);
		}
		byId.set(detail.source.sourceTournamentId, detail);
		const captured = detail.boards.length + (detail.partialBoards?.length ?? 0);
		if (captured !== detail.tournament.playedBoardCount) {
			throw new Error(
				`${directory}/${detail.source.sourceTournamentId}: played board mismatch`
			);
		}
		report.boards += captured;
	}
	for (const row of rows) {
		const hits = details.filter(
			(detail) =>
				detail.source.sourceTournamentId === row.sourceTournamentId ||
				detail.source.sourceParentTournamentId === row.sourceTournamentId
		);
		if (hits.length > 1) {
			throw new Error(
				`${directory}/${row.sourceTournamentId}: ambiguous index mapping`
			);
		}
		if (!hits.length) {
			report.withoutResults.push({
				family,
				sourceTournamentId: row.sourceTournamentId,
				title: row.title,
			});
		}
	}
	report.indexRows += rows.length;
	report.detailFiles += details.length;
	report.byFamily[family] = {
		indexRows: rows.length,
		detailFiles: details.length,
		boards: details.reduce(
			(sum, detail) => sum + detail.tournament.playedBoardCount,
			0
		),
	};
}
console.log(JSON.stringify(report, null, 2));
