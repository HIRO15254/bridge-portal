#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const SEATS = ["N", "E", "S", "W"];
const FAMILIES = ["BP_CIRCUIT", "SERIES", "DAILY"];
const SCORE_TYPES = ["MP", "IMP"];
const COMPLETIONS = ["COMPLETED", "IN_PROGRESS", "ABANDONED"];
const VULNERABILITIES = ["None", "NS", "EW", "Both"];
const HAND_RE = /^[AKQJT2-9]*\.[AKQJT2-9]*\.[AKQJT2-9]*\.[AKQJT2-9]*$/;
const CARD_RE = /^[SHDC][AKQJT2-9]$/;
const CONTRACT_RE = /^[1-7](?:[SHDC]|NT)(?:XX|X)?$/;
const CALL_RE = /^(?:PASS|X|XX|[1-7](?:[SHDC]|NT))$/;
const CLAIM_RE = /^![NESW](?:1[0-3]|[0-9])$/;

const failures = [];
const warnings = [];
const schemaDirectory = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	"../schemas"
);
const ajv = new Ajv2020({
	allErrors: true,
	strict: true,
	strictRequired: false,
});
addFormats(ajv);
const validateTournamentSchema = ajv.compile(
	JSON.parse(
		fs.readFileSync(
			path.join(schemaDirectory, "tournament.schema.json"),
			"utf8"
		)
	)
);
const validateHistorySchema = ajv.compile(
	JSON.parse(
		fs.readFileSync(
			path.join(schemaDirectory, "history-index.schema.json"),
			"utf8"
		)
	)
);

function checkSchema(file, data, validate) {
	if (validate(data)) {
		return;
	}
	for (const issue of validate.errors ?? []) {
		fail(
			file,
			issue.instancePath || "$",
			`${issue.message} (${issue.schemaPath})`
		);
	}
}

function fail(file, pointer, message) {
	failures.push(`${file}:${pointer}: ${message}`);
}

function warn(file, pointer, message) {
	warnings.push(`${file}:${pointer}: ${message}`);
}

function isObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function expect(file, pointer, condition, message) {
	if (!condition) {
		fail(file, pointer, message);
	}
	return condition;
}

function cardsFromHand(hand) {
	const suits = ["S", "H", "D", "C"];
	return hand
		.split(".")
		.flatMap((ranks, index) =>
			[...ranks].map((rank) => `${suits[index]}${rank}`)
		);
}

function validateCoverage(file, pointer, coverage, rows) {
	if (coverage === undefined) {
		return;
	}
	if (!expect(file, pointer, isObject(coverage), "must be an object")) {
		return;
	}
	expect(
		file,
		`${pointer}.scope`,
		["NONE", "VISIBLE_WINDOW", "FULL"].includes(coverage.scope),
		"scope must be NONE, VISIBLE_WINDOW, or FULL"
	);
	if (coverage.rowCount !== undefined) {
		expect(
			file,
			`${pointer}.rowCount`,
			Number.isInteger(coverage.rowCount) && coverage.rowCount >= 0,
			"must be a non-negative integer"
		);
		if (Array.isArray(rows) && coverage.rowCount !== rows.length) {
			fail(
				file,
				`${pointer}.rowCount`,
				`does not match row array length ${rows.length}`
			);
		}
	}
	if (
		coverage.scope === "FULL" &&
		Number.isInteger(coverage.totalCount) &&
		Array.isArray(rows)
	) {
		expect(
			file,
			pointer,
			coverage.totalCount === rows.length,
			"FULL coverage must match totalCount"
		);
	}
}

function validatePlayer(file, pointer, player) {
	if (!expect(file, pointer, isObject(player), "must be an object")) {
		return;
	}
	expect(
		file,
		`${pointer}.displayName`,
		typeof player.displayName === "string" &&
			player.displayName.trim().length > 0,
		"must be a non-empty string"
	);
	if (player.funbridgeId !== undefined) {
		expect(
			file,
			`${pointer}.funbridgeId`,
			typeof player.funbridgeId === "string" &&
				player.funbridgeId.trim().length > 0,
			"must be a non-empty string"
		);
	}
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Keep the existing comparison checks together for precise field errors and aggregate reconciliation.
function validateComparison(file, pointer, comparison) {
	if (comparison === undefined) {
		return;
	}
	if (!expect(file, pointer, isObject(comparison), "must be an object")) {
		return;
	}
	if (comparison.scoreType !== undefined) {
		expect(
			file,
			`${pointer}.scoreType`,
			SCORE_TYPES.includes(comparison.scoreType),
			"must be MP or IMP"
		);
	}
	if (comparison.lead !== undefined) {
		expect(
			file,
			`${pointer}.lead`,
			CARD_RE.test(comparison.lead),
			"must be a suit-first card"
		);
	}
	if (comparison.contractGroups !== undefined) {
		expect(
			file,
			`${pointer}.contractGroups`,
			Array.isArray(comparison.contractGroups),
			"must be an array"
		);
		for (const [index, group] of (comparison.contractGroups ?? []).entries()) {
			const groupPointer = `${pointer}.contractGroups[${index}]`;
			if (!expect(file, groupPointer, isObject(group), "must be an object")) {
				continue;
			}
			if (group.contract !== undefined) {
				expect(
					file,
					`${groupPointer}.contract`,
					CONTRACT_RE.test(group.contract),
					"has invalid contract"
				);
			}
			if (group.declarer !== undefined) {
				expect(
					file,
					`${groupPointer}.declarer`,
					SEATS.includes(group.declarer),
					"has invalid seat"
				);
			}
			if (group.lead !== undefined) {
				expect(
					file,
					`${groupPointer}.lead`,
					CARD_RE.test(group.lead),
					"has invalid lead card"
				);
			}
			expect(
				file,
				`${groupPointer}.playerCount`,
				Number.isInteger(group.playerCount) && group.playerCount >= 1,
				"must be a positive integer"
			);
		}
	}
	if (comparison.contractGroupCoverage !== undefined) {
		expect(
			file,
			`${pointer}.contractGroupCoverage`,
			["NONE", "VISIBLE_WINDOW", "FULL"].includes(
				comparison.contractGroupCoverage
			),
			"has invalid coverage"
		);
		const groupedCount = (comparison.contractGroups ?? []).reduce(
			(sum, group) => sum + (group.playerCount ?? 0),
			(comparison.unclassifiedPlayerCount ?? 0) +
				(comparison.passedOutPlayerCount ?? 0)
		);
		if (comparison.contractGroupRows !== undefined) {
			expect(
				file,
				`${pointer}.contractGroupRows.participantSum`,
				groupedCount === comparison.contractGroupRows.participantSum,
				"must equal normalized group participant sum"
			);
			if (
				comparison.contractGroupCoverage === "FULL" &&
				comparison.contractGroupRows.sourceTotalCount !== undefined
			) {
				expect(
					file,
					`${pointer}.contractGroupRows.rowCount`,
					comparison.contractGroupRows.rowCount ===
						comparison.contractGroupRows.sourceTotalCount,
					"FULL rows must match source total"
				);
			}
		}
		if (comparison.contractGroupIntegrity === "RECONCILED") {
			expect(
				file,
				`${pointer}.contractGroupIntegrity`,
				groupedCount === comparison.participantCount,
				"RECONCILED groups must match participantCount"
			);
		}
		if (comparison.contractGroupIntegrity === "MISMATCH") {
			expect(
				file,
				`${pointer}.contractGroupIntegrity`,
				groupedCount !== comparison.participantCount,
				"MISMATCH groups must differ from participantCount"
			);
		}
		if (comparison.contractGroupCoverage === "FULL") {
			expect(
				file,
				`${pointer}.contractGroupCoverage`,
				comparison.contractGroupIntegrity !== "UNKNOWN",
				"FULL coverage requires known integrity"
			);
		} else if (comparison.contractGroupCoverage === "VISIBLE_WINDOW") {
			expect(
				file,
				`${pointer}.contractGroupCoverage`,
				groupedCount <= comparison.participantCount,
				"captured groups exceed participantCount"
			);
		}
	}
	if (comparison.playerResults !== undefined) {
		expect(
			file,
			`${pointer}.playerResults`,
			Array.isArray(comparison.playerResults),
			"must be an array"
		);
		for (const [index, row] of (comparison.playerResults ?? []).entries()) {
			validatePlayer(
				file,
				`${pointer}.playerResults[${index}].player`,
				row?.player
			);
		}
	}
	validateCoverage(
		file,
		`${pointer}.playerResultsCoverage`,
		comparison.playerResultsCoverage,
		comparison.playerResults ?? []
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Deal, auction and play invariants share one board pointer for actionable errors.
function validateBoard(file, board, index, collection = "boards") {
	const pointer = `${collection}[${index}]`;
	if (!expect(file, pointer, isObject(board), "must be an object")) {
		return;
	}
	expect(
		file,
		`${pointer}.boardNumber`,
		Number.isInteger(board.boardNumber) && board.boardNumber >= 1,
		"must be a positive integer"
	);
	expect(
		file,
		`${pointer}.dealer`,
		SEATS.includes(board.dealer),
		"has invalid dealer"
	);
	expect(
		file,
		`${pointer}.vulnerability`,
		VULNERABILITIES.includes(board.vulnerability),
		"has invalid vulnerability"
	);
	if (
		!expect(
			file,
			`${pointer}.hands`,
			isObject(board.hands),
			"must be an object"
		)
	) {
		return;
	}

	const allCards = [];
	for (const seat of SEATS) {
		const hand = board.hands[seat];
		if (
			!expect(
				file,
				`${pointer}.hands.${seat}`,
				typeof hand === "string" && HAND_RE.test(hand),
				"must use S.H.D.C notation"
			)
		) {
			continue;
		}
		const cards = cardsFromHand(hand);
		expect(
			file,
			`${pointer}.hands.${seat}`,
			cards.length === 13,
			"must contain 13 cards"
		);
		allCards.push(...cards);
	}
	expect(
		file,
		`${pointer}.hands`,
		allCards.length === 52 && new Set(allCards).size === 52,
		"must contain 52 unique cards"
	);

	if (board.heroSeat !== undefined) {
		expect(
			file,
			`${pointer}.heroSeat`,
			SEATS.includes(board.heroSeat),
			"has invalid seat"
		);
	}
	if (board.contract !== undefined) {
		expect(
			file,
			`${pointer}.contract`,
			CONTRACT_RE.test(board.contract),
			"has invalid contract"
		);
	}
	if (board.declarer !== undefined) {
		expect(
			file,
			`${pointer}.declarer`,
			SEATS.includes(board.declarer),
			"has invalid seat"
		);
	}

	for (const key of ["auction", "play"]) {
		if (board[key] === undefined) {
			continue;
		}
		if (
			!expect(
				file,
				`${pointer}.${key}`,
				Array.isArray(board[key]),
				"must be an array"
			)
		) {
			continue;
		}
		board[key].forEach((action, actionIndex) => {
			expect(
				file,
				`${pointer}.${key}[${actionIndex}].index`,
				action?.index === actionIndex,
				"index must be contiguous from zero"
			);
			expect(
				file,
				`${pointer}.${key}[${actionIndex}].seat`,
				SEATS.includes(action?.seat),
				"has invalid seat"
			);
		});
	}

	if (Array.isArray(board.auction)) {
		board.auction.forEach((action, actionIndex) => {
			expect(
				file,
				`${pointer}.auction[${actionIndex}].call`,
				typeof action.call === "string" && CALL_RE.test(action.call),
				"must be PASS, X, XX, or a level-and-denomination call"
			);
			if (action.alert !== undefined) {
				expect(
					file,
					`${pointer}.auction[${actionIndex}].alert`,
					typeof action.alert === "string" && action.alert.trim().length > 0,
					"must be a non-empty string"
				);
			}
		});
	}

	if (Array.isArray(board.play)) {
		const played = new Set();
		board.play.forEach((action, actionIndex) => {
			const actionPointer = `${pointer}.play[${actionIndex}]`;
			expect(
				file,
				`${actionPointer}.card`,
				typeof action.card === "string" && CARD_RE.test(action.card),
				"has invalid card"
			);
			expect(
				file,
				`${actionPointer}.trickNumber`,
				action.trickNumber === Math.floor(actionIndex / 4) + 1,
				"does not match index"
			);
			if (played.has(action.card)) {
				fail(file, `${actionPointer}.card`, "is played more than once");
			}
			played.add(action.card);
			if (
				SEATS.includes(action.seat) &&
				typeof board.hands[action.seat] === "string"
			) {
				expect(
					file,
					`${actionPointer}.card`,
					cardsFromHand(board.hands[action.seat]).includes(action.card),
					"is not in the stated seat hand"
				);
			}
		});
		const claim = board.source?.claimMarker;
		if (claim !== undefined) {
			expect(
				file,
				`${pointer}.source.claimMarker`,
				CLAIM_RE.test(claim),
				"must be a Funbridge claim marker"
			);
		}
		if (board.play.length !== 52 && claim === undefined) {
			warn(
				file,
				`${pointer}.play`,
				`contains ${board.play.length} actions instead of 52`
			);
		}
	}

	validateComparison(file, `${pointer}.comparison`, board.comparison);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Tournament family and coverage checks are kept alongside cross-board consistency checks.
function validateTournamentExport(file, data) {
	expect(
		file,
		"format",
		data.format === "FUNBRIDGE_EXPORT",
		"must be FUNBRIDGE_EXPORT"
	);
	expect(file, "formatVersion", data.formatVersion === 1, "must be 1");
	if (
		!expect(file, "tournament", isObject(data.tournament), "must be an object")
	) {
		return;
	}
	const tournament = data.tournament;
	expect(
		file,
		"tournament.id",
		typeof tournament.id === "string" && tournament.id.trim().length > 0,
		"must be a non-empty string"
	);
	expect(
		file,
		"tournament.funbridgeId",
		typeof tournament.funbridgeId === "string" &&
			tournament.funbridgeId.trim().length > 0,
		"must be a non-empty string"
	);
	expect(
		file,
		"tournament.family",
		FAMILIES.includes(tournament.family),
		"has unsupported family"
	);
	expect(
		file,
		"tournament.scoreType",
		SCORE_TYPES.includes(tournament.scoreType),
		"must be MP or IMP"
	);
	expect(
		file,
		"tournament.completion",
		COMPLETIONS.includes(tournament.completion),
		"has invalid completion"
	);
	expect(
		file,
		"tournament.playedAt",
		typeof tournament.playedAt === "string" &&
			!Number.isNaN(Date.parse(tournament.playedAt)),
		"must be an ISO date-time"
	);
	expect(
		file,
		"tournament.boardCount",
		Number.isInteger(tournament.boardCount) && tournament.boardCount >= 0,
		"must be a non-negative integer"
	);
	if (tournament.family === "BP_CIRCUIT") {
		expect(
			file,
			"tournament.bpCircuit",
			isObject(tournament.bpCircuit) &&
				typeof tournament.bpCircuit.level === "string",
			"is required with level"
		);
	}
	if (tournament.family === "DAILY") {
		expect(
			file,
			"tournament.daily",
			isObject(tournament.daily) && typeof tournament.daily.region === "string",
			"is required with region"
		);
	}
	if (tournament.family === "SERIES") {
		expect(
			file,
			"tournament.series",
			isObject(tournament.series) &&
				typeof tournament.series.level === "string" &&
				typeof tournament.series.period === "string" &&
				["PROMOTED", "MAINTAINED", "RELEGATED", "PENDING"].includes(
					tournament.series.outcome
				),
			"is required with level, period, and outcome"
		);
	}

	if (!expect(file, "boards", Array.isArray(data.boards), "must be an array")) {
		return;
	}
	if (data.partialBoards !== undefined) {
		expect(
			file,
			"partialBoards",
			Array.isArray(data.partialBoards),
			"must be an array"
		);
		(data.partialBoards ?? []).forEach((board, index) => {
			validateBoard(file, board, index, "partialBoards");
			expect(
				file,
				`partialBoards[${index}].status`,
				["NO_CONTRACT_OR_PLAY", "NO_PLAY", "PASSED_OUT"].includes(
					board?.status
				),
				"must state why the core board is unavailable"
			);
		});
	}
	const boardNumbers = [...data.boards, ...(data.partialBoards ?? [])].map(
		(board) => board?.boardNumber
	);
	expect(
		file,
		"boards",
		new Set(boardNumbers).size === boardNumbers.length,
		"contains duplicate boardNumber values"
	);
	data.boards.forEach((board, index) => {
		validateBoard(file, board, index);
	});
	if (tournament.playedBoardCount !== undefined) {
		expect(
			file,
			"tournament.playedBoardCount",
			tournament.playedBoardCount <= tournament.boardCount,
			"cannot exceed boardCount"
		);
		expect(
			file,
			"tournament.playedBoardCount",
			tournament.playedBoardCount === boardNumbers.length,
			"must equal captured played boards"
		);
	}
	if (
		tournament.playedBoardCount === undefined &&
		tournament.boardCount !== boardNumbers.length
	) {
		warn(
			file,
			"boards",
			`contains ${boardNumbers.length} captured boards while boardCount is ${tournament.boardCount}`
		);
	}

	if (data.source !== undefined) {
		expect(
			file,
			"source.captureMode",
			["SPA_UI", "NETWORK_RESPONSE", "MIXED"].includes(
				data.source?.captureMode
			),
			"must be SPA_UI, NETWORK_RESPONSE, or MIXED when source is present"
		);
	}
	if (data.standings !== undefined) {
		expect(
			file,
			"standings",
			Array.isArray(data.standings),
			"must be an array"
		);
		for (const [index, row] of (data.standings ?? []).entries()) {
			validatePlayer(file, `standings[${index}].player`, row?.player);
		}
	}
	validateCoverage(
		file,
		"standingsCoverage",
		data.standingsCoverage,
		data.standings ?? []
	);
}

function validateManifest(file, data) {
	expect(file, "formatVersion", data.formatVersion === 1, "must be 1");
	if (
		!expect(
			file,
			"tournaments",
			Array.isArray(data.tournaments),
			"must be an array"
		)
	) {
		return;
	}
	for (const [index, entry] of data.tournaments.entries()) {
		const pointer = `tournaments[${index}]`;
		expect(
			file,
			`${pointer}.path`,
			typeof entry?.path === "string" && !path.isAbsolute(entry.path),
			"must be a relative path"
		);
		if (typeof entry?.path === "string") {
			const target = path.resolve(path.dirname(file), entry.path);
			expect(
				file,
				`${pointer}.path`,
				fs.existsSync(target),
				`does not exist: ${entry.path}`
			);
		}
	}
}

function validateHistoryIndex(file, data) {
	expect(file, "formatVersion", data.formatVersion === 1, "must be 1");
	expect(
		file,
		"family",
		FAMILIES.includes(data.family),
		"has unsupported family"
	);
	expect(
		file,
		"source.captureMode",
		data.source?.captureMode === "NETWORK_RESPONSE",
		"must come from response bodies"
	);
	if (
		!expect(
			file,
			"tournaments",
			Array.isArray(data.tournaments),
			"must be an array"
		)
	) {
		return;
	}
	const ids = data.tournaments.map((row) => row?.sourceTournamentId);
	expect(
		file,
		"tournaments",
		new Set(ids).size === ids.length,
		"contains duplicate source tournament IDs"
	);
	data.tournaments.forEach((row, index) => {
		const pointer = `tournaments[${index}]`;
		expect(
			file,
			`${pointer}.sourceTournamentId`,
			typeof row?.sourceTournamentId === "string" &&
				row.sourceTournamentId.length > 0,
			"must have a source ID"
		);
		expect(
			file,
			`${pointer}.title`,
			typeof row?.title === "string" && row.title.length > 0,
			"must have a title"
		);
		const observedDate =
			data.family === "SERIES" ? row?.lastPlayedAt : row?.startDate;
		expect(
			file,
			`${pointer}.date`,
			typeof observedDate === "string" &&
				!Number.isNaN(Date.parse(observedDate)),
			"must have an ISO date-time"
		);
		if (data.family === "SERIES") {
			expect(
				file,
				`${pointer}.playedBoardCount`,
				row.playedBoardCount <= row.boardCount,
				"cannot exceed boardCount"
			);
			expect(
				file,
				`${pointer}.series`,
				Date.parse(row.series?.periodStartAt) <
					Date.parse(row.series?.periodEndAt),
				"period start must precede period end"
			);
		}
	});
	validateCoverage(file, "coverage", data.coverage, data.tournaments);
}

function collectJsonFiles(target) {
	const stat = fs.statSync(target);
	if (stat.isFile()) {
		return [target];
	}
	return fs.readdirSync(target, { withFileTypes: true }).flatMap((entry) => {
		const child = path.join(target, entry.name);
		if (entry.isDirectory()) {
			return collectJsonFiles(child);
		}
		return entry.isFile() && entry.name.toLowerCase().endsWith(".json")
			? [child]
			: [];
	});
}

const target = process.argv[2];
if (!target) {
	console.error("Usage: node validate-export.mjs <file-or-directory>");
	process.exit(2);
}

let files;
try {
	files = collectJsonFiles(path.resolve(target));
} catch (error) {
	console.error(`Cannot read target: ${error.message}`);
	process.exit(2);
}

for (const file of files) {
	let data;
	try {
		data = JSON.parse(fs.readFileSync(file, "utf8"));
	} catch (error) {
		fail(file, "$", `invalid JSON: ${error.message}`);
		continue;
	}
	if (data.format === "FUNBRIDGE_HISTORY_MANIFEST") {
		validateManifest(file, data);
	} else if (data.format === "FUNBRIDGE_HISTORY_INDEX") {
		checkSchema(file, data, validateHistorySchema);
		validateHistoryIndex(file, data);
	} else {
		checkSchema(file, data, validateTournamentSchema);
		validateTournamentExport(file, data);
	}
}

for (const message of warnings) {
	console.warn(`WARN ${message}`);
}
for (const message of failures) {
	console.error(`ERROR ${message}`);
}

if (failures.length) {
	console.error(
		`Validation failed: ${failures.length} error(s), ${warnings.length} warning(s)`
	);
	process.exit(1);
}

console.log(
	`Validation passed: ${files.length} file(s), ${warnings.length} warning(s)`
);
