import { describe, expect, it } from "vitest";

import { dealToPbn, parseFunbridgeJson } from "../funbridge";
import bpCircuitFixture from "./fixtures/funbridge-bp-circuit.json";
import capturedBpCircuitFixture from "./fixtures/funbridge-bp-circuit-captured-anonymized.json";
import dailyFixture from "./fixtures/funbridge-daily.json";
import seriesFixture from "./fixtures/funbridge-series.json";

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
		const parsed = parseFunbridgeJson(fixture(name));
		expect(parsed.family).toBe(family);
		expect(parsed.familyMetadata[metadataKey]).toBe(metadataValue);
		expect(parsed.boards).toHaveLength(1);
		expect(parsed.funbridgeId).toBe("hero-123");
	});

	it("retains missing-data warnings without inventing play", () => {
		const parsed = parseFunbridgeJson(fixture("funbridge-series.json"));
		expect(parsed.warnings).toEqual([
			"BOARD_COUNT_MISMATCH",
			"BOARD_7_AUCTION_MISSING",
			"BOARD_7_PLAY_INCOMPLETE",
		]);
		expect(parsed.boards[0]?.playComplete).toBe(false);
	});

	it("normalizes an anonymized BP Circuit capture with a complete legal play", () => {
		const parsed = parseFunbridgeJson(JSON.stringify(capturedBpCircuitFixture));
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

	it("rejects a family without its required metadata", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.tournament.daily = undefined;
		expect(() => parseFunbridgeJson(JSON.stringify(raw))).toThrow();
	});

	it("rejects duplicate action indexes", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].auction[1].index = 0;
		expect(() => parseFunbridgeJson(JSON.stringify(raw))).toThrow(
			"duplicate indexes"
		);
	});

	it("rejects an invalid 52-card deal", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].hands.N = raw.boards[0].hands.E;
		expect(() => parseFunbridgeJson(JSON.stringify(raw))).toThrow(
			"DEAL_NOT_UNIQUE_52_CARDS"
		);
	});

	it("rejects a play card that is not held by its recorded seat", () => {
		const raw = JSON.parse(fixture("funbridge-daily.json"));
		raw.boards[0].play = [{ card: "SA", index: 0, seat: "E", trickNumber: 1 }];
		expect(() => parseFunbridgeJson(JSON.stringify(raw))).toThrow(
			"PLAY_CARD_NOT_IN_HAND"
		);
	});

	it("serializes a normalized deal in PBN seat order", () => {
		const parsed = parseFunbridgeJson(fixture("funbridge-daily.json"));
		const board = parsed.boards[0];
		if (!board) {
			throw new Error("Daily fixture has no board");
		}
		expect(dealToPbn(board.deal)).toBe(
			"S:T543.KQJ2.QJ.T98 2.3.T987654.AK76 AKQJ.AT98.32.432 9876.7654.AK.QJ5"
		);
	});
});
