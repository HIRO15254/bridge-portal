#!/usr/bin/env node
// Deterministic reduction of already-observed, credential-free Funbridge response captures.
import fs from "node:fs";
import path from "node:path";

const captureRoot = path.resolve(
	process.argv[2] ?? "funbridge-export/.capture"
);
const outputRoot = path.resolve(process.argv[3] ?? "funbridge-export");
const exportedAt = new Date().toISOString();
const families = {
	"bp-circuit": "BP_CIRCUIT",
	series: "SERIES",
	daily: "DAILY",
};
const seats = { north: "N", east: "E", south: "S", west: "W" };
const vulnerabilities = { L: "None", N: "NS", E: "EW", A: "Both" };
const contractRe = /^([1-7])([SHDCN])(X1|X2)?$/;
const cardRe = /^([AKQJT2-9])([SHDC])([NESW])$/;
const auctionRe = /^(PA|X1|X2|[1-7][SHDCN])([NESW])(A?)$/;
const valid = (n) => typeof n === "number" && Number.isFinite(n);
const positive = (n) => Number.isInteger(n) && n > 0;
const firstPositive = (...values) => values.find(positive);
const sourceId = (n) =>
	n !== null &&
	n !== undefined &&
	String(n) !== "" &&
	String(n) !== "0" &&
	String(n) !== "-1"
		? String(n)
		: undefined;
const date = (v) => new Date(v).toISOString();
const scoreType = (r) => {
	if (r === 2) {
		return "IMP";
	}
	if (r === 1) {
		return "MP";
	}
	throw new Error(`Unknown resultType ${r}`);
};
const score = (v, type) => {
	if (!valid(v)) {
		return undefined;
	}
	return type === "MP" ? v * 100 : v;
};
const contract = (raw) => {
	if (!raw || raw === "PA") {
		return undefined;
	}
	const m = contractRe.exec(raw);
	if (!m) {
		throw new Error(`Unknown contract ${raw}`);
	}
	const suffix = { X1: "X", X2: "XX" }[m[3]] ?? "";
	return `${m[1]}${m[2] === "N" ? "NT" : m[2]}${suffix}`;
};
const rawScore = (v) => (valid(v) && v !== -32_000 ? v : undefined);
const card = (raw) => {
	if (!raw) {
		return undefined;
	}
	const m = cardRe.exec(raw);
	if (!m) {
		throw new Error(`Unknown card ${raw}`);
	}
	return `${m[2]}${m[1]}`;
};
const hands = (raw) =>
	Object.fromEntries(
		Object.entries(seats).map(([name, seat]) => {
			const tokens = raw?.[name]?.split("-") ?? [];
			const suits = [..."SHDC"];
			const parts = suits.map((suit) =>
				tokens
					.filter((token) => token.slice(-1) === suit)
					.map((token) => token[0])
					.sort(
						(a, b) => "AKQJT98765432".indexOf(a) - "AKQJT98765432".indexOf(b)
					)
					.join("")
			);
			return [seat, parts.join(".")];
		})
	);
const auction = (raw) =>
	raw
		? raw.split("-").map((token, index) => {
				const m = auctionRe.exec(token);
				if (!m) {
					throw new Error(`Unknown auction token ${token}`);
				}
				const call =
					{ PA: "PASS", X1: "X", X2: "XX" }[m[1]] ?? m[1].replace("N", "NT");
				return { index, seat: m[2], call, ...(m[3] ? { alert: "A" } : {}) };
			})
		: [];
const play = (raw) => {
	const actions = [];
	let claimMarker;
	for (const token of raw ? raw.split("-") : []) {
		if (token.startsWith("!")) {
			claimMarker = token;
			continue;
		}
		const m = cardRe.exec(token);
		if (!m) {
			throw new Error(`Unknown play token ${token}`);
		}
		const index = actions.length;
		actions.push({
			index,
			trickNumber: Math.floor(index / 4) + 1,
			seat: m[3],
			card: `${m[2]}${m[1]}`,
		});
	}
	return { actions, claimMarker };
};
const mainHero = (boardNumber, summary, seed) => {
	const source = seed?.heroRows?.find((r) => r.dealIndex === boardNumber);
	if (source) {
		return (
			summary.heroRows.find(
				(r) =>
					r.dealIndex === boardNumber &&
					sourceId(r.dealIDstr ?? r.dealID) ===
						sourceId(source.dealIDstr ?? source.dealID)
			) ?? summary.heroRows.find((r) => r.dealIndex === boardNumber)
		);
	}
	return summary.heroRows?.find((r) => r.dealIndex === boardNumber);
};
const groupComparison = (groupCapture, hero, type) => {
	if (!groupCapture) {
		return { contractGroupCoverage: "NONE", contractGroupIntegrity: "UNKNOWN" };
	}
	const rows = groupCapture.rows ?? [];
	const contractGroups = [];
	let unclassifiedPlayerCount = 0;
	let passedOutPlayerCount = 0;
	for (const row of rows) {
		const playerCount = row.nbPlayerSameGame;
		if (!positive(playerCount)) {
			throw new Error("Contract group without positive playerCount");
		}
		if (row.contract === "PA") {
			passedOutPlayerCount += playerCount;
			continue;
		}
		if (
			!(
				row.contract &&
				contractRe.test(row.contract) &&
				["N", "E", "S", "W"].includes(row.declarer) &&
				positive(row.rank) &&
				Number.isInteger(row.nbTricks)
			) ||
			rawScore(row.score) === undefined ||
			score(row.result, type) === undefined
		) {
			unclassifiedPlayerCount += playerCount;
			continue;
		}
		contractGroups.push({
			rank: row.rank,
			contract: contract(row.contract),
			declarer: row.declarer,
			tricksTaken: row.nbTricks,
			rawScore: row.score,
			score: score(row.result, type),
			playerCount,
			...(row.contract.includes("X") ? { sourceContract: row.contract } : {}),
		});
	}
	const participantSum = rows.reduce((n, r) => n + r.nbPlayerSameGame, 0);
	const sourceTotalCount =
		groupCapture.sourceTotalSize ?? groupCapture.totalSize;
	const rowCount = rows.length;
	let integrity = "UNKNOWN";
	if (positive(hero?.nbTotalPlayer)) {
		integrity =
			participantSum === hero.nbTotalPlayer ? "RECONCILED" : "MISMATCH";
	}
	return {
		contractGroups,
		unclassifiedPlayerCount,
		passedOutPlayerCount,
		contractGroupCoverage:
			sourceTotalCount === 0 || rowCount === sourceTotalCount
				? "FULL"
				: "VISIBLE_WINDOW",
		contractGroupIntegrity: integrity,
		contractGroupRows: {
			rowCount,
			...(positive(sourceTotalCount) ? { sourceTotalCount } : {}),
			participantSum,
		},
	};
};
const comparison = (hero, groups, fallbackType) => {
	if (!(hero && positive(hero.rank) && positive(hero.nbTotalPlayer))) {
		return undefined;
	}
	const type = scoreType(hero.resultType ?? fallbackType);
	return {
		rank: hero.rank,
		participantCount: hero.nbTotalPlayer,
		score: score(hero.result, type),
		scoreType: type,
		...(rawScore(hero.score) === undefined ? {} : { rawScore: hero.score }),
		...(hero.contract &&
		hero.contract !== "PA" &&
		Number.isInteger(hero.nbTricks)
			? { tricksTaken: hero.nbTricks }
			: {}),
		...(hero.lead ? { lead: card(hero.lead) } : {}),
		...groupComparison(groups, hero, type),
	};
};
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: A standard board must reconcile source IDs, missing play, passed-out contracts and captured comparison independently.
function standardBoard(boardNumber, entry, seed, fallbackType, archive) {
	const { summary, groups } = entry;
	const deal = summary.deal;
	const hero = mainHero(boardNumber, summary, seed);
	if (!hero) {
		throw new Error(`Missing hero row for board ${boardNumber}`);
	}
	const sourceDealId =
		sourceId(hero.dealIDstr) ??
		sourceId(hero.dealID) ??
		sourceId(
			seed?.heroRows?.find((r) => r.dealIndex === boardNumber)?.dealIDstr
		) ??
		sourceId(archive?.listPlayedDeals?.[boardNumber - 1]);
	if (!sourceDealId) {
		throw new Error(`Missing sourceDealId for board ${boardNumber}`);
	}
	const parsed = play(deal.playList);
	const source = {
		sourceDealId,
		...(sourceId(summary.gameID)
			? { sourceGameId: sourceId(summary.gameID) }
			: {}),
		...(parsed.claimMarker ? { claimMarker: parsed.claimMarker } : {}),
	};
	const base = {
		boardNumber,
		dealer: deal.dealer,
		vulnerability: vulnerabilities[deal.vulnerability],
		hands: hands(deal.playerHands),
		source,
	};
	const resultComparison = comparison(hero, groups, fallbackType);
	if (resultComparison) {
		base.comparison = resultComparison;
	}
	const actualContract = contract(deal.contract);
	if (deal.contract === "PA") {
		return {
			collection: "partialBoards",
			value: { ...base, status: "PASSED_OUT", auction: auction(deal.bidList) },
		};
	}
	if (
		!(
			actualContract &&
			deal.playList &&
			["N", "E", "S", "W"].includes(deal.declarer)
		)
	) {
		const contractDetails = actualContract
			? {
					contract: actualContract,
					...(["N", "E", "S", "W"].includes(deal.declarer)
						? { declarer: deal.declarer }
						: {}),
					...(Number.isInteger(deal.nbTricks)
						? { result: deal.nbTricks - (6 + Number(actualContract[0])) }
						: {}),
					...(resultComparison ? { score: resultComparison.score } : {}),
				}
			: {};
		return {
			collection: "partialBoards",
			value: {
				...base,
				status: actualContract ? "NO_PLAY" : "NO_CONTRACT_OR_PLAY",
				...contractDetails,
				...(deal.bidList ? { auction: auction(deal.bidList) } : {}),
				...(parsed.actions.length ? { play: parsed.actions } : {}),
			},
		};
	}
	if (!resultComparison) {
		throw new Error(
			`Played contract without valid comparison for board ${boardNumber}`
		);
	}
	const tricks = Number.isInteger(deal.nbTricks)
		? deal.nbTricks
		: hero.nbTricks;
	return {
		collection: "boards",
		value: {
			...base,
			heroSeat: "S",
			contract: actualContract,
			declarer: deal.declarer,
			result: tricks - (6 + Number(actualContract[0])),
			score: resultComparison.score,
			auction: auction(deal.bidList),
			play: parsed.actions,
		},
	};
}
function knockoutBoard(boardNumber, entry, capture) {
	const { summary, matchId, roundNumber } = entry;
	const match = capture.matches.find(
		(m) => String(m.match.id) === String(matchId)
	);
	const matchDeal = match?.dealList?.find(
		(d) =>
			String(d.dealIDstr) ===
			String(
				summary.heroRows?.[entry.boardNumber - 1]?.dealIDstr ??
					summary.heroRows?.[entry.boardNumber - 1]?.dealID
			)
	);
	if (!matchDeal) {
		throw new Error(
			`Missing knockout match deal ${matchId}/${entry.boardNumber}`
		);
	}
	const deal = summary.deal;
	const hero = summary.heroRows?.[entry.boardNumber - 1];
	const source = {
		sourceDealId: sourceId(matchDeal.dealIDstr),
		sourceMatchId: String(matchId),
		...(sourceId(summary.gameID)
			? { sourceGameId: sourceId(summary.gameID) }
			: {}),
	};
	const matchComparison = {
		sourceMatchId: String(matchId),
		roundNumber,
		impDelta: matchDeal.result,
		...(rawScore(matchDeal.scorePlayer1) === undefined
			? {}
			: { heroRawScore: matchDeal.scorePlayer1 }),
		...(rawScore(matchDeal.scorePlayer2) === undefined
			? {}
			: { opponentRawScore: matchDeal.scorePlayer2 }),
		...(contract(matchDeal.contractPlayer2)
			? {
					opponentContract: contract(matchDeal.contractPlayer2),
					opponentTricksTaken: matchDeal.nbTricksPlayer2,
				}
			: {}),
	};
	const base = {
		boardNumber,
		status: "NO_CONTRACT_OR_PLAY",
		dealer: deal.dealer,
		vulnerability: vulnerabilities[deal.vulnerability],
		hands: hands(deal.playerHands),
		source,
		matchComparison,
	};
	if (hero?.contract === "PA") {
		base.status = "PASSED_OUT";
	}
	if (deal.bidList) {
		base.auction = auction(deal.bidList);
	}
	return { collection: "partialBoards", value: base };
}
// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Family-specific metadata and KO round projection are kept together so source precedence stays visible.
function makeTournament(family, capture, fileId) {
	const archive = capture.archive;
	const seedTournament =
		capture.seed?.tournament ??
		Object.values(capture.boards)[0]?.summary?.tournament;
	const id = String(
		archive.tournamentID ?? archive.sourceTournamentId ?? fileId
	);
	const type = scoreType(seedTournament?.resultType ?? archive.resultType ?? 1);
	const resultPlayer = seedTournament?.resultPlayer;
	const playedBoardCount = Object.keys(capture.boards).length;
	const boardCount =
		seedTournament?.countDeal ?? archive.countDeal ?? playedBoardCount;
	const name =
		family === "BP_CIRCUIT" && capture.parentEvent
			? capture.parentEvent.title
			: (archive.title ?? archive.name ?? seedTournament?.name);
	const playedAt =
		archive.startDate ?? date(seedTournament?.beginDate ?? archive.date);
	const rank = firstPositive(resultPlayer?.rank, archive.rank);
	const participantCount = firstPositive(
		resultPlayer?.nbTotalPlayer,
		seedTournament?.nbTotalPlayer,
		archive.registeredPlayerCount,
		archive.nbPlayers
	);
	const tournament = {
		id: `${family.toLowerCase()}:${id}`,
		family,
		name,
		funbridgeId: capture.accountId,
		playedAt,
		...(family === "SERIES" && valid(archive.date)
			? { lastPlayedAt: date(archive.date) }
			: {}),
		completion:
			archive.inProgress ||
			archive.finished === false ||
			playedBoardCount < boardCount
				? "IN_PROGRESS"
				: "COMPLETED",
		boardCount,
		playedBoardCount,
		scoreType: type,
		...(score(resultPlayer?.result ?? archive.result, type) === undefined
			? {}
			: { score: score(resultPlayer?.result ?? archive.result, type) }),
		...(rank ? { rank } : {}),
		...(participantCount ? { participantCount } : {}),
	};
	if (family === "BP_CIRCUIT") {
		const coefficient =
			archive.coefficient ?? capture.parentEvent?.coefficient ?? "BP";
		const level =
			(coefficient.startsWith("BP") ? coefficient.slice(2) : coefficient) ||
			"UNKNOWN";
		const awarded = resultPlayer?.bridgePoints ?? archive.bridgePoints;
		let kind = "FEDERAL";
		if (capture.parentEvent) {
			kind = "BIC";
		}
		if (capture.kind === "KNOCKOUT") {
			kind = "KNOCKOUT";
		}
		const bpCircuit = {
			level,
			kind,
			...(Number(level) > 0 ? { multiplier: Number(level) / 100 } : {}),
			...(valid(awarded) && awarded >= 0 ? { awarded } : {}),
			...(capture.parentEvent
				? { parentEventId: capture.parentEvent.sourceTournamentId }
				: {}),
		};
		if (capture.kind === "KNOCKOUT") {
			bpCircuit.knockoutRounds = capture.matches.map(({ match }) => ({
				roundNumber: match.roundNumber,
				sourceMatchId: String(match.id),
				status: match.status,
				boardCount: match.nbDeals,
				...(sourceId(match.player2ID)
					? { opponentPlayerId: String(match.player2ID) }
					: {}),
				heroScore: match.scorePlayer1,
				opponentScore: match.scorePlayer2,
				...(sourceId(match.winner)
					? { winnerPlayerId: String(match.winner) }
					: {}),
			}));
		}
		tournament.bpCircuit = bpCircuit;
	}
	if (family === "SERIES") {
		const period = String(
			archive.periodID ?? seedTournament?.periodID ?? "UNKNOWN"
		);
		const [start, end] = period.split(";").map(Number);
		tournament.series = {
			level: archive.name,
			period,
			...(valid(start) && start > 0 ? { periodStartAt: date(start) } : {}),
			...(valid(end) && end > 0 ? { periodEndAt: date(end) } : {}),
			outcome: "PENDING",
		};
	}
	if (family === "DAILY") {
		tournament.daily = {
			region: archive.name,
			...(valid(seedTournament?.endDate)
				? { endAt: date(seedTournament.endDate) }
				: {}),
		};
	}
	return { tournament, id };
}
function convert(family, cap, fileId, capturedAt) {
	const { tournament, id } = makeTournament(family, cap, fileId);
	const result = {
		format: "FUNBRIDGE_EXPORT",
		formatVersion: 1,
		exportedAt,
		source: {
			platform: "FUNBRIDGE_WEB",
			captureMode: "NETWORK_RESPONSE",
			locale: "ja-JP",
			capturedAt,
			sourceTournamentId: id,
			...(cap.parentEvent
				? { sourceParentTournamentId: cap.parentEvent.sourceTournamentId }
				: {}),
		},
		tournament,
		standingsCoverage: {
			scope: "NONE",
			totalCount: tournament.participantCount ?? 0,
			rowCount: 0,
		},
		boards: [],
		partialBoards: [],
	};
	for (const [key, entry] of Object.entries(cap.boards).sort(
		([a], [b]) => Number(a.split(":").at(-1)) - Number(b.split(":").at(-1))
	)) {
		const boardNumber =
			cap.kind === "KNOCKOUT" ? entry.boardNumber : Number(key);
		const normalized =
			cap.kind === "KNOCKOUT"
				? knockoutBoard(boardNumber, entry, cap)
				: standardBoard(
						boardNumber,
						entry,
						cap.seed,
						tournament.scoreType,
						cap.archive
					);
		result[normalized.collection].push(normalized.value);
	}
	const mismatches = [...result.boards, ...result.partialBoards].filter(
		(b) => b.comparison?.contractGroupIntegrity === "MISMATCH"
	).length;
	const warnings = [];
	if (mismatches) {
		warnings.push(`CONTRACT_GROUP_PARTICIPANT_MISMATCH:${mismatches}`);
	}
	if (cap.kind === "KNOCKOUT") {
		warnings.push("KNOCKOUT_SUMMARY_RESULT_SENTINELS");
	}
	if (result.partialBoards.length) {
		warnings.push(`PARTIAL_BOARDS:${result.partialBoards.length}`);
	}
	if (warnings.length) {
		result.source.warnings = warnings;
	}
	if (!result.partialBoards.length) {
		result.partialBoards = undefined;
	}
	return result;
}
const summary = {
	tournaments: 0,
	boards: 0,
	partialBoards: 0,
	mismatches: 0,
	files: [],
};
for (const [directory, family] of Object.entries(families)) {
	const input = path.join(captureRoot, directory);
	const output = path.join(outputRoot, directory);
	fs.mkdirSync(output, { recursive: true });
	for (const name of fs.readdirSync(input).filter((n) => n.endsWith(".json"))) {
		const id = name.slice(0, -5);
		const cap = JSON.parse(fs.readFileSync(path.join(input, name), "utf8"));
		let curated;
		try {
			curated = convert(
				family,
				cap,
				id,
				fs.statSync(path.join(input, name)).mtime.toISOString()
			);
		} catch (error) {
			throw new Error(`${directory}/${id}: ${error.message}`, { cause: error });
		}
		const localDay = new Date(curated.tournament.playedAt).toLocaleDateString(
			"sv-SE",
			{ timeZone: "Asia/Tokyo" }
		);
		const target = path.join(output, `${localDay}_${id}.network.json`);
		fs.writeFileSync(target, `${JSON.stringify(curated, null, 2)}\n`);
		summary.tournaments++;
		summary.boards += curated.boards.length;
		summary.partialBoards += curated.partialBoards?.length ?? 0;
		summary.mismatches += [
			...curated.boards,
			...(curated.partialBoards ?? []),
		].filter((b) => b.comparison?.contractGroupIntegrity === "MISMATCH").length;
		summary.files.push(path.relative(outputRoot, target).replaceAll("\\", "/"));
	}
}
console.log(JSON.stringify(summary, null, 2));
