#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const [family, inputName, outputName] = process.argv.slice(2);
if (!(["SERIES", "DAILY"].includes(family) && inputName && outputName)) {
	console.error(
		"Usage: node build-archive-index.mjs <SERIES|DAILY> <capture.json> <output.json>"
	);
	process.exit(2);
}

const input = JSON.parse(fs.readFileSync(path.resolve(inputName), "utf8"));
if (!Array.isArray(input.rows)) {
	throw new Error("Capture must contain archive rows");
}
const scoreType = (sourceType) => {
	if (sourceType === 1) {
		return "MP";
	}
	if (sourceType === 2) {
		return "IMP";
	}
	throw new Error(`Unrecognized Funbridge resultType ${sourceType}`);
};
const score = (sourceValue, type) =>
	type === "MP" ? sourceValue * 100 : sourceValue;
const date = (epoch) => {
	if (!Number.isFinite(epoch)) {
		throw new Error("Invalid source date");
	}
	return new Date(epoch).toISOString();
};

function seriesRow(row) {
	const [periodStart, periodEnd] = (row.periodID ?? "").split(";").map(Number);
	if (!(Number.isFinite(periodStart) && Number.isFinite(periodEnd))) {
		throw new Error(`Series ${row.tournamentID} has no valid period`);
	}
	const type = scoreType(row.resultType);
	const inProgress = !row.finished;
	return {
		sourceTournamentId: String(row.tournamentID),
		title: row.name,
		lastPlayedAt: date(row.date),
		registeredPlayerCount: row.nbPlayers,
		inProgress,
		scoreType: type,
		...(inProgress ? {} : { score: score(row.result, type), rank: row.rank }),
		boardCount: row.countDeal,
		playedBoardCount: row.listPlayedDeals.length,
		series: {
			level: row.name,
			periodStartAt: date(periodStart),
			periodEndAt: date(periodEnd),
		},
	};
}

function dailyRow(row) {
	const type = scoreType(row.resultType);
	if (!row.finished || row.rank < 1) {
		throw new Error(`Daily ${row.tournamentID} is not a finished result`);
	}
	return {
		sourceTournamentId: String(row.tournamentID),
		title: row.name,
		startDate: date(row.date),
		registeredPlayerCount: row.nbPlayers,
		inProgress: false,
		scoreType: type,
		score: score(row.result, type),
		rank: row.rank,
		boardCount: row.countDeal,
		daily: { region: row.name },
	};
}

const tournaments = input.rows.map(family === "SERIES" ? seriesRow : dailyRow);
const ids = tournaments.map((row) => row.sourceTournamentId);
if (new Set(ids).size !== ids.length) {
	throw new Error("Duplicate source tournament IDs");
}
const complete = input.offset === 0 && input.totalSize === tournaments.length;
const index = {
	format: "FUNBRIDGE_HISTORY_INDEX",
	formatVersion: 1,
	capturedAt: new Date().toISOString(),
	source: {
		platform: "FUNBRIDGE_WEB",
		captureMode: "NETWORK_RESPONSE",
		locale: "ja-JP",
	},
	family,
	coverage: {
		scope: complete ? "FULL" : "VISIBLE_WINDOW",
		totalCount: input.totalSize,
		rowCount: tournaments.length,
	},
	tournaments,
};
fs.mkdirSync(path.dirname(path.resolve(outputName)), { recursive: true });
fs.writeFileSync(
	path.resolve(outputName),
	`${JSON.stringify(index, null, 2)}\n`
);
console.log(`Built ${family} index with ${tournaments.length} rows`);
