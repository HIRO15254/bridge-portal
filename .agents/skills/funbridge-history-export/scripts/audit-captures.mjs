#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "funbridge-export/.capture");
const totals = {
	tournaments: 0,
	boards: 0,
	contract: 0,
	passedOut: 0,
	empty: 0,
	groups: 0,
	mismatches: 0,
	groupRows100: 0,
	groupRows: 0,
	unclassifiedPlayers: 0,
	passedOutPlayers: 0,
	auctionCalls: 0,
	playedCards: 0,
	claimMarkers: 0,
};
const byFamily = {};
const examples = {};
const add = (key, value) => {
	if (!examples[key]) {
		examples[key] = [];
	}
	if (examples[key].length < 5) {
		examples[key].push(value);
	}
};
for (const family of ["bp-circuit", "series", "daily"]) {
	for (const name of fs
		.readdirSync(path.join(root, family))
		.filter((n) => n.endsWith(".json"))) {
		const cap = JSON.parse(
			fs.readFileSync(path.join(root, family, name), "utf8")
		);
		totals.tournaments++;
		if (!byFamily[family]) {
			byFamily[family] = { tournaments: 0, boards: 0, contract: 0, groups: 0 };
		}
		const sub = byFamily[family];
		sub.tournaments++;
		for (const [boardNumber, board] of Object.entries(cap.boards ?? {})) {
			totals.boards++;
			sub.boards++;
			const deal = board.summary?.deal ?? {};
			if (deal.contract === "PA") {
				totals.passedOut++;
			} else if (deal.contract) {
				totals.contract++;
				sub.contract++;
			} else {
				totals.empty++;
			}
			totals.auctionCalls += deal.bidList ? deal.bidList.split("-").length : 0;
			totals.playedCards += deal.playList
				? deal.playList.split("-").filter((token) => !token.startsWith("!"))
						.length
				: 0;
			totals.claimMarkers += deal.playList
				? deal.playList.split("-").filter((token) => token.startsWith("!"))
						.length
				: 0;
			const hero =
				board.summary?.heroRows?.find(
					(r) => String(r.dealIDstr || r.dealID) === String(board.sourceDealId)
				) ??
				board.summary?.heroRows?.[Number(boardNumber.split(":").at(-1)) - 1];
			if (!hero || hero.rank < 1) {
				add("badHero", `${family}/${name}/${boardNumber}`);
			}
			if (board.groups) {
				totals.groups++;
				sub.groups++;
				const rows = board.groups.rows ?? [];
				totals.groupRows += rows.length;
				totals.unclassifiedPlayers += rows
					.filter((r) => !r.contract)
					.reduce((n, r) => n + r.nbPlayerSameGame, 0);
				totals.passedOutPlayers += rows
					.filter((r) => r.contract === "PA")
					.reduce((n, r) => n + r.nbPlayerSameGame, 0);
				if (rows.length >= 100 && board.groups.sourceTotalSize === 0) {
					totals.groupRows100++;
					add("row100", `${family}/${name}/${boardNumber}`);
				}
				const sum = rows.reduce((n, r) => n + (r.nbPlayerSameGame ?? 0), 0);
				const expected = hero?.nbTotalPlayer ?? board.groups.expectedPlayers;
				if (sum !== expected) {
					totals.mismatches++;
					add(
						"mismatch",
						`${family}/${name}/${boardNumber}:${sum}/${expected}`
					);
				}
				if (deal.contract === "PA") {
					add(
						"passoutGroups",
						rows
							.filter((r) => r.contract === "PA" || r.contract === "")
							.map((r) => `${r.contract || "empty"}:${r.nbPlayerSameGame}`)
							.join(",")
					);
				}
			}
		}
	}
}
console.log(JSON.stringify({ totals, byFamily, examples }, null, 2));
if (process.argv.includes("--shape")) {
	for (const [family, name] of [
		["bp-circuit", "6a99f86c218733689d1ac269"],
		["bp-circuit", "6aa8816995dcec32d17078b2"],
		["bp-circuit", "29145"],
		["series", "6a961d6d218733689d9cfdcf"],
		["daily", "11457"],
	]) {
		const c = JSON.parse(
			fs.readFileSync(path.join(root, family, `${name}.json`), "utf8")
		);
		const b = Object.values(c.boards)[0];
		console.log(
			JSON.stringify(
				{
					family,
					name,
					capKeys: Object.keys(c),
					archive: c.archive,
					seedKeys: Object.keys(c.seed ?? {}),
					seedTournament: c.seed?.tournament,
					boardKeys: Object.keys(b),
					summaryKeys: Object.keys(b.summary ?? {}),
					firstHero: b.summary?.heroRows?.[0],
					match: c.matches?.[0]?.match,
					firstDeal: c.matches?.find((m) => m.dealList?.length)?.dealList?.[0],
				},
				null,
				2
			)
		);
	}
}
