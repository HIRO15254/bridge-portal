const seats = { north: "N", east: "E", south: "S", west: "W" };
const vulnerabilities = { A: "Both", E: "EW", L: "None", N: "NS" };
const contractPattern = /^([1-7])([CDHSN])(X1|X2)?$/;
const cardPattern = /^([2-9AKQJT])([CDHS])([ENWS])$/;
const bidPattern = /^(PA|X1|X2|[1-7][CDHSN])([ENWS])(A?)$/;
const positiveInteger = (value) => Number.isInteger(value) && value > 0;
const number = (value) => typeof value === "number" && Number.isFinite(value);
const firstPositive = (...values) => values.find(positiveInteger);

function sourceId(value) {
	if (
		value === undefined ||
		value === null ||
		value === "" ||
		value === 0 ||
		value === -1 ||
		value === "0" ||
		value === "-1"
	) {
		return undefined;
	}
	return String(value);
}

function iso(value) {
	try {
		return new Date(value).toISOString();
	} catch {
		throw new Error(`日時を解釈できません: ${value}`);
	}
}

function resultType(value) {
	if (value === 1 || value === "RESULT_PERCENTAGE") {
		return "MP";
	}
	if (value === 2 || value === "RESULT_IMP") {
		return "IMP";
	}
	throw new Error(`未対応のresultTypeです: ${value}`);
}

function score(value, type) {
	if (!number(value)) {
		return undefined;
	}
	return type === "MP" ? value * 100 : value;
}

function rawScore(value) {
	return number(value) && value !== -32_000 ? value : undefined;
}

function contract(value) {
	if (!value || value === "PA") {
		return undefined;
	}
	const match = contractPattern.exec(value);
	if (!match) {
		throw new Error(`未対応のcontractです: ${value}`);
	}
	const denomination = match[2] === "N" ? "NT" : match[2];
	const doubled = { X1: "X", X2: "XX" }[match[3]] ?? "";
	return `${match[1]}${denomination}${doubled}`;
}

function card(value) {
	if (!value) {
		return undefined;
	}
	const match = cardPattern.exec(value);
	if (!match) {
		throw new Error(`未対応のcardです: ${value}`);
	}
	return `${match[2]}${match[1]}`;
}

function normalizeHands(playerHands) {
	return Object.fromEntries(
		Object.entries(seats).map(([name, seat]) => {
			const tokens = playerHands?.[name]?.split("-") ?? [];
			const hand = [..."SHDC"]
				.map((suit) =>
					tokens
						.filter((token) => token.endsWith(suit))
						.map((token) => token[0])
						.sort(
							(left, right) =>
								"AKQJT98765432".indexOf(left) - "AKQJT98765432".indexOf(right)
						)
						.join("")
				)
				.join(".");
			return [seat, hand];
		})
	);
}

function normalizeAuction(value) {
	if (!value) {
		return [];
	}
	return value.split("-").map((token, index) => {
		const match = bidPattern.exec(token);
		if (!match) {
			throw new Error(`未対応のbidです: ${token}`);
		}
		const call =
			{ PA: "PASS", X1: "X", X2: "XX" }[match[1]] ??
			match[1].replace("N", "NT");
		return { index, seat: match[2], call, ...(match[3] ? { alert: "A" } : {}) };
	});
}

function normalizePlay(value) {
	const actions = [];
	let claimMarker;
	for (const token of value ? value.split("-") : []) {
		if (token.startsWith("!")) {
			claimMarker = token;
			continue;
		}
		const match = cardPattern.exec(token);
		if (!match) {
			throw new Error(`未対応のplayです: ${token}`);
		}
		const index = actions.length;
		actions.push({
			index,
			trickNumber: Math.floor(index / 4) + 1,
			seat: match[3],
			card: `${match[2]}${match[1]}`,
		});
	}
	return { actions, claimMarker };
}

function summaryTournament(summary) {
	return summary?.result?.tournament ?? summary?.tournament;
}

function summaryRows(summary) {
	return summary?.result?.listResultDeal ?? summary?.heroRows ?? [];
}

function heroFor(boardNumber, summary, seed, sourceDealId) {
	const rows = summaryRows(summary);
	return (
		rows.find(
			(row) =>
				row.dealIndex === boardNumber &&
				sourceId(row.dealIDstr ?? row.dealID) === sourceDealId
		) ??
		rows.find((row) => row.dealIndex === boardNumber) ??
		seed?.listResultDeal?.find((row) => row.dealIndex === boardNumber)
	);
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Funbridge contract rows require explicit sentinel and integrity handling.
function normalizeGroups(groupSource, hero, type) {
	if (!groupSource) {
		return { contractGroupCoverage: "NONE", contractGroupIntegrity: "UNKNOWN" };
	}
	const rows = groupSource.listResultDeal ?? groupSource.rows ?? [];
	const contractGroups = [];
	let passedOutPlayerCount = 0;
	let unclassifiedPlayerCount = 0;
	for (const row of rows) {
		const playerCount = row.nbPlayerSameGame;
		if (!positiveInteger(playerCount)) {
			throw new Error("契約集計の人数が正の整数ではありません。");
		}
		if (row.contract === "PA") {
			passedOutPlayerCount += playerCount;
			continue;
		}
		const parsedContract = contractPattern.test(row.contract ?? "")
			? contract(row.contract)
			: undefined;
		if (
			!(
				parsedContract &&
				["N", "E", "S", "W"].includes(row.declarer) &&
				positiveInteger(row.rank) &&
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
			contract: parsedContract,
			declarer: row.declarer,
			tricksTaken: row.nbTricks,
			rawScore: row.score,
			score: score(row.result, type),
			playerCount,
			...(row.contract.includes("X") ? { sourceContract: row.contract } : {}),
		});
	}
	const participantSum = rows.reduce(
		(sum, row) => sum + row.nbPlayerSameGame,
		0
	);
	const sourceTotalCount = groupSource.sourceTotalSize ?? groupSource.totalSize;
	const coverage =
		sourceTotalCount === 0 || sourceTotalCount === rows.length
			? "FULL"
			: "VISIBLE_WINDOW";
	let integrity = "UNKNOWN";
	if (positiveInteger(hero?.nbTotalPlayer)) {
		integrity =
			participantSum === hero.nbTotalPlayer ? "RECONCILED" : "MISMATCH";
	}
	return {
		contractGroups,
		unclassifiedPlayerCount,
		passedOutPlayerCount,
		contractGroupCoverage: coverage,
		contractGroupIntegrity: integrity,
		contractGroupRows: {
			rowCount: rows.length,
			...(positiveInteger(sourceTotalCount) ? { sourceTotalCount } : {}),
			participantSum,
		},
	};
}

function normalizeComparison(hero, groups, fallbackType) {
	if (
		!(hero && positiveInteger(hero.rank) && positiveInteger(hero.nbTotalPlayer))
	) {
		return undefined;
	}
	const type = resultType(hero.resultType ?? fallbackType);
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
		...normalizeGroups(groups, hero, type),
	};
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: A board is classified from several independent incomplete-response states.
function normalizeStandardBoard(entry, capture, scoreType) {
	const { boardNumber, groups, summary } = entry;
	const deal = summary.deal;
	const fallbackDealId = capture.archive.listPlayedDeals?.[boardNumber - 1];
	const seedHero = capture.seed?.listResultDeal?.find(
		(row) => row.dealIndex === boardNumber
	);
	const sourceDealId =
		sourceId(seedHero?.dealIDstr) ??
		sourceId(seedHero?.dealID) ??
		sourceId(fallbackDealId) ??
		sourceId(
			summaryRows(summary).find((row) => row.dealIndex === boardNumber)
				?.dealIDstr ??
				summaryRows(summary).find((row) => row.dealIndex === boardNumber)
					?.dealID
		);
	if (!sourceDealId) {
		throw new Error(`ボード${boardNumber}のsourceDealIdがありません。`);
	}
	const hero = heroFor(boardNumber, summary, capture.seed, sourceDealId);
	if (!hero) {
		throw new Error(`ボード${boardNumber}の本人結果がありません。`);
	}
	const parsedPlay = normalizePlay(deal.playList);
	const source = {
		sourceDealId,
		...(sourceId(summary.gameID)
			? { sourceGameId: sourceId(summary.gameID) }
			: {}),
		...(parsedPlay.claimMarker ? { claimMarker: parsedPlay.claimMarker } : {}),
	};
	const base = {
		boardNumber,
		dealer: deal.dealer,
		vulnerability: vulnerabilities[deal.vulnerability],
		hands: normalizeHands(deal.playerHands),
		source,
	};
	const comparison = normalizeComparison(hero, groups, scoreType);
	if (comparison) {
		base.comparison = comparison;
	}
	const parsedContract = contract(deal.contract);
	if (deal.contract === "PA") {
		return {
			collection: "partialBoards",
			board: {
				...base,
				status: "PASSED_OUT",
				auction: normalizeAuction(deal.bidList),
			},
		};
	}
	if (
		!(
			parsedContract &&
			deal.playList &&
			["N", "E", "S", "W"].includes(deal.declarer)
		)
	) {
		return {
			collection: "partialBoards",
			board: {
				...base,
				status: parsedContract ? "NO_PLAY" : "NO_CONTRACT_OR_PLAY",
				...(parsedContract
					? {
							contract: parsedContract,
							...(deal.declarer === "?" ? {} : { declarer: deal.declarer }),
							...(Number.isInteger(deal.nbTricks)
								? { result: deal.nbTricks - (6 + Number(parsedContract[0])) }
								: {}),
							...(comparison ? { score: comparison.score } : {}),
						}
					: {}),
				...(deal.bidList ? { auction: normalizeAuction(deal.bidList) } : {}),
				...(parsedPlay.actions.length ? { play: parsedPlay.actions } : {}),
			},
		};
	}
	if (!comparison) {
		throw new Error(`ボード${boardNumber}のcomparisonがありません。`);
	}
	return {
		collection: "boards",
		board: {
			...base,
			heroSeat: "S",
			contract: parsedContract,
			declarer: deal.declarer,
			result: deal.nbTricks - (6 + Number(parsedContract[0])),
			score: comparison.score,
			auction: normalizeAuction(deal.bidList),
			play: parsedPlay.actions,
		},
	};
}

function normalizeKnockoutBoard(entry, capture) {
	const matchEntry = capture.matches.find(
		({ match }) => String(match.id) === String(entry.matchId)
	);
	const dealEntry = matchEntry?.dealList?.find(
		(deal) => String(deal.dealIDstr) === String(entry.sourceDealId)
	);
	if (!dealEntry) {
		throw new Error(
			`KOボード${entry.roundNumber}:${entry.boardNumber}のmatch結果がありません。`
		);
	}
	const deal = entry.summary.deal;
	const source = {
		sourceDealId: String(dealEntry.dealIDstr),
		sourceMatchId: String(entry.matchId),
		...(sourceId(entry.summary.gameID)
			? { sourceGameId: sourceId(entry.summary.gameID) }
			: {}),
	};
	const matchComparison = {
		sourceMatchId: String(entry.matchId),
		roundNumber: entry.roundNumber,
		impDelta: dealEntry.result,
		...(rawScore(dealEntry.scorePlayer1) === undefined
			? {}
			: { heroRawScore: dealEntry.scorePlayer1 }),
		...(rawScore(dealEntry.scorePlayer2) === undefined
			? {}
			: { opponentRawScore: dealEntry.scorePlayer2 }),
		...(contract(dealEntry.contractPlayer2)
			? {
					opponentContract: contract(dealEntry.contractPlayer2),
					opponentTricksTaken: dealEntry.nbTricksPlayer2,
				}
			: {}),
	};
	return {
		boardNumber: entry.exportBoardNumber,
		status: deal.contract === "PA" ? "PASSED_OUT" : "NO_CONTRACT_OR_PLAY",
		dealer: deal.dealer,
		vulnerability: vulnerabilities[deal.vulnerability],
		hands: normalizeHands(deal.playerHands),
		source,
		matchComparison,
		...(deal.bidList ? { auction: normalizeAuction(deal.bidList) } : {}),
	};
}

function archiveId(row) {
	return sourceId(
		row.sourceTournamentId ??
			row.tournamentID ??
			row.tourIDstr ??
			row.id ??
			row.ID
	);
}

function archiveName(row) {
	return row.title ?? row.name ?? "Funbridge Tournament";
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Each tournament family has a distinct source response shape.
function normalizeIndexRow(family, row) {
	const id = archiveId(row);
	if (!id) {
		throw new Error("履歴行に大会IDがありません。");
	}
	if (family === "BP_CIRCUIT") {
		return {
			sourceTournamentId: id,
			title: archiveName(row),
			startDate: iso(row.startDate ?? row.beginDate ?? row.date),
			coefficient: row.coefficient ?? "BP",
			registeredPlayerCount: Number(
				row.registeredPlayerCount ?? row.nbPlayers ?? row.nbTotalPlayer ?? 0
			),
			inProgress: Boolean(row.inProgress ?? row.finished === false),
			...(positiveInteger(row.rank) ? { rank: row.rank } : {}),
			...(number(row.bridgePoints) && row.bridgePoints >= 0
				? { bridgePoints: row.bridgePoints }
				: {}),
		};
	}
	const type = resultType(row.resultType);
	if (family === "SERIES") {
		const [periodStart, periodEnd] = String(row.periodID ?? "")
			.split(";")
			.map(Number);
		return {
			sourceTournamentId: id,
			title: archiveName(row),
			lastPlayedAt: iso(row.date),
			registeredPlayerCount: Number(row.nbPlayers ?? 0),
			inProgress: row.finished === false,
			scoreType: type,
			...(row.finished && number(row.result)
				? {
						score: score(row.result, type),
						...(positiveInteger(row.rank) ? { rank: row.rank } : {}),
					}
				: {}),
			boardCount: row.countDeal,
			playedBoardCount: row.listPlayedDeals?.length ?? 0,
			series: {
				level: row.name,
				periodStartAt: iso(periodStart),
				periodEndAt: iso(periodEnd),
			},
		};
	}
	return {
		sourceTournamentId: id,
		title: archiveName(row),
		startDate: iso(row.date),
		registeredPlayerCount: Number(row.nbPlayers ?? 0),
		inProgress: row.finished === false,
		scoreType: type,
		score: score(row.result, type),
		rank: row.rank,
		boardCount: row.countDeal,
		daily: { region: row.name },
	};
}

export function buildHistoryIndex(family, rows, capturedAt) {
	const tournaments = rows.map((row) => normalizeIndexRow(family, row));
	return {
		format: "FUNBRIDGE_HISTORY_INDEX",
		formatVersion: 1,
		capturedAt,
		source: {
			platform: "FUNBRIDGE_WEB",
			captureMode: "NETWORK_RESPONSE",
			locale: "ja-JP",
		},
		family,
		coverage: {
			scope: "FULL",
			totalCount: tournaments.length,
			rowCount: tournaments.length,
		},
		tournaments,
	};
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Family-specific metadata remains together to enforce one output contract.
function tournamentMetadata(family, capture, capturedAt) {
	const archive = capture.archive;
	const seedTournament =
		capture.seed?.tournament ?? summaryTournament(capture.boards[0]?.summary);
	const resultPlayer = seedTournament?.resultPlayer;
	const id = archiveId(archive);
	const type = resultType(
		seedTournament?.resultType ?? archive.resultType ?? 1
	);
	const boardCount =
		seedTournament?.countDeal ?? archive.countDeal ?? capture.boards.length;
	const playedBoardCount = capture.boards.length;
	const playedAt = iso(
		archive.startDate ?? seedTournament?.beginDate ?? archive.date
	);
	const metadata = {
		id: `${family.toLowerCase()}:${id}`,
		family,
		name: capture.parentEvent?.title ?? archiveName(archive),
		funbridgeId: String(capture.accountId),
		playedAt,
		...(family === "SERIES" && number(archive.date)
			? { lastPlayedAt: iso(archive.date) }
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
		...(firstPositive(resultPlayer?.rank, archive.rank)
			? { rank: firstPositive(resultPlayer?.rank, archive.rank) }
			: {}),
		...(firstPositive(
			resultPlayer?.nbTotalPlayer,
			seedTournament?.nbTotalPlayer,
			archive.registeredPlayerCount,
			archive.nbPlayers
		)
			? {
					participantCount: firstPositive(
						resultPlayer?.nbTotalPlayer,
						seedTournament?.nbTotalPlayer,
						archive.registeredPlayerCount,
						archive.nbPlayers
					),
				}
			: {}),
	};
	if (family === "BP_CIRCUIT") {
		const coefficient =
			archive.coefficient ?? capture.parentEvent?.coefficient ?? "BP";
		const level =
			(coefficient.startsWith("BP") ? coefficient.slice(2) : coefficient) ||
			"UNKNOWN";
		let kind = "FEDERAL";
		if (capture.kind === "KNOCKOUT") {
			kind = "KNOCKOUT";
		} else if (capture.parentEvent) {
			kind = "BIC";
		}
		const awarded = resultPlayer?.bridgePoints ?? archive.bridgePoints;
		metadata.bpCircuit = {
			level,
			kind,
			...(Number(level) > 0 ? { multiplier: Number(level) / 100 } : {}),
			...(number(awarded) && awarded >= 0 ? { awarded } : {}),
			...(capture.parentEvent
				? { parentEventId: archiveId(capture.parentEvent) }
				: {}),
			...(capture.kind === "KNOCKOUT"
				? {
						knockoutRounds: capture.matches.map(({ match }) => ({
							roundNumber: match.roundNumber,
							sourceMatchId: String(match.id),
							status: match.status,
							boardCount: match.nbDeals,
							...(sourceId(match.player2?.playerID ?? match.player2ID)
								? {
										opponentPlayerId: sourceId(
											match.player2?.playerID ?? match.player2ID
										),
									}
								: {}),
							heroScore: match.scorePlayer1,
							opponentScore: match.scorePlayer2,
							...(sourceId(match.winner)
								? { winnerPlayerId: sourceId(match.winner) }
								: {}),
						})),
					}
				: {}),
		};
	} else if (family === "SERIES") {
		const period = String(archive.periodID);
		const [start, end] = period.split(";").map(Number);
		metadata.series = {
			level: archive.name,
			period,
			periodStartAt: iso(start),
			periodEndAt: iso(end),
			outcome: "PENDING",
		};
	} else {
		metadata.daily = {
			region: archive.name,
			...(number(seedTournament?.endDate)
				? { endAt: iso(seedTournament.endDate) }
				: {}),
		};
	}
	return { metadata, id, type, capturedAt };
}

export function buildTournamentExport(family, capture, capturedAt) {
	const { metadata, id, type } = tournamentMetadata(
		family,
		capture,
		capturedAt
	);
	const output = {
		format: "FUNBRIDGE_EXPORT",
		formatVersion: 1,
		exportedAt: capturedAt,
		source: {
			platform: "FUNBRIDGE_WEB",
			captureMode: "NETWORK_RESPONSE",
			locale: "ja-JP",
			capturedAt,
			sourceTournamentId: id,
			...(capture.parentEvent
				? { sourceParentTournamentId: archiveId(capture.parentEvent) }
				: {}),
		},
		tournament: metadata,
		standingsCoverage: {
			scope: "NONE",
			totalCount: metadata.participantCount ?? 0,
			rowCount: 0,
		},
		boards: [],
		partialBoards: [],
	};
	for (const entry of capture.boards) {
		if (capture.kind === "KNOCKOUT") {
			output.partialBoards.push(normalizeKnockoutBoard(entry, capture));
			continue;
		}
		const normalized = normalizeStandardBoard(entry, capture, type);
		output[normalized.collection].push(normalized.board);
	}
	const mismatches = [...output.boards, ...output.partialBoards].filter(
		(board) => board.comparison?.contractGroupIntegrity === "MISMATCH"
	).length;
	const warnings = [];
	if (mismatches) {
		warnings.push(`CONTRACT_GROUP_PARTICIPANT_MISMATCH:${mismatches}`);
	}
	if (capture.kind === "KNOCKOUT") {
		warnings.push("KNOCKOUT_SUMMARY_RESULT_SENTINELS");
	}
	if (output.partialBoards.length) {
		warnings.push(`PARTIAL_BOARDS:${output.partialBoards.length}`);
	}
	if (warnings.length) {
		output.source.warnings = warnings;
	}
	return output;
}

export function outputFileName(familyDirectory, output) {
	const localDate = new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Asia/Tokyo",
	}).format(new Date(output.tournament.playedAt));
	return `funbridge-export/${familyDirectory}/${localDate}_${output.source.sourceTournamentId}.network.json`;
}
