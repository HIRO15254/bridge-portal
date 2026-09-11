import { describe, expect, it } from "vitest";

import { evaluateBoard } from "../evaluator";
import { dealToPbn, parseFunbridgeJson } from "../funbridge";
import { contractResultToTricks, exportPbn, parsePbn } from "../pbn";
import { JCBL_LIST_A_2026_05_01, JCBL_RULESET_VERSION } from "../ruleset";
import { calculateComplianceMetrics } from "../statistics";
import { validateSystemDraft } from "../system";
import { defaultSystemSettings, type SystemSnapshot } from "../types";
import dailyFixture from "./fixtures/funbridge-daily.json";

function selectedVariants() {
	return Object.fromEntries(
		JCBL_LIST_A_2026_05_01.map((rule) => {
			if (rule.officialItemId === "A-RR-05") {
				return [rule.officialItemId, ["Feature ask"]];
			}
			if (rule.officialItemId === "A-RR-06") {
				return [rule.officialItemId, ["Blackwood", "5NT king ask", "DOPI"]];
			}
			if (rule.officialItemId === "A-CA-01") {
				return [
					rule.officialItemId,
					["Fourth highest", "Honor sequence", "A from AK"],
				];
			}
			return [rule.officialItemId, [...rule.variants]];
		})
	);
}

describe("MVP learning loop", () => {
	it("runs ruleset → system → Funbridge → evaluation → metrics → PBN", () => {
		const system: SystemSnapshot = {
			adoptedOfficialItemIds: JCBL_LIST_A_2026_05_01.map(
				(rule) => rule.officialItemId
			),
			name: "Standard",
			rulesetVersion: JCBL_RULESET_VERSION,
			selectedVariants: selectedVariants(),
			settings: defaultSystemSettings,
		};
		expect(validateSystemDraft(system)).toEqual([]);

		const imported = parseFunbridgeJson(JSON.stringify(dailyFixture));
		const board = imported.boards[0];
		if (!board) {
			throw new Error("Daily fixture has no board");
		}
		const evaluations = evaluateBoard({
			auction: board.auction,
			deal: board.deal,
			heroSeat: board.heroSeat,
			play: board.play,
			playComplete: board.playComplete,
			system,
		});
		expect(evaluations).toHaveLength(22);

		const counts = Object.entries(
			Object.groupBy(evaluations, (evaluation) => evaluation.automaticVerdict)
		).map(([verdict, values]) => ({ count: values?.length ?? 0, verdict }));
		const metrics = calculateComplianceMetrics(counts);
		expect(metrics.counts).toBeDefined();

		const exported = exportPbn([
			{
				auction: board.auction,
				incompleteAuction: !board.auction,
				incompletePlay: !board.playComplete,
				play: board.play,
				tags: {
					Board: String(board.deal.boardNumber),
					Contract: board.deal.contract ?? "?",
					Deal: dealToPbn(board.deal),
					Dealer: board.deal.dealer,
					Declarer: board.deal.declarer ?? "?",
					Event: imported.name,
					Result: contractResultToTricks(
						board.deal.contract,
						board.deal.result
					),
					Scoring: imported.scoreType,
					System: "Standard v1",
					Vulnerable: board.deal.vulnerability,
				},
				warnings: [],
			},
		]);
		const reparsed = parsePbn(exported).games[0];
		expect(reparsed?.tags.Deal).toBe(dealToPbn(board.deal));
		expect(reparsed?.auction?.map((call) => call.call)).toEqual(
			board.auction?.map((call) => call.call)
		);
	});
});
