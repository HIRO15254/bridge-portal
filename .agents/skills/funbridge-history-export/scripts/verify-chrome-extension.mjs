#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { exportAllHistory } from "../assets/chrome-extension/lib/exporter.js";
import {
	buildHistoryIndex,
	buildTournamentExport,
} from "../assets/chrome-extension/lib/normalize.js";
import {
	ENDPOINTS,
	parseApiUrl,
	runtimeFetchExpression,
} from "../assets/chrome-extension/lib/protocol.js";

const skillDirectory = path.resolve(
	path.dirname(fileURLToPath(import.meta.url)),
	".."
);
const extensionDirectory = path.join(
	skillDirectory,
	"assets",
	"chrome-extension"
);
const manifest = JSON.parse(
	fs.readFileSync(path.join(extensionDirectory, "manifest.json"), "utf8")
);

assert.equal(manifest.manifest_version, 3);
assert.deepEqual([...manifest.permissions].sort(), [
	"activeTab",
	"debugger",
	"downloads",
]);
assert.deepEqual(manifest.host_permissions, [
	"https://*.funbridge.com/*",
	"https://*.funbridge.net/*",
]);
for (const relativePath of [
	manifest.background.service_worker,
	manifest.action.default_popup,
	"popup.js",
	"popup.css",
	"lib/exporter.js",
	"lib/normalize.js",
	"lib/protocol.js",
]) {
	assert.ok(
		fs.existsSync(path.join(extensionDirectory, relativePath)),
		`manifest asset is missing: ${relativePath}`
	);
}

const backgroundSource = fs.readFileSync(
	path.join(extensionDirectory, "background.js"),
	"utf8"
);
assert.equal(
	backgroundSource.includes("chrome.storage"),
	false,
	"credentials must not be written to chrome.storage"
);
assert.equal(
	backgroundSource.includes("console."),
	false,
	"network responses or credentials must not be logged"
);

const root = "https://example.funbridge.net/funbridge-server-ws/rest";
const parsed = parseApiUrl(`${root}/${ENDPOINTS.tournamentArchives}`);
assert.deepEqual(parsed, { endpoint: ENDPOINTS.tournamentArchives, root });
assert.equal(parseApiUrl(`${root}/account/updateProfile`), undefined);
assert.equal(
	parseApiUrl(
		`https://example.invalid/funbridge-server-ws/rest/${ENDPOINTS.tournamentArchives}`
	),
	undefined
);
assert.match(
	runtimeFetchExpression(
		root,
		ENDPOINTS.tournamentArchives,
		"Bearer test-only",
		{ categoryID: 6 }
	),
	/^fetch\(/
);
assert.throws(() =>
	runtimeFetchExpression(root, "account/updateProfile", "Bearer test-only", {})
);
assert.throws(() =>
	runtimeFetchExpression(
		"https://example.invalid/rest",
		ENDPOINTS.tournamentArchives,
		"Bearer test-only",
		{}
	)
);

const timestamp = Date.UTC(2026, 8, 15, 12, 0, 0);
const archive = {
	countDeal: 1,
	date: timestamp,
	finished: true,
	id: "9001",
	listPlayedDeals: ["7001"],
	name: "Daily fixture",
	nbPlayers: 2,
	rank: 1,
	result: 0.6,
	resultType: 1,
	title: "Daily fixture",
};
const hero = {
	contract: "4S",
	dealIDstr: "7001",
	dealIndex: 1,
	gameID: 8001,
	lead: "2SW",
	nbTotalPlayer: 2,
	nbTricks: 10,
	rank: 1,
	result: 0.6,
	resultType: 1,
	score: 420,
};
const tournament = {
	beginDate: timestamp,
	countDeal: 1,
	nbTotalPlayer: 2,
	resultPlayer: { nbTotalPlayer: 2, rank: 1, result: 0.6 },
	resultType: 1,
};
const capture = {
	accountId: "123456",
	archive,
	boards: [
		{
			boardNumber: 1,
			groups: {
				listResultDeal: [
					{
						contract: "4S",
						declarer: "S",
						nbPlayerSameGame: 2,
						nbTricks: 10,
						rank: 1,
						result: 0.6,
						score: 420,
					},
				],
				sourceTotalSize: 1,
				totalSize: 1,
			},
			summary: {
				deal: {
					bidList: "1SN-PAE-4SS-PAW-PAN-PAE",
					contract: "4S",
					dealer: "N",
					declarer: "S",
					nbTricks: 10,
					playList: "2SW-ASN-TSE-6SS-!S9",
					playerHands: {
						east: "TS-9S-8S-7S-JH-TH-9H-8H-JD-TD-9D-JC-TC",
						north: "AS-KS-QS-JS-AH-KH-QH-AD-KD-QD-AC-KC-QC",
						south: "6S-5S-4S-3S-7H-6H-5H-8D-7D-6D-5D-7C-6C",
						west: "2S-4H-3H-2H-4D-3D-2D-9C-8C-5C-4C-3C-2C",
					},
					vulnerability: "L",
				},
				gameID: 8001,
				result: { listResultDeal: [hero], tournament },
			},
		},
	],
	family: "DAILY",
	seed: { listResultDeal: [hero], tournament },
};
const capturedAt = new Date(timestamp).toISOString();
const history = buildHistoryIndex("DAILY", [archive], capturedAt);
const tournamentExport = buildTournamentExport("DAILY", capture, capturedAt);

const ajv = new Ajv2020({
	allErrors: true,
	strict: true,
	strictRequired: false,
});
addFormats(ajv);
const validateHistory = ajv.compile(
	JSON.parse(
		fs.readFileSync(
			path.join(skillDirectory, "schemas", "history-index.schema.json"),
			"utf8"
		)
	)
);
const validateTournament = ajv.compile(
	JSON.parse(
		fs.readFileSync(
			path.join(skillDirectory, "schemas", "tournament.schema.json"),
			"utf8"
		)
	)
);
assert.equal(
	validateHistory(history),
	true,
	JSON.stringify(validateHistory.errors)
);
assert.equal(
	validateTournament(tournamentExport),
	true,
	JSON.stringify(validateTournament.errors)
);
assert.equal(tournamentExport.boards[0].source.claimMarker, "!S9");
assert.equal(
	tournamentExport.boards[0].comparison.contractGroupIntegrity,
	"RECONCILED"
);
const exportedHands = Object.values(tournamentExport.boards[0].hands);
assert.ok(
	exportedHands.every((hand) => hand.replaceAll(".", "").length === 13)
);
const exportedCards = exportedHands.flatMap((hand) =>
	[..."SHDC"].flatMap((suit, index) =>
		[...hand.split(".")[index]].map((rank) => `${suit}${rank}`)
	)
);
assert.equal(new Set(exportedCards).size, 52);

const apiCalls = [];
const post = (endpoint, body) => {
	apiCalls.push({ body, endpoint });
	if (endpoint === ENDPOINTS.bpHistory) {
		return { data: { rows: [], totalSize: 0 } };
	}
	if (endpoint === ENDPOINTS.tournamentArchives) {
		return body.categoryID === 6
			? { data: { offset: 0, rows: [archive], totalSize: 1 } }
			: { data: { rows: [], totalSize: 0 } };
	}
	if (endpoint === ENDPOINTS.dealSummary) {
		return { data: capture.boards[0].summary };
	}
	if (endpoint === ENDPOINTS.dealGroups) {
		return {
			data: {
				listResultDeal: capture.boards[0].groups.listResultDeal,
				totalSize: 1,
				tournament,
			},
		};
	}
	throw new Error(`Unexpected fixture endpoint: ${endpoint}`);
};
const integrated = await exportAllHistory({
	accountId: "123456",
	post,
	templates: {},
});
assert.equal(integrated.files.length, 4);
assert.equal(integrated.summary.indexCount, 1);
assert.equal(integrated.summary.tournamentFileCount, 1);
assert.equal(integrated.summary.boardCount, 1);
assert.equal(integrated.summary.skipped.length, 0);
for (const file of integrated.files) {
	const validate =
		file.data.format === "FUNBRIDGE_EXPORT"
			? validateTournament
			: validateHistory;
	assert.equal(
		validate(file.data),
		true,
		`${file.path}: ${JSON.stringify(validate.errors)}`
	);
}
assert.ok(apiCalls.some(({ endpoint }) => endpoint === ENDPOINTS.dealSummary));
assert.ok(apiCalls.some(({ endpoint }) => endpoint === ENDPOINTS.dealGroups));
assert.equal(
	apiCalls.find(({ endpoint }) => endpoint === ENDPOINTS.dealSummary).body
		.dealID,
	7001
);

console.log(
	"Chrome extension verification passed: manifest, API boundary, full export flow, and JSON Schema output."
);
