import { JCBL_LIST_A_2026_05_01 } from "./ruleset";
import type {
	AuctionCall,
	BridgeDeal,
	PlayAction,
	RuleEvaluationResult,
	SystemSnapshot,
} from "./types";

export const RULE_ENGINE_VERSION = "1.0.0" as const;
const weakTwoPattern = /^2[DHS]$/;
const suitIndexByStrain: Record<string, number> = { S: 0, H: 1, D: 2 };

export interface EvaluationInput {
	auction?: AuctionCall[];
	deal: BridgeDeal;
	heroSeat?: "N" | "E" | "S" | "W";
	play?: PlayAction[];
	playComplete: boolean;
	system?: SystemSnapshot;
}

function result(
	ruleVersionId: string,
	automaticVerdict: RuleEvaluationResult["automaticVerdict"],
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {}
): RuleEvaluationResult {
	return {
		automaticVerdict,
		evaluationKey: `${ruleVersionId}:board`,
		facts,
		reasonCode,
		ruleVersionId,
	};
}

function hcp(hand: string): number {
	return [...hand].reduce((total, rank) => {
		if (rank === "A") {
			return total + 4;
		}
		if (rank === "K") {
			return total + 3;
		}
		if (rank === "Q") {
			return total + 2;
		}
		if (rank === "J") {
			return total + 1;
		}
		return total;
	}, 0);
}

function suitLengths(hand: string): number[] {
	return hand.split(".").map((suit) => suit.length);
}

const suitByLetter = { S: 0, H: 1, D: 2, C: 3 } as const;

function evaluateOpeningLead(
	ruleVersionId: string,
	input: EvaluationInput,
	hand: string
): RuleEvaluationResult | undefined {
	const lead = input.play?.[0];
	if (!lead || lead.seat !== input.heroSeat || !input.system) {
		return;
	}
	const suitIndex = suitByLetter[lead.card[0] as keyof typeof suitByLetter];
	const rank = lead.card[1];
	const holding = hand.split(".")[suitIndex] ?? "";
	if (holding.includes("A") && holding.includes("K")) {
		const expected = input.system.settings.lead.fromAk;
		return result(
			ruleVersionId,
			rank === expected ? "COMPLIED" : "DEVIATED_WRONG_APPLICATION",
			rank === expected ? "AK_LEAD_COMPLIED" : "AK_LEAD_WRONG_CARD",
			{ expected, holding, lead: lead.card }
		);
	}
	const sequences = ["AKQ", "KQJ", "QJT", "JT9"];
	const sequence = sequences.find((candidate) =>
		candidate
			.split("")
			.every((candidateRank) => holding.includes(candidateRank))
	);
	if (sequence) {
		const expected = sequence[0] ?? "";
		return result(
			ruleVersionId,
			rank === expected ? "COMPLIED" : "DEVIATED_WRONG_APPLICATION",
			rank === expected
				? "HONOR_SEQUENCE_COMPLIED"
				: "HONOR_SEQUENCE_WRONG_CARD",
			{ expected, holding, lead: lead.card }
		);
	}
	return;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Boundary evaluators share the same parsed hand facts and remain explicit for auditability.
function evaluateKnownBoundary(
	ruleId: string,
	input: EvaluationInput
): RuleEvaluationResult | undefined {
	const rule = JCBL_LIST_A_2026_05_01.find(
		(item) => item.officialItemId === ruleId
	);
	if (!(rule && input.heroSeat && input.system)) {
		return;
	}
	const heroCalls = (input.auction ?? []).filter(
		(call) => call.seat === input.heroSeat
	);
	const first = heroCalls[0]?.call;
	const hand = input.deal.hands[input.heroSeat];
	const points = hcp(hand);
	const lengths = suitLengths(hand);
	if (ruleId === "A-CA-01") {
		return evaluateOpeningLead(rule.versionId, input, hand);
	}

	if (
		ruleId === "A-OB-01" &&
		first &&
		weakTwoPattern.test(first.replace(" ", ""))
	) {
		const strain = first.at(-1);
		const suitIndex = suitIndexByStrain[strain ?? ""] ?? 2;
		const length = lengths[suitIndex] ?? 0;
		const complies = length >= 5 && points + length >= 10;
		return result(
			rule.versionId,
			complies ? "COMPLIED" : "DEVIATED_WRONG_APPLICATION",
			complies ? "RULE_OF_10_MET" : "RULE_OF_10_FAILED",
			{ hcp: points, suitLength: length }
		);
	}
	if (ruleId === "A-RR-09") {
		const { oneNtMinHcp, oneNtMaxHcp } = input.system.settings.opening;
		const complies = oneNtMinHcp >= 15 && oneNtMaxHcp - oneNtMinHcp <= 5;
		return result(
			rule.versionId,
			complies ? "COMPLIED" : "DEVIATED_WRONG_APPLICATION",
			complies ? "NT_RANGE_ALLOWED" : "NT_RANGE_DISALLOWED",
			{ oneNtMinHcp, oneNtMaxHcp }
		);
	}
	if (ruleId === "A-RR-02") {
		const heroCall = input.auction?.find(
			(call) => call.seat === input.heroSeat
		);
		if (!heroCall) {
			return;
		}
		const previousCall = input.auction?.[heroCall.index - 2]?.call;
		const hasFourCardMajor = (lengths[0] ?? 0) >= 4 || (lengths[1] ?? 0) >= 4;
		if (previousCall === "1NT" && points >= 10 && hasFourCardMajor) {
			const complied = heroCall.call === "2C";
			return result(
				rule.versionId,
				complied ? "COMPLIED" : "DEVIATED_MISSED_OPPORTUNITY",
				complied ? "STAYMAN_USED" : "STAYMAN_OPPORTUNITY_MISSED",
				{ hcp: points, hearts: lengths[1] ?? 0, spades: lengths[0] ?? 0 }
			);
		}
	}
	if (ruleId === "A-CD-02" && first === "2NT") {
		const sorted = [...lengths].sort((a, b) => b - a);
		const complies = (sorted[0] ?? 0) >= 5 && (sorted[1] ?? 0) >= 4;
		return result(
			rule.versionId,
			complies ? "COMPLIED" : "DEVIATED_WRONG_APPLICATION",
			complies ? "UNUSUAL_NT_SHAPE_MET" : "UNUSUAL_NT_SHAPE_FAILED",
			{ longest: sorted[0] ?? 0, secondLongest: sorted[1] ?? 0 }
		);
	}
	return;
}

export function evaluateBoard(input: EvaluationInput): RuleEvaluationResult[] {
	return JCBL_LIST_A_2026_05_01.map((rule) => {
		if (!input.system) {
			return result(rule.versionId, "INDETERMINATE", "SYSTEM_NOT_ASSIGNED");
		}
		if (!input.system.adoptedOfficialItemIds.includes(rule.officialItemId)) {
			return result(rule.versionId, "NOT_APPLICABLE", "RULE_NOT_ADOPTED");
		}
		if (!input.heroSeat) {
			return result(rule.versionId, "INDETERMINATE", "HERO_SEAT_UNKNOWN");
		}
		const known = evaluateKnownBoundary(rule.officialItemId, input);
		if (known) {
			return known;
		}
		if (rule.category === "CARDING" && !input.playComplete) {
			return result(rule.versionId, "INDETERMINATE", "PLAY_INCOMPLETE");
		}
		if (rule.category !== "CARDING" && !input.auction) {
			return result(rule.versionId, "INDETERMINATE", "AUCTION_MISSING");
		}
		return result(
			rule.versionId,
			"INDETERMINATE",
			"INTENT_NOT_OBJECTIVELY_DETERMINABLE"
		);
	});
}
