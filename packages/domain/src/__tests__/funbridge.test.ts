import { describe, expect, it } from "vitest";

import {
	dealToPbn,
	parseFunbridgeJson,
	parseFunbridgeTournamentJson,
} from "../funbridge";
import bpCircuitFixture from "./fixtures/funbridge-bp-circuit.json";
import capturedBpCircuitFixture from "./fixtures/funbridge-bp-circuit-captured-anonymized.json";
import dailyFixture from "./fixtures/funbridge-daily.json";
import capturedDailyFixture from "./fixtures/funbridge-daily-captured-anonymized.json";
import seriesFixture from "./fixtures/funbridge-series.json";
import capturedSeriesFixture from "./fixtures/funbridge-series-captured-anonymized.json";

function fixture(name: string): string {
	const fixtures: Record<string, unknown> = {
		"funbridge-bp-circuit.json": bpCircuitFixture,
		"funbridge-daily.json": dailyFixture,
		"funbridge-series.json": seriesFixture,
	};
	return JSON.stringify(fixtures[name]);
}

describe("Funbridge JSON import profile", () => {
	it.each([
		["funbridge-bp-circuit.json", "BP_CIRCUIT", "level", "100"],
		["funbridge-daily.json", "DAILY", "region", "JAPAN"],
		["funbridge-series.json", "SERIES", "outcome", "PENDING"],
	] as const)("normalizes %s", (name, family, metadataKey, metadataValue) => {
		const parsed = parseFunbridgeTournamentJson(fixture(name));
		expect(parsed.family).toBe(family);
		expect(parsed.familyMetadata[metadataKey]).toBe(metadataValue);
		expect(parsed.boards).toHaveLength(1);
		expect(parsed.kind).toBe("TOURNAMENT");
	});

	it("retains missing-data warnings without inventing play", () => {
		const parsed = parseFunbridgeTournamentJson(
			fixture("funbridge-series.json")
		);
		expect(parsed.warnings).toEqual([
			"BOARD_COUNT_MISMATCH",
			"BOARD_7_AUCTION_MISSING",
			"BOARD_7_PLAY_INCOMPLETE",
		]);
		expect(parsed.boards[0]?.playComplete).toBe(false);
	});

	it("normalizes an anonymized BP Circuit capture with a complete legal play", () => {
		const parsed = parseFunbridgeTournamentJson(
			JSON.stringify(capturedBpCircuitFixture)
		);
		const board = parsed.boards[0];

		expect(parsed.family).toBe("BP_CIRCUIT");
		expect(parsed.familyMetadata).toEqual({
			awarded: null,
			eventType: "EXPRESS",
			level: "100",
			multiplier: 1,
		});
		expect(parsed.warnings).toEqual([]);
		expect(board?.playComplete).toBe(true);
		expect(board?.auction?.map(({ call }) => call)).toEqual([
			"1C",
			"PASS",
			"PASS",
			"X",
			"PASS",
			"1D",
			"PASS",
			"2C",
			"PASS",
			"2S",
			"PASS",
			"PASS",
			"PASS",
		]);
		expect(board?.play).toHaveLength(52);
		expect(board?.play?.at(-1)).toEqual({
			card: "HJ",
			index: 51,
			seat: "W",
			trickNumber: 13,
		});
	});

	it("normalizes an anonymized Series capture with a complete legal play", () => {
		const parsed = parseFunbridgeTournamentJson(
			JSON.stringify(capturedSeriesFixture)
		);
		const board = parsed.boards[0];

		expect(parsed.family).toBe("SERIES");
		expect(parsed.familyMetadata).toEqual({
			level: "SERIES_11",
			outcome: "PENDING",
			period: "2026-09-01/2026-09-16",
		});
		expect(parsed.warnings).toEqual([]);
		expect(board?.playComplete).toBe(true);
		expect(board?.deal.contract).toBe("3NT");
		expect(board?.deal.declarer).toBe("E");
		expect(board?.deal.result).toBe(0);
		expect(board?.score).toBe(80.21);
		expect(board?.play).toHaveLength(52);
	});

	it("retains an anonymized Daily capture that ended after ten tricks", () => {
		const parsed = parseFunbridgeTournamentJson(
			JSON.stringify(capturedDailyFixture)
		);
		const board = parsed.boards[0];

		expect(parsed.family).toBe("DAILY");
		expect(parsed.familyMetadata).toEqual({ region: "ASIA_OCEANIA" });
		expect(parsed.warnings).toEqual(["BOARD_1_PLAY_INCOMPLETE"]);
		expect(board?.playComplete).toBe(false);
		expect(board?.play).toHaveLength(40);
		expect(board?.deal.contract).toBe("4S");
		expect(board?.deal.result).toBe(0);
		expect(board?.score).toBe(5.91);
	});

	it("rejects a family without its required metadata", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.tournament.daily = undefined;
		expect(() => parseFunbridgeTournamentJson(JSON.stringify(raw))).toThrow();
	});

	it("rejects duplicate action indexes", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].auction[1].index = 0;
		expect(() => parseFunbridgeTournamentJson(JSON.stringify(raw))).toThrow(
			"duplicate indexes"
		);
	});

	it("rejects an auction whose seats do not rotate from the dealer", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].auction[1].seat = "N";
		expect(() => parseFunbridgeTournamentJson(JSON.stringify(raw))).toThrow(
			"BOARD_3_AUCTION_SEAT_ORDER_EXPECTED_W_AT_1"
		);
	});

	it("rejects an invalid 52-card deal", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].hands.N = raw.boards[0].hands.E;
		expect(() => parseFunbridgeTournamentJson(JSON.stringify(raw))).toThrow(
			"DEAL_NOT_UNIQUE_52_CARDS"
		);
	});

	it("rejects a play card that is not held by its recorded seat", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].play = [{ card: "SA", index: 0, seat: "E", trickNumber: 1 }];
		expect(() => parseFunbridgeTournamentJson(JSON.stringify(raw))).toThrow(
			"PLAY_CARD_NOT_IN_HAND"
		);
	});

	it("serializes a normalized deal in PBN seat order", () => {
		const parsed = parseFunbridgeTournamentJson(
			fixture("funbridge-daily.json")
		);
		const board = parsed.boards[0];
		if (!board) {
			throw new Error("Daily fixture has no board");
		}
		expect(dealToPbn(board.deal)).toBe(
			"S:T543.KQJ2.QJ.T98 2.3.T987654.AK76 AKQJ.AT98.32.432 9876.7654.AK.QJ5"
		);
	});

	it("accepts the skill's FUNBRIDGE_EXPORT v1 envelope and partial boards", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.exportedAt = "2026-09-16T00:00:00+09:00";
		raw.source = {
			platform: "FUNBRIDGE_WEB",
			captureMode: "NETWORK_RESPONSE",
			locale: "ja-JP",
			capturedAt: "2026-09-16T00:00:00+09:00",
			sourceTournamentId: "source-daily-3",
		};
		raw.standingsCoverage = { scope: "NONE", totalCount: 0, rowCount: 0 };
		raw.boards[0].source = { sourceDealId: "deal-3" };
		raw.boards[0].comparison = {
			rank: 1,
			participantCount: 1,
			score: 0,
			scoreType: "IMP",
		};
		raw.partialBoards = [
			{
				boardNumber: 4,
				status: "NO_PLAY",
				dealer: "N",
				vulnerability: "None",
				hands: raw.boards[0].hands,
				contract: "2S",
				declarer: "N",
				result: 0,
				score: 0,
				source: { sourceDealId: "deal-4" },
			},
		];
		const parsed = parseFunbridgeJson(JSON.stringify(raw));
		expect(parsed.kind).toBe("TOURNAMENT");
		if (parsed.kind === "TOURNAMENT") {
			expect(parsed.externalId).toBe("source-daily-3");
			expect(parsed.boards).toHaveLength(2);
			expect(parsed.boards[1]?.status).toBe("NO_PLAY");
		}
	});

	it("accepts the skill's FUNBRIDGE_HISTORY_INDEX v1", () => {
		const parsed = parseFunbridgeJson(
			JSON.stringify({
				format: "FUNBRIDGE_HISTORY_INDEX",
				formatVersion: 1,
				capturedAt: "2026-09-16T00:00:00+09:00",
				source: {
					platform: "FUNBRIDGE_WEB",
					captureMode: "NETWORK_RESPONSE",
					locale: "ja-JP",
				},
				family: "DAILY",
				coverage: { scope: "FULL", totalCount: 1, rowCount: 1 },
				tournaments: [
					{
						sourceTournamentId: "daily-4",
						title: "Daily",
						startDate: "2026-09-15T00:00:00+09:00",
						registeredPlayerCount: 100,
						inProgress: false,
						scoreType: "MP",
						score: 54.2,
						rank: 12,
						boardCount: 10,
						daily: { region: "JAPAN" },
					},
				],
			})
		);
		expect(parsed.kind).toBe("HISTORY_INDEX");
		if (parsed.kind === "HISTORY_INDEX") {
			expect(parsed.coverage.scope).toBe("FULL");
			expect(parsed.tournaments[0]?.sourceTournamentId).toBe("daily-4");
		}
	});
});
