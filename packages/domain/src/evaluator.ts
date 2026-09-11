import {
	getRule,
	JCBL_LIST_A_2026_05_01,
	type OfficialItemId,
	type RuleDefinition,
} from "./ruleset";
import type {
	AuctionCall,
	BridgeDeal,
	PlayAction,
	RuleEvaluationResult,
	Seat,
	SystemSnapshot,
} from "./types";

export const RULE_ENGINE_VERSION = "2.1.0" as const;

export interface EvaluationInput {
	auction?: AuctionCall[];
	deal: BridgeDeal;
	heroSeat?: Seat;
	play?: PlayAction[];
	playComplete: boolean;
	system?: SystemSnapshot;
}

interface Bid {
	level: number;
	strain: "C" | "D" | "H" | "S" | "NT";
}

interface EvaluationContext {
	calls: AuctionCall[];
	hand: string;
	heroCalls: AuctionCall[];
	heroSeat: Seat;
	input: EvaluationInput;
	lengths: Record<"C" | "D" | "H" | "S", number>;
	points: number;
	system: SystemSnapshot;
}

type RuleEvaluator = (
	rule: RuleDefinition,
	context: EvaluationContext
) => RuleEvaluationResult;

const seatOrder: Seat[] = ["N", "E", "S", "W"];
const suitOrder = ["S", "H", "D", "C"] as const;
const suitRank = { C: 0, D: 1, H: 2, S: 3, NT: 4 } as const;
const rankOrder = "AKQJT98765432";
const passCallPattern = /^(PASS|PAS|P)$/;
const doubleCallPattern = /^(DOUBLE|DBL|D)$/;
const redoubleCallPattern = /^(REDOUBLE|RDBL|RD|XX)$/;
const annotationPattern = /[!?]+$/g;
const bidPattern = /^([1-7])(NT|[CDHS])$/;
const honorPattern = /[AKQJ]/;

function result(
	ruleVersionId: string,
	automaticVerdict: RuleEvaluationResult["automaticVerdict"],
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {},
	actionIndex?: number
): RuleEvaluationResult {
	return {
		...(actionIndex === undefined ? {} : { actionIndex }),
		automaticVerdict,
		evaluationKey: `${ruleVersionId}:board`,
		facts,
		reasonCode,
		ruleVersionId,
	};
}

function complied(
	rule: RuleDefinition,
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {},
	action?: AuctionCall | PlayAction
) {
	return result(rule.versionId, "COMPLIED", reasonCode, facts, action?.index);
}

function wrong(
	rule: RuleDefinition,
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {},
	action?: AuctionCall | PlayAction
) {
	return result(
		rule.versionId,
		"DEVIATED_WRONG_APPLICATION",
		reasonCode,
		facts,
		action?.index
	);
}

function missed(
	rule: RuleDefinition,
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {},
	action?: AuctionCall | PlayAction
) {
	return result(
		rule.versionId,
		"DEVIATED_MISSED_OPPORTUNITY",
		reasonCode,
		facts,
		action?.index
	);
}

function notApplicable(
	rule: RuleDefinition,
	reasonCode = "NO_OBJECTIVE_OPPORTUNITY"
) {
	return result(rule.versionId, "NOT_APPLICABLE", reasonCode);
}

function indeterminate(
	rule: RuleDefinition,
	reasonCode: string,
	facts: RuleEvaluationResult["facts"] = {}
) {
	return result(rule.versionId, "INDETERMINATE", reasonCode, facts);
}

function normalizeCall(call: string): string {
	return call
		.trim()
		.toUpperCase()
		.replaceAll("♣", "C")
		.replaceAll("♦", "D")
		.replaceAll("♥", "H")
		.replaceAll("♠", "S")
		.replace(passCallPattern, "PASS")
		.replace(doubleCallPattern, "X")
		.replace(redoubleCallPattern, "XX")
		.replace(annotationPattern, "");
}

function parseBid(call: string): Bid | undefined {
	const match = bidPattern.exec(normalizeCall(call));
	if (!match) {
		return;
	}
	return {
		level: Number(match[1]),
		strain: match[2] as Bid["strain"],
	};
}

function partner(seat: Seat): Seat {
	return seatOrder[(seatOrder.indexOf(seat) + 2) % 4] ?? "N";
}

function samePartnership(left: Seat, right: Seat): boolean {
	return seatOrder.indexOf(left) % 2 === seatOrder.indexOf(right) % 2;
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
		return rank === "J" ? total + 1 : total;
	}, 0);
}

function holdings(hand: string): Record<(typeof suitOrder)[number], string> {
	const values = hand.split(".");
	return {
		S: values[0] ?? "",
		H: values[1] ?? "",
		D: values[2] ?? "",
		C: values[3] ?? "",
	};
}

function controls(hand: string): number {
	return [...hand].reduce((total, rank) => {
		if (rank === "A") {
			return total + 2;
		}
		return rank === "K" ? total + 1 : total;
	}, 0);
}

function losersInSuit(suit: string): number {
	if (suit.length === 0) {
		return 0;
	}
	const considered = Math.min(3, suit.length);
	return ["A", "K", "Q"]
		.slice(0, considered)
		.filter((rank) => !suit.includes(rank)).length;
}

function losers(hand: string): number {
	return hand.split(".").reduce((total, suit) => total + losersInSuit(suit), 0);
}

function isBalanced(hand: string): boolean {
	const lengths = hand.split(".").map((suit) => suit.length);
	return Math.min(...lengths) >= 2 && Math.max(...lengths) <= 5;
}

function firstHeroCall(context: EvaluationContext): AuctionCall | undefined {
	return context.heroCalls[0];
}

function heroCallAfter(
	context: EvaluationContext,
	actionIndex: number
): AuctionCall | undefined {
	return context.heroCalls.find((call) => call.index > actionIndex);
}

function callsBefore(
	context: EvaluationContext,
	action: AuctionCall
): AuctionCall[] {
	const position = context.calls.findIndex(
		(call) => call.index === action.index
	);
	return position < 0 ? [] : context.calls.slice(0, position);
}

function firstContractCall(calls: AuctionCall[]): AuctionCall | undefined {
	return calls.find((call) => parseBid(call.call));
}

function openingBy(
	context: EvaluationContext,
	seat: Seat
): AuctionCall | undefined {
	const opening = firstContractCall(context.calls);
	return opening?.seat === seat ? opening : undefined;
}

function responseAfter(
	context: EvaluationContext,
	opening: AuctionCall
): AuctionCall | undefined {
	return context.calls.find(
		(call) => call.index > opening.index && call.seat === context.heroSeat
	);
}

function bidSuitLength(context: EvaluationContext, bid: Bid): number {
	return bid.strain === "NT" ? 0 : context.lengths[bid.strain];
}

function naturalOpeningMinLength(
	context: EvaluationContext,
	suit: "C" | "D" | "H" | "S"
): number {
	if (suit === "C") {
		return context.system.settings.opening.oneClubMinLength;
	}
	if (suit === "D") {
		return context.system.settings.opening.oneDiamondMinLength;
	}
	return context.system.settings.opening.oneMajorMinLength;
}

function naturalResponseMinLength(bid: Bid): number {
	if (bid.strain === "NT") {
		return 0;
	}
	if (bid.level > 1) {
		return 5;
	}
	return bid.strain === "H" || bid.strain === "S" ? 4 : 3;
}

function naturalOpeningCandidate(
	context: EvaluationContext
): string | undefined {
	const { opening } = context.system.settings;
	if (
		context.points >= opening.oneNtMinHcp &&
		context.points <= opening.oneNtMaxHcp &&
		isBalanced(context.hand)
	) {
		return "1NT";
	}
	if (
		context.points >= opening.weakTwoMinHcp &&
		context.points <= opening.weakTwoMaxHcp
	) {
		for (const suit of ["S", "H", "D"] as const) {
			const length = context.lengths[suit];
			if (length >= 5 && context.points + length >= 10) {
				return `2${suit}`;
			}
		}
	}
	if (context.points < opening.oneLevelMinHcp) {
		return;
	}
	for (const suit of ["S", "H", "D", "C"] as const) {
		const minimum = naturalOpeningMinLength(context, suit);
		if (context.lengths[suit] >= minimum) {
			return `1${suit}`;
		}
	}
	return;
}

function strongTwoClubEligible(context: EvaluationContext): boolean {
	const variants = context.system.selectedVariants["A-OB-02"] ?? [];
	if (variants.includes("20+ HCP") && context.points >= 20) {
		return true;
	}
	const handLosers = losers(context.hand);
	const hasMajor = context.lengths.S >= 5 || context.lengths.H >= 5;
	if (
		variants.includes("17+ HCP loser definition") &&
		context.points >= 17 &&
		handLosers <= (hasMajor ? 4 : 3)
	) {
		return true;
	}
	return (
		variants.includes("14+ HCP and 5+ controls") &&
		context.points >= 14 &&
		controls(context.hand) >= 5 &&
		handLosers <= (hasMajor ? 4 : 3)
	);
}

function evaluateNaturalOpening(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const action = firstHeroCall(context);
	if (!action || firstContractCall(callsBefore(context, action))) {
		return notApplicable(rule);
	}
	const call = normalizeCall(action.call);
	const bid = parseBid(call);
	const candidate = naturalOpeningCandidate(context);
	if (call === "PASS") {
		return candidate
			? missed(rule, "NATURAL_OPENING_MISSED", { expected: candidate }, action)
			: notApplicable(rule);
	}
	if (!bid || (bid.level === 2 && bid.strain === "C")) {
		return notApplicable(rule);
	}
	const { opening } = context.system.settings;
	let valid = false;
	if (bid.level === 1 && bid.strain === "NT") {
		valid =
			context.points >= opening.oneNtMinHcp &&
			context.points <= opening.oneNtMaxHcp &&
			isBalanced(context.hand);
	} else if (bid.level === 1 && bid.strain !== "NT") {
		const minimum = naturalOpeningMinLength(context, bid.strain);
		valid =
			context.points >= opening.oneLevelMinHcp &&
			bidSuitLength(context, bid) >= minimum;
	} else if (bid.level === 2 && ["D", "H", "S"].includes(bid.strain)) {
		const length = bidSuitLength(context, bid);
		valid =
			context.points >= opening.weakTwoMinHcp &&
			context.points <= opening.weakTwoMaxHcp &&
			length >= 5 &&
			context.points + length >= 10;
	} else {
		return notApplicable(rule);
	}
	const facts = {
		call,
		hcp: context.points,
		suitLength: bidSuitLength(context, bid),
	};
	return valid
		? complied(rule, "NATURAL_OPENING_COMPLIED", facts, action)
		: wrong(rule, "NATURAL_OPENING_OUTSIDE_AGREEMENT", facts, action);
}

function evaluateStrongTwoClub(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const action = firstHeroCall(context);
	if (!action || firstContractCall(callsBefore(context, action))) {
		return notApplicable(rule);
	}
	const call = normalizeCall(action.call);
	const eligible = strongTwoClubEligible(context);
	const facts = {
		controls: controls(context.hand),
		hcp: context.points,
		losers: losers(context.hand),
	};
	if (call === "2C") {
		return eligible
			? complied(rule, "STRONG_2C_DEFINITION_MET", facts, action)
			: wrong(rule, "STRONG_2C_DEFINITION_NOT_MET", facts, action);
	}
	return eligible
		? missed(
				rule,
				"STRONG_2C_OPENING_MISSED",
				{ ...facts, actual: call },
				action
			)
		: notApplicable(rule);
}

function responseContext(context: EvaluationContext) {
	const partnerOpening = openingBy(context, partner(context.heroSeat));
	return partnerOpening
		? {
				action: responseAfter(context, partnerOpening),
				opening: partnerOpening,
				openingBid: parseBid(partnerOpening.call),
			}
		: undefined;
}

function evaluateNaturalOpenerRebid(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const opening = openingBy(context, context.heroSeat);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	if (!(opening && openingBid)) {
		return;
	}
	const partnerAction = context.calls.find(
		(call) =>
			call.index > opening.index && call.seat === partner(context.heroSeat)
	);
	const action = partnerAction
		? heroCallAfter(context, partnerAction.index)
		: undefined;
	if (!action) {
		return;
	}
	const call = normalizeCall(action.call);
	if (call === "PASS") {
		return indeterminate(rule, "OPENER_REBID_FORCING_STATUS_NOT_OBJECTIVE", {
			actionIndex: action.index,
		});
	}
	const bid = parseBid(call);
	if (!bid) {
		return;
	}
	const settings = context.system.settings.responseRebid;
	const isNewSuit = bid.strain !== "NT" && bid.strain !== openingBid.strain;
	let minimumLength = 0;
	if (bid.strain !== "NT") {
		minimumLength = isNewSuit
			? settings.openerRebidNewSuitMinLength
			: naturalOpeningMinLength(context, bid.strain);
	}
	const length = bidSuitLength(context, bid);
	const shapeValid =
		bid.strain === "NT" ? isBalanced(context.hand) : length >= minimumLength;
	const facts = {
		call,
		hcp: context.points,
		length,
		minimumLength,
		role: "OPENER_REBID",
	};
	return context.points >= settings.openerRebidMinHcp && shapeValid
		? complied(rule, "NATURAL_OPENER_REBID_COMPLIED", facts, action)
		: wrong(rule, "NATURAL_OPENER_REBID_OUTSIDE_AGREEMENT", facts, action);
}

function evaluateNaturalResponderRebid(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const opening = openingBy(context, partner(context.heroSeat));
	if (!opening) {
		return;
	}
	const response = responseAfter(context, opening);
	if (!response) {
		return;
	}
	const partnerRebid = context.calls.find(
		(call) =>
			call.index > response.index &&
			call.seat === partner(context.heroSeat) &&
			Boolean(parseBid(call.call))
	);
	const action = partnerRebid
		? heroCallAfter(context, partnerRebid.index)
		: undefined;
	if (!(partnerRebid && action)) {
		return;
	}

	const call = normalizeCall(action.call);
	if (call === "PASS") {
		return indeterminate(rule, "RESPONDER_REBID_FORCING_STATUS_NOT_OBJECTIVE", {
			actionIndex: action.index,
			partnerRebid: normalizeCall(partnerRebid.call),
		});
	}
	const bid = parseBid(call);
	if (!bid) {
		return;
	}

	const partnerRebidBid = parseBid(partnerRebid.call);
	const isSpecificConvention =
		call === "4NT" ||
		call === "5NT" ||
		(call === "4C" && partnerRebidBid?.strain === "NT");
	if (isSpecificConvention) {
		return notApplicable(rule, "MORE_SPECIFIC_CONVENTION_APPLIES");
	}

	const responseBid = parseBid(response.call);
	const priorPartnershipSuits = new Set(
		context.calls
			.filter(
				(prior) =>
					prior.index < action.index &&
					samePartnership(prior.seat, context.heroSeat)
			)
			.map((prior) => parseBid(prior.call)?.strain)
			.filter((strain): strain is "C" | "D" | "H" | "S" =>
				Boolean(strain && strain !== "NT")
			)
	);
	const settings = context.system.settings.responseRebid;
	let minimumLength = 0;
	let suitRole: "NOTRUMP" | "OWN_SUIT" | "SUPPORT" | "NEW_SUIT" = "NOTRUMP";
	if (bid.strain !== "NT") {
		if (responseBid?.strain === bid.strain) {
			suitRole = "OWN_SUIT";
			minimumLength = naturalResponseMinLength(bid);
		} else if (priorPartnershipSuits.has(bid.strain)) {
			suitRole = "SUPPORT";
			minimumLength = 3;
		} else {
			suitRole = "NEW_SUIT";
			minimumLength = settings.responderRebidNewSuitMinLength;
		}
	}
	const length = bidSuitLength(context, bid);
	const shapeValid =
		bid.strain === "NT" ? isBalanced(context.hand) : length >= minimumLength;
	const facts = {
		call,
		hcp: context.points,
		length,
		minimumLength,
		partnerRebid: normalizeCall(partnerRebid.call),
		role: "RESPONDER_REBID",
		suitRole,
	};
	return context.points >= settings.responderRebidMinHcp && shapeValid
		? complied(rule, "NATURAL_RESPONDER_REBID_COMPLIED", facts, action)
		: wrong(rule, "NATURAL_RESPONDER_REBID_OUTSIDE_AGREEMENT", facts, action);
}

function evaluateNaturalResponse(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const responderRebid = evaluateNaturalResponderRebid(rule, context);
	if (responderRebid) {
		return responderRebid;
	}
	const response = responseContext(context);
	if (!(response?.action && response.openingBid)) {
		return evaluateNaturalOpenerRebid(rule, context) ?? notApplicable(rule);
	}
	const call = normalizeCall(response.action.call);
	const bid = parseBid(call);
	const conventional =
		(response.openingBid.strain === "NT" &&
			["2C", "4C", "5C"].includes(call)) ||
		(response.openingBid.level === 2 && ["2D", "2NT"].includes(call));
	if (conventional) {
		return notApplicable(rule, "MORE_SPECIFIC_CONVENTION_APPLIES");
	}
	if (call === "PASS") {
		return context.points >=
			context.system.settings.responseRebid.minimumResponseHcp
			? missed(
					rule,
					"NATURAL_RESPONSE_MISSED",
					{ hcp: context.points },
					response.action
				)
			: notApplicable(rule);
	}
	if (!bid) {
		return notApplicable(rule);
	}
	const minimumLength = naturalResponseMinLength(bid);
	const valid =
		context.points >=
			context.system.settings.responseRebid.minimumResponseHcp &&
		(bid.strain === "NT" || bidSuitLength(context, bid) >= minimumLength);
	const facts = {
		call,
		hcp: context.points,
		minimumLength,
		suitLength: bidSuitLength(context, bid),
	};
	return valid
		? complied(rule, "NATURAL_RESPONSE_COMPLIED", facts, response.action)
		: wrong(rule, "NATURAL_RESPONSE_OUTSIDE_AGREEMENT", facts, response.action);
}

function evaluateStayman(rule: RuleDefinition, context: EvaluationContext) {
	const response = responseContext(context);
	if (
		!(
			response?.action &&
			response.openingBid?.level === 1 &&
			response.openingBid.strain === "NT"
		)
	) {
		return notApplicable(rule);
	}
	const call = normalizeCall(response.action.call);
	const eligible = context.lengths.H >= 4 || context.lengths.S >= 4;
	const facts = {
		hearts: context.lengths.H,
		hcp: context.points,
		spades: context.lengths.S,
	};
	if (call === "2C") {
		return eligible
			? complied(rule, "STAYMAN_USED", facts, response.action)
			: wrong(rule, "STAYMAN_WITHOUT_FOUR_CARD_MAJOR", facts, response.action);
	}
	return eligible
		? missed(
				rule,
				"STAYMAN_OPPORTUNITY_MISSED",
				{ ...facts, actual: call },
				response.action
			)
		: notApplicable(rule);
}

function evaluateArtificialTwoDiamond(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const response = responseContext(context);
	if (!(response?.action && normalizeCall(response.opening.call) === "2C")) {
		return notApplicable(rule);
	}
	const call = normalizeCall(response.action.call);
	const weak =
		context.points <= context.system.settings.responseRebid.weakResponseMaxHcp;
	if (call === "2D") {
		return weak
			? complied(
					rule,
					"ARTIFICIAL_2D_RESPONSE_COMPLIED",
					{ hcp: context.points },
					response.action
				)
			: wrong(
					rule,
					"ARTIFICIAL_2D_RESPONSE_OUTSIDE_WEAK_RANGE",
					{ hcp: context.points },
					response.action
				);
	}
	return weak
		? missed(
				rule,
				"ARTIFICIAL_2D_RESPONSE_MISSED",
				{ actual: call, hcp: context.points },
				response.action
			)
		: notApplicable(rule);
}

function evaluateWeakTwoNtToStrongTwo(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const response = responseContext(context);
	if (
		!(
			response?.action &&
			response.openingBid?.level === 2 &&
			["D", "H", "S"].includes(response.openingBid.strain)
		)
	) {
		return notApplicable(rule);
	}
	const openerPoints = hcp(context.input.deal.hands[response.opening.seat]);
	if (openerPoints < context.system.settings.opening.naturalStrongTwoMinHcp) {
		return notApplicable(rule, "OPENING_CLASSIFIED_AS_WEAK_TWO");
	}
	const call = normalizeCall(response.action.call);
	const weak =
		context.points <= context.system.settings.responseRebid.weakResponseMaxHcp;
	if (call === "2NT") {
		return weak
			? complied(
					rule,
					"WEAK_2NT_TO_STRONG_TWO_COMPLIED",
					{ hcp: context.points },
					response.action
				)
			: wrong(
					rule,
					"WEAK_2NT_TO_STRONG_TWO_OUTSIDE_RANGE",
					{ hcp: context.points },
					response.action
				);
	}
	return weak
		? missed(
				rule,
				"WEAK_2NT_TO_STRONG_TWO_MISSED",
				{ actual: call, hcp: context.points },
				response.action
			)
		: notApplicable(rule);
}

function evaluateWeakTwoInquiry(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const response = responseContext(context);
	if (
		!(
			response?.action &&
			response.openingBid?.level === 2 &&
			["D", "H", "S"].includes(response.openingBid.strain)
		)
	) {
		return notApplicable(rule);
	}
	const openerPoints = hcp(context.input.deal.hands[response.opening.seat]);
	if (openerPoints > context.system.settings.opening.weakTwoMaxHcp) {
		return notApplicable(rule, "OPENING_CLASSIFIED_AS_STRONG_TWO");
	}
	const call = normalizeCall(response.action.call);
	const eligible =
		context.points >=
		context.system.settings.responseRebid.weakTwoInquiryMinHcp;
	if (call === "2NT") {
		return eligible
			? complied(
					rule,
					"WEAK_TWO_2NT_INQUIRY_USED",
					{ hcp: context.points },
					response.action
				)
			: wrong(
					rule,
					"WEAK_TWO_2NT_INQUIRY_OUTSIDE_RANGE",
					{ hcp: context.points },
					response.action
				);
	}
	return eligible
		? missed(
				rule,
				"WEAK_TWO_2NT_INQUIRY_MISSED",
				{ actual: call, hcp: context.points },
				response.action
			)
		: notApplicable(rule);
}

function partnershipFit(
	context: EvaluationContext,
	beforeIndex = Number.POSITIVE_INFINITY
): { strain: "C" | "D" | "H" | "S"; length: number } | undefined {
	const partnerBids = context.calls
		.filter(
			(call) =>
				call.index < beforeIndex && call.seat === partner(context.heroSeat)
		)
		.map((call) => parseBid(call.call))
		.filter((bid): bid is Bid => Boolean(bid && bid.strain !== "NT"));
	for (const bid of partnerBids.reverse()) {
		if (bid.strain !== "NT" && context.lengths[bid.strain] >= 3) {
			return { strain: bid.strain, length: context.lengths[bid.strain] };
		}
	}
	return;
}

function expectedBlackwoodResponse(
	context: EvaluationContext,
	ask: AuctionCall,
	action: AuctionCall
): string | undefined {
	const askCall = normalizeCall(ask.call);
	const acesOrKings = [...context.hand].filter((rank) =>
		askCall === "4NT" ? rank === "A" : rank === "K"
	).length;
	const opponentsBetween = context.calls.filter(
		(call) =>
			call.index > ask.index &&
			call.index < action.index &&
			!samePartnership(call.seat, context.heroSeat) &&
			normalizeCall(call.call) !== "PASS"
	);
	if (opponentsBetween.length === 0) {
		const steps =
			askCall === "4NT" ? ["5C", "5D", "5H", "5S"] : ["6C", "6D", "6H", "6S"];
		return steps[acesOrKings % 4];
	}
	const method = (context.system.selectedVariants["A-RR-06"] ?? []).find(
		(variant) => ["DOPI", "DEPO", "ROPI"].includes(variant)
	);
	if (method === "DEPO") {
		return acesOrKings % 2 === 0 ? "X" : "PASS";
	}
	if (method === "DOPI" && acesOrKings <= 1) {
		return acesOrKings === 0 ? "X" : "PASS";
	}
	if (
		method === "ROPI" &&
		normalizeCall(opponentsBetween.at(-1)?.call ?? "") === "X" &&
		acesOrKings <= 1
	) {
		return acesOrKings === 0 ? "XX" : "PASS";
	}
	return;
}

function evaluateBlackwood(rule: RuleDefinition, context: EvaluationContext) {
	const partnerAsk = context.calls.find((candidate) => {
		if (candidate.seat !== partner(context.heroSeat)) {
			return false;
		}
		const call = normalizeCall(candidate.call);
		if (call === "4NT") {
			return true;
		}
		return (
			call === "5NT" &&
			context.calls.some(
				(prior) =>
					prior.index < candidate.index &&
					samePartnership(prior.seat, context.heroSeat) &&
					normalizeCall(prior.call) === "4NT"
			)
		);
	});
	const response = partnerAsk
		? heroCallAfter(context, partnerAsk.index)
		: undefined;
	if (partnerAsk && response) {
		const expected = expectedBlackwoodResponse(context, partnerAsk, response);
		if (!expected) {
			return indeterminate(rule, "BLACKWOOD_RESPONSE_STEP_NOT_OBJECTIVE", {
				actual: normalizeCall(response.call),
				ask: normalizeCall(partnerAsk.call),
			});
		}
		const actual = normalizeCall(response.call);
		return actual === expected
			? complied(
					rule,
					"BLACKWOOD_RESPONSE_COMPLIED",
					{ actual, expected },
					response
				)
			: wrong(
					rule,
					"BLACKWOOD_RESPONSE_WRONG_STEP",
					{ actual, expected },
					response
				);
	}
	const action = context.heroCalls.find((candidate) => {
		const call = normalizeCall(candidate.call);
		if (call === "4NT") {
			return Boolean(partnershipFit(context, candidate.index));
		}
		if (call !== "5NT") {
			return false;
		}
		return context.calls.some(
			(prior) =>
				prior.index < candidate.index &&
				samePartnership(prior.seat, context.heroSeat) &&
				normalizeCall(prior.call) === "4NT"
		);
	});
	const fit = action ? partnershipFit(context, action.index) : undefined;
	const eligible = Boolean(
		fit &&
			context.points >= context.system.settings.responseRebid.blackwoodMinHcp
	);
	if (action) {
		return eligible
			? complied(
					rule,
					"BLACKWOOD_ASK_USED",
					{ hcp: context.points, trump: fit?.strain ?? null },
					action
				)
			: wrong(
					rule,
					"BLACKWOOD_WITHOUT_OBJECTIVE_SLAM_CONTEXT",
					{ hcp: context.points, trump: fit?.strain ?? null },
					action
				);
	}
	const opportunity = context.heroCalls.find((candidate) => {
		const bid = parseBid(candidate.call);
		return Boolean(
			bid &&
				bid.level >= 4 &&
				partnershipFit(context, candidate.index) &&
				context.points >= context.system.settings.responseRebid.blackwoodMinHcp
		);
	});
	return opportunity
		? missed(
				rule,
				"BLACKWOOD_OPPORTUNITY_MISSED",
				{
					actual: normalizeCall(opportunity.call),
					hcp: context.points,
					trump: partnershipFit(context, opportunity.index)?.strain ?? null,
				},
				opportunity
			)
		: notApplicable(rule);
}

function evaluateGerber(rule: RuleDefinition, context: EvaluationContext) {
	const response = responseContext(context);
	if (!(response?.action && response.openingBid?.strain === "NT")) {
		return notApplicable(rule);
	}
	const call = normalizeCall(response.action.call);
	const eligible =
		context.points >= context.system.settings.responseRebid.gerberMinHcp;
	if (["4C", "5C"].includes(call)) {
		return eligible
			? complied(
					rule,
					"GERBER_ASK_USED",
					{ hcp: context.points },
					response.action
				)
			: wrong(
					rule,
					"GERBER_OUTSIDE_SLAM_RANGE",
					{ hcp: context.points },
					response.action
				);
	}
	return eligible
		? missed(
				rule,
				"GERBER_OPPORTUNITY_MISSED",
				{ actual: call, hcp: context.points },
				response.action
			)
		: notApplicable(rule);
}

function evaluateGrandSlamForce(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const action = context.heroCalls.find(
		(candidate) =>
			normalizeCall(candidate.call) === "5NT" &&
			Boolean(partnershipFit(context, candidate.index)) &&
			!context.calls.some(
				(prior) =>
					prior.index < candidate.index &&
					samePartnership(prior.seat, context.heroSeat) &&
					normalizeCall(prior.call) === "4NT"
			)
	);
	const fit = action ? partnershipFit(context, action.index) : undefined;
	const eligible = Boolean(
		fit &&
			context.points >=
				context.system.settings.responseRebid.grandSlamForceMinHcp
	);
	if (action) {
		return eligible
			? complied(
					rule,
					"GRAND_SLAM_FORCE_USED",
					{ hcp: context.points, trump: fit?.strain ?? null },
					action
				)
			: wrong(
					rule,
					"GRAND_SLAM_FORCE_WITHOUT_TRUMP_CONTEXT",
					{ hcp: context.points, trump: fit?.strain ?? null },
					action
				);
	}
	const opportunity = context.heroCalls.find((candidate) => {
		const bid = parseBid(candidate.call);
		return Boolean(
			bid &&
				bid.level >= 4 &&
				partnershipFit(context, candidate.index) &&
				context.points >=
					context.system.settings.responseRebid.grandSlamForceMinHcp
		);
	});
	return opportunity
		? missed(
				rule,
				"GRAND_SLAM_FORCE_MISSED",
				{
					actual: normalizeCall(opportunity.call),
					hcp: context.points,
					trump: partnershipFit(context, opportunity.index)?.strain ?? null,
				},
				opportunity
			)
		: notApplicable(rule);
}

function evaluateOneNtRange(rule: RuleDefinition, context: EvaluationContext) {
	const { oneNtMaxHcp, oneNtMinHcp } = context.system.settings.opening;
	const rangeAllowed = oneNtMinHcp >= 15 && oneNtMaxHcp - oneNtMinHcp <= 5;
	const action = firstHeroCall(context);
	if (action && !firstContractCall(callsBefore(context, action))) {
		const call = normalizeCall(action.call);
		const inRange =
			context.points >= oneNtMinHcp &&
			context.points <= oneNtMaxHcp &&
			isBalanced(context.hand);
		if (call === "1NT") {
			return rangeAllowed && inRange
				? complied(
						rule,
						"NT_RANGE_AND_OPENING_COMPLIED",
						{ hcp: context.points, oneNtMaxHcp, oneNtMinHcp },
						action
					)
				: wrong(
						rule,
						"NT_OPENING_OR_RANGE_DISALLOWED",
						{ hcp: context.points, oneNtMaxHcp, oneNtMinHcp },
						action
					);
		}
		if (rangeAllowed && inRange) {
			return missed(
				rule,
				"NATURAL_1NT_OPENING_MISSED",
				{ actual: call, hcp: context.points, oneNtMaxHcp, oneNtMinHcp },
				action
			);
		}
	}
	return rangeAllowed
		? complied(rule, "NT_RANGE_ALLOWED", { oneNtMaxHcp, oneNtMinHcp })
		: wrong(rule, "NT_RANGE_DISALLOWED", { oneNtMaxHcp, oneNtMinHcp });
}

function evaluateFitShowingJump(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const response = responseContext(context);
	if (
		!(
			response?.action &&
			response.openingBid &&
			response.openingBid.strain !== "NT"
		)
	) {
		return notApplicable(rule);
	}
	const call = normalizeCall(response.action.call);
	const bid = parseBid(call);
	const openingBid = response.openingBid;
	const openingStrain = openingBid.strain as "C" | "D" | "H" | "S";
	const isJump = Boolean(
		bid &&
			bid.strain !== "NT" &&
			bid.strain !== openingStrain &&
			bid.level >=
				openingBid.level +
					1 +
					(suitRank[bid.strain] <= suitRank[openingStrain] ? 1 : 0)
	);
	const support = context.lengths[openingStrain];
	const jumpLength =
		bid && bid.strain !== "NT" ? context.lengths[bid.strain] : 0;
	const eligibleSuit = (["S", "H", "D", "C"] as const).find(
		(suit) => suit !== openingStrain && context.lengths[suit] + support >= 9
	);
	const eligible =
		support >= 3 &&
		Boolean(eligibleSuit) &&
		context.points >=
			context.system.settings.responseRebid.fitShowingJumpMinHcp;
	if (isJump) {
		return support >= 3 && support + jumpLength >= 9
			? complied(
					rule,
					"FIT_SHOWING_JUMP_SHAPE_MET",
					{ jumpLength, support },
					response.action
				)
			: wrong(
					rule,
					"FIT_SHOWING_JUMP_SHAPE_FAILED",
					{ jumpLength, support },
					response.action
				);
	}
	return eligible
		? missed(
				rule,
				"FIT_SHOWING_JUMP_MISSED",
				{ actual: call, support, targetSuit: eligibleSuit ?? null },
				response.action
			)
		: notApplicable(rule);
}

function opponentOpening(context: EvaluationContext): AuctionCall | undefined {
	const opening = firstContractCall(context.calls);
	return opening && !samePartnership(opening.seat, context.heroSeat)
		? opening
		: undefined;
}

function evaluateNaturalOvercall(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const opening = opponentOpening(context);
	const action = opening ? responseAfter(context, opening) : undefined;
	if (!(opening && action)) {
		return notApplicable(rule);
	}
	const openingBid = parseBid(opening.call);
	const call = normalizeCall(action.call);
	const bid = parseBid(call);
	const isCue = Boolean(bid && openingBid && bid.strain === openingBid.strain);
	if (bid && bid.strain !== "NT" && !isCue) {
		const level = bid.level;
		const minimumHcp =
			level === 1
				? context.system.settings.overcall.oneLevelMinHcp
				: context.system.settings.overcall.twoLevelMinHcp;
		const minimumLength =
			level === 1
				? context.system.settings.overcall.oneLevelMinLength
				: context.system.settings.overcall.twoLevelMinLength;
		const length = context.lengths[bid.strain];
		return context.points >= minimumHcp && length >= minimumLength
			? complied(
					rule,
					"NATURAL_OVERCALL_COMPLIED",
					{ hcp: context.points, length, minimumHcp, minimumLength },
					action
				)
			: wrong(
					rule,
					"NATURAL_OVERCALL_OUTSIDE_AGREEMENT",
					{ hcp: context.points, length, minimumHcp, minimumLength },
					action
				);
	}
	const candidate = (["S", "H", "D", "C"] as const).find(
		(suit) =>
			context.lengths[suit] >=
			context.system.settings.overcall.oneLevelMinLength
	);
	return call === "PASS" &&
		candidate &&
		context.points >= context.system.settings.overcall.oneLevelMinHcp
		? missed(
				rule,
				"NATURAL_OVERCALL_MISSED",
				{ hcp: context.points, targetSuit: candidate },
				action
			)
		: notApplicable(rule);
}

function unusualSuits(opening: Bid): Array<"C" | "D" | "H" | "S"> {
	if (opening.strain === "S" || opening.strain === "H") {
		return ["C", "D"];
	}
	return (["C", "D", "H", "S"] as const)
		.filter((suit) => suit !== opening.strain)
		.sort((left, right) => suitRank[left] - suitRank[right])
		.slice(0, 2);
}

function evaluateUnusualNt(rule: RuleDefinition, context: EvaluationContext) {
	const opening = opponentOpening(context);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	const action = opening ? responseAfter(context, opening) : undefined;
	if (!(openingBid && action)) {
		return notApplicable(rule);
	}
	const target = unusualSuits(openingBid);
	const shape = target
		.map((suit) => context.lengths[suit])
		.sort((left, right) => right - left);
	const eligible = (shape[0] ?? 0) >= 5 && (shape[1] ?? 0) >= 4;
	const call = normalizeCall(action.call);
	const facts = {
		longest: shape[0] ?? 0,
		secondLongest: shape[1] ?? 0,
		suits: target.join("+"),
	};
	const ntBid = parseBid(call);
	const hasPreviouslyPassed = context.calls.some(
		(candidate) =>
			candidate.index < action.index &&
			candidate.seat === context.heroSeat &&
			normalizeCall(candidate.call) === "PASS"
	);
	if (ntBid?.strain === "NT") {
		const legalLevel = hasPreviouslyPassed || ntBid.level >= 2;
		return eligible && legalLevel
			? complied(rule, "UNUSUAL_NT_SHAPE_MET", facts, action)
			: wrong(
					rule,
					legalLevel
						? "UNUSUAL_NT_SHAPE_FAILED"
						: "UNUSUAL_NT_UNPASSED_BELOW_2NT",
					{ ...facts, hasPreviouslyPassed, level: ntBid.level },
					action
				);
	}
	return eligible
		? missed(
				rule,
				"UNUSUAL_NT_OPPORTUNITY_MISSED",
				{ ...facts, actual: call },
				action
			)
		: notApplicable(rule);
}

function evaluateTakeoutDouble(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const opening = opponentOpening(context);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	const action = opening ? responseAfter(context, opening) : undefined;
	if (!(openingBid && openingBid.strain !== "NT" && action)) {
		return notApplicable(rule);
	}
	const otherLengths = (["S", "H", "D", "C"] as const)
		.filter((suit) => suit !== openingBid.strain)
		.map((suit) => context.lengths[suit]);
	const eligible =
		context.points >= context.system.settings.competitive.takeoutDoubleMinHcp &&
		context.lengths[openingBid.strain] <= 2 &&
		otherLengths.filter((length) => length >= 3).length >= 2;
	const call = normalizeCall(action.call);
	const facts = {
		hcp: context.points,
		opponentSuitLength: context.lengths[openingBid.strain],
	};
	if (call === "X") {
		return eligible
			? complied(rule, "TAKEOUT_DOUBLE_SHAPE_MET", facts, action)
			: wrong(rule, "TAKEOUT_DOUBLE_SHAPE_FAILED", facts, action);
	}
	return eligible
		? missed(rule, "TAKEOUT_DOUBLE_MISSED", { ...facts, actual: call }, action)
		: notApplicable(rule);
}

function evaluateLightnerDouble(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const heroDouble = context.heroCalls.find(
		(candidate) => normalizeCall(candidate.call) === "X"
	);
	const lastBid = context.calls.find((candidate) => {
		const bid = parseBid(candidate.call);
		return Boolean(
			bid &&
				bid.level >= 6 &&
				!samePartnership(candidate.seat, context.heroSeat)
		);
	});
	const action = lastBid ? heroCallAfter(context, lastBid.index) : undefined;
	const bid = lastBid ? parseBid(lastBid.call) : undefined;
	const call = action ? normalizeCall(action.call) : "";
	const isOpponentSlam = Boolean(
		lastBid &&
			bid &&
			bid.level >= 6 &&
			!samePartnership(lastBid.seat, context.heroSeat) &&
			bid.strain !== "NT"
	);
	if (!lastBid && heroDouble) {
		const priorContract = [...callsBefore(context, heroDouble)]
			.reverse()
			.find(
				(candidate) =>
					parseBid(candidate.call) &&
					!samePartnership(candidate.seat, context.heroSeat)
			);
		const priorBid = priorContract ? parseBid(priorContract.call) : undefined;
		if (priorBid && priorBid.level >= 4) {
			return wrong(
				rule,
				"LIGHTNER_DOUBLE_NOT_OVER_SLAM",
				{ contract: normalizeCall(priorContract?.call ?? "") },
				heroDouble
			);
		}
	}
	if (call === "X") {
		return isOpponentSlam
			? complied(
					rule,
					"LIGHTNER_DOUBLE_USED",
					{ contract: normalizeCall(lastBid?.call ?? "") },
					action
				)
			: wrong(
					rule,
					"LIGHTNER_DOUBLE_NOT_OVER_SLAM",
					{ contract: normalizeCall(lastBid?.call ?? "") },
					action
				);
	}
	if (!isOpponentSlam) {
		return notApplicable(rule);
	}
	if (!context.system.settings.competitive.lightnerRequireVoid) {
		return indeterminate(
			rule,
			"LIGHTNER_LEAD_REQUEST_NOT_OBJECTIVELY_DETERMINABLE"
		);
	}
	const voidSuit = (["S", "H", "D", "C"] as const).find(
		(suit) => suit !== bid?.strain && context.lengths[suit] === 0
	);
	return voidSuit
		? missed(
				rule,
				"LIGHTNER_DOUBLE_MISSED_WITH_VOID",
				{ actual: call, voidSuit },
				action
			)
		: indeterminate(rule, "LIGHTNER_LEAD_REQUEST_NOT_OBJECTIVELY_DETERMINABLE");
}

function evaluateNegativeDouble(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const partnerOpening = openingBy(context, partner(context.heroSeat));
	if (!partnerOpening) {
		return notApplicable(rule);
	}
	const overcall = context.calls.find(
		(call) =>
			call.index > partnerOpening.index &&
			!samePartnership(call.seat, context.heroSeat) &&
			parseBid(call.call)
	);
	const action = overcall
		? context.calls.find(
				(call) => call.index > overcall.index && call.seat === context.heroSeat
			)
		: undefined;
	const openingBid = parseBid(partnerOpening.call);
	const overcallBid = overcall ? parseBid(overcall.call) : undefined;
	if (!(action && openingBid && overcallBid)) {
		return notApplicable(rule);
	}
	const unbidMajor = (["H", "S"] as const).find(
		(suit) =>
			suit !== openingBid.strain &&
			suit !== overcallBid.strain &&
			context.lengths[suit] >= 4
	);
	const eligible = Boolean(
		unbidMajor &&
			context.points >= context.system.settings.competitive.negativeDoubleMinHcp
	);
	const call = normalizeCall(action.call);
	const facts = {
		hcp: context.points,
		unbidMajor: unbidMajor ?? null,
	};
	if (call === "X") {
		return eligible
			? complied(rule, "NEGATIVE_DOUBLE_UNBID_MAJOR_SHOWN", facts, action)
			: wrong(rule, "NEGATIVE_DOUBLE_REQUIREMENTS_FAILED", facts, action);
	}
	return eligible
		? missed(rule, "NEGATIVE_DOUBLE_MISSED", { ...facts, actual: call }, action)
		: notApplicable(rule);
}

function evaluateSosRedouble(rule: RuleDefinition, context: EvaluationContext) {
	const double = context.calls.find(
		(call) =>
			normalizeCall(call.call) === "X" &&
			!samePartnership(call.seat, context.heroSeat)
	);
	const action = double
		? context.calls.find(
				(call) => call.index > double.index && call.seat === context.heroSeat
			)
		: undefined;
	if (!action) {
		return notApplicable(rule);
	}
	const alternativeSuits = (["S", "H", "D", "C"] as const).filter(
		(suit) => context.lengths[suit] >= 4
	).length;
	const eligible =
		context.points <= context.system.settings.competitive.sosRedoubleMaxHcp &&
		alternativeSuits >= 2;
	const call = normalizeCall(action.call);
	const facts = { alternativeSuits, hcp: context.points };
	if (call === "XX") {
		return eligible
			? complied(rule, "SOS_REDOUBLE_ESCAPE_SHAPE_MET", facts, action)
			: wrong(rule, "SOS_REDOUBLE_ESCAPE_SHAPE_FAILED", facts, action);
	}
	return eligible
		? missed(rule, "SOS_REDOUBLE_MISSED", { ...facts, actual: call }, action)
		: notApplicable(rule);
}

function evaluateGameForcingCue(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const opening = opponentOpening(context);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	const action = opening ? responseAfter(context, opening) : undefined;
	if (!(openingBid && openingBid.strain !== "NT" && action)) {
		return notApplicable(rule);
	}
	const bid = parseBid(action.call);
	const isCue = bid?.strain === openingBid.strain;
	const eligible =
		context.points >= context.system.settings.competitive.gameForcingCueMinHcp;
	if (isCue) {
		return eligible
			? complied(
					rule,
					"GAME_FORCING_CUE_STRENGTH_MET",
					{ hcp: context.points },
					action
				)
			: wrong(
					rule,
					"GAME_FORCING_CUE_TOO_WEAK",
					{ hcp: context.points },
					action
				);
	}
	return eligible
		? missed(
				rule,
				"GAME_FORCING_CUE_MISSED",
				{ actual: normalizeCall(action.call), hcp: context.points },
				action
			)
		: notApplicable(rule);
}

function evaluateSupportCue(rule: RuleDefinition, context: EvaluationContext) {
	const opening = opponentOpening(context);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	if (!(opening && openingBid && openingBid.strain !== "NT")) {
		return notApplicable(rule);
	}
	const partnerOvercall = context.calls.find(
		(call) =>
			call.index > opening.index &&
			call.seat === partner(context.heroSeat) &&
			parseBid(call.call)
	);
	const partnerBid = partnerOvercall
		? parseBid(partnerOvercall.call)
		: undefined;
	const action = partnerOvercall
		? context.calls.find(
				(call) =>
					call.index > partnerOvercall.index && call.seat === context.heroSeat
			)
		: undefined;
	if (!(action && partnerBid && partnerBid.strain !== "NT")) {
		return notApplicable(rule);
	}
	const support = context.lengths[partnerBid.strain];
	const eligible =
		support >= 3 &&
		context.points >= context.system.settings.competitive.supportCueMinHcp;
	const bid = parseBid(action.call);
	const isCue = bid?.strain === openingBid.strain;
	const facts = { hcp: context.points, support };
	if (isCue) {
		return eligible
			? complied(rule, "SUPPORT_CUE_REQUIREMENTS_MET", facts, action)
			: wrong(rule, "SUPPORT_CUE_REQUIREMENTS_FAILED", facts, action);
	}
	return eligible
		? missed(
				rule,
				"SUPPORT_CUE_MISSED",
				{ ...facts, actual: normalizeCall(action.call) },
				action
			)
		: notApplicable(rule);
}

function expectedLeadRank(
	context: EvaluationContext,
	holding: string
): string | undefined {
	if (holding.includes("A") && holding.includes("K")) {
		return context.system.settings.lead.fromAk;
	}
	for (const sequence of ["AKQ", "KQJ", "QJT", "JT9"]) {
		if ([...sequence].every((rank) => holding.includes(rank))) {
			return sequence[0];
		}
	}
	if (honorPattern.test(holding)) {
		return;
	}
	if (
		context.system.settings.lead.fromSmall === "FOURTH_HIGHEST" &&
		holding.length >= 4
	) {
		return holding[3];
	}
	if (
		context.system.settings.lead.fromSmall === "TOP_OF_NOTHING" &&
		holding.length >= 3
	) {
		return holding[0];
	}
	if (
		context.system.settings.lead.fromSmall === "MUD" &&
		holding.length === 3
	) {
		return holding[1];
	}
	return;
}

function evaluateOpeningLead(rule: RuleDefinition, context: EvaluationContext) {
	const lead = context.input.play?.[0];
	if (!lead || lead.seat !== context.heroSeat) {
		return notApplicable(rule, "HERO_NOT_ON_OPENING_LEAD");
	}
	const suit = lead.card[0] as (typeof suitOrder)[number];
	const rank = lead.card[1] ?? "";
	const holding = holdings(context.hand)[suit] ?? "";
	const expected = expectedLeadRank(context, holding);
	if (!expected) {
		const smallStyle = context.system.settings.lead.fromSmall;
		if (!honorPattern.test(holding) && holding.length > 0) {
			return wrong(
				rule,
				"LEAD_STYLE_PRECONDITION_NOT_MET",
				{ holding, lead: lead.card, style: smallStyle },
				lead
			);
		}
		return notApplicable(rule, "LEAD_HOLDING_HAS_NO_OBJECTIVE_RULE");
	}
	const facts = { expected, holding, lead: lead.card };
	return rank === expected
		? complied(rule, "OPENING_LEAD_COMPLIED", facts, lead)
		: missed(rule, "EXPECTED_OPENING_LEAD_CARD_MISSED", facts, lead);
}

function evaluateSignals(rule: RuleDefinition, context: EvaluationContext) {
	const play = [...(context.input.play ?? [])].sort(
		(left, right) => left.index - right.index
	);
	const heroPlays = play.filter((action) => action.seat === context.heroSeat);
	if (heroPlays.length === 0) {
		return notApplicable(rule, "HERO_HAS_NO_SIGNAL_ACTION");
	}
	const original = holdings(context.hand);
	const countActions = heroPlays.filter((action) => {
		const lead = play.find(
			(candidate) => candidate.trickNumber === action.trickNumber
		);
		return Boolean(
			lead &&
				!samePartnership(lead.seat, context.heroSeat) &&
				lead.card[0] === action.card[0]
		);
	});
	for (const suit of suitOrder) {
		const cards = countActions.filter((action) => action.card[0] === suit);
		if (cards.length < 2 || original[suit].length < 2) {
			continue;
		}
		const firstRank = cards[0]?.card[1] ?? "";
		const secondRank = cards[1]?.card[1] ?? "";
		const highLow =
			rankOrder.indexOf(firstRank) < rankOrder.indexOf(secondRank);
		const even = original[suit].length % 2 === 0;
		const facts = {
			even,
			first: cards[0]?.card ?? "",
			originalLength: original[suit].length,
			second: cards[1]?.card ?? "",
			suit,
		};
		if (highLow === even) {
			return complied(rule, "COUNT_SIGNAL_COMPLIED", facts, cards[0]);
		}
		return wrong(rule, "COUNT_SIGNAL_REVERSED", facts, cards[0]);
	}
	if (!context.input.playComplete) {
		return indeterminate(rule, "SIGNAL_SEQUENCE_INCOMPLETE");
	}
	const first = countActions[0];
	if (first) {
		const suit = first.card[0] as (typeof suitOrder)[number];
		const holding = original[suit];
		if (holding.length >= 2) {
			return missed(
				rule,
				"COUNT_SIGNAL_OPPORTUNITY_NOT_COMPLETED",
				{ first: first.card, originalLength: holding.length, suit },
				first
			);
		}
	}
	return indeterminate(rule, "ATTITUDE_OR_PREFERENCE_INTENT_NOT_OBJECTIVE", {
		heroPlayCount: heroPlays.length,
	});
}

export const RULE_EVALUATORS: Record<OfficialItemId, RuleEvaluator> = {
	"A-OB-01": evaluateNaturalOpening,
	"A-OB-02": evaluateStrongTwoClub,
	"A-RR-01": evaluateNaturalResponse,
	"A-RR-02": evaluateStayman,
	"A-RR-03": evaluateArtificialTwoDiamond,
	"A-RR-04": evaluateWeakTwoNtToStrongTwo,
	"A-RR-05": evaluateWeakTwoInquiry,
	"A-RR-06": evaluateBlackwood,
	"A-RR-07": evaluateGerber,
	"A-RR-08": evaluateGrandSlamForce,
	"A-RR-09": evaluateOneNtRange,
	"A-RR-10": evaluateFitShowingJump,
	"A-CD-01": evaluateNaturalOvercall,
	"A-CD-02": evaluateUnusualNt,
	"A-CD-03": evaluateTakeoutDouble,
	"A-CD-04": evaluateLightnerDouble,
	"A-CD-05": evaluateNegativeDouble,
	"A-CD-06": evaluateSosRedouble,
	"A-CD-07": evaluateGameForcingCue,
	"A-CD-08": evaluateSupportCue,
	"A-CA-01": evaluateOpeningLead,
	"A-CA-02": evaluateSignals,
};

function makeContext(input: EvaluationInput): EvaluationContext | undefined {
	if (!(input.heroSeat && input.system)) {
		return;
	}
	const hand = input.deal.hands[input.heroSeat];
	const parsed = holdings(hand);
	const calls = [...(input.auction ?? [])].sort(
		(left, right) => left.index - right.index
	);
	return {
		calls,
		hand,
		heroCalls: calls.filter((call) => call.seat === input.heroSeat),
		heroSeat: input.heroSeat,
		input,
		lengths: {
			C: parsed.C.length,
			D: parsed.D.length,
			H: parsed.H.length,
			S: parsed.S.length,
		},
		points: hcp(hand),
		system: input.system,
	};
}

export function evaluateOfficialItem(
	officialItemId: OfficialItemId,
	input: EvaluationInput
): RuleEvaluationResult {
	const rule = getRule(officialItemId);
	if (!rule) {
		throw new Error(`Unknown official item: ${officialItemId}`);
	}
	if (!input.system) {
		return indeterminate(rule, "SYSTEM_NOT_ASSIGNED");
	}
	if (!input.system.adoptedOfficialItemIds.includes(officialItemId)) {
		return notApplicable(rule, "RULE_NOT_ADOPTED");
	}
	if (!input.heroSeat) {
		return indeterminate(rule, "HERO_SEAT_UNKNOWN");
	}
	if (rule.category === "CARDING" && input.play === undefined) {
		return indeterminate(rule, "PLAY_MISSING");
	}
	if (rule.category !== "CARDING" && input.auction === undefined) {
		return indeterminate(rule, "AUCTION_MISSING");
	}
	const context = makeContext(input);
	if (!context) {
		return indeterminate(rule, "EVALUATION_CONTEXT_INCOMPLETE");
	}
	const evaluator = RULE_EVALUATORS[officialItemId];
	if (!evaluator) {
		throw new Error(`Evaluator not registered: ${officialItemId}`);
	}
	return evaluator(rule, context);
}

export function evaluateBoard(input: EvaluationInput): RuleEvaluationResult[] {
	return JCBL_LIST_A_2026_05_01.map((rule) =>
		evaluateOfficialItem(rule.officialItemId, input)
	);
}
