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

export const RULE_ENGINE_VERSION = "2.2.1" as const;

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

function hasVariant(
	context: EvaluationContext,
	officialItemId: OfficialItemId,
	variant: string
) {
	return (
		context.system.adoptedOfficialItemIds.includes(officialItemId) &&
		(context.system.selectedVariants[officialItemId] ?? []).includes(variant)
	);
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

function isBalanced(hand: string, allowSingletonTopHonor = false): boolean {
	const suits = hand.split(".");
	const lengths = suits.map((suit) => suit.length);
	if (Math.min(...lengths) >= 2 && Math.max(...lengths) <= 5) {
		return true;
	}
	if (!allowSingletonTopHonor) {
		return false;
	}
	const singletonIndex = lengths.indexOf(1);
	return (
		singletonIndex >= 0 &&
		lengths.every((length, index) =>
			index === singletonIndex ? length === 1 : length === 4
		) &&
		["A", "K", "Q"].includes(suits[singletonIndex] ?? "")
	);
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

function weakTwoHandQualifies(
	context: EvaluationContext,
	hand: string,
	strain: "C" | "D" | "H" | "S"
): boolean {
	const { opening } = context.system.settings;
	const points = hcp(hand);
	const length = holdings(hand)[strain].length;
	const ruleOfTenMet =
		!hasVariant(context, "A-OB-01", "Rule of 10") || points + length >= 10;
	return (
		hasVariant(context, "A-OB-01", "Weak Two") &&
		points >= opening.weakTwoMinHcp &&
		points <= opening.weakTwoMaxHcp &&
		length >= 5 &&
		ruleOfTenMet &&
		(strain !== "C" ||
			!context.system.adoptedOfficialItemIds.includes("A-OB-02"))
	);
}

function naturalStrongTwoHandQualifies(
	context: EvaluationContext,
	hand: string,
	strain: "C" | "D" | "H" | "S"
): boolean {
	const { opening } = context.system.settings;
	return (
		hasVariant(context, "A-OB-01", "Natural Strong Two") &&
		hcp(hand) >= opening.naturalStrongTwoMinHcp &&
		holdings(hand)[strain].length >= opening.naturalStrongTwoMinLength &&
		(strain !== "C" ||
			!context.system.adoptedOfficialItemIds.includes("A-OB-02"))
	);
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

function isJumpShift(openingBid: Bid, responseBid: Bid): boolean {
	return (
		responseBid.strain !== "NT" &&
		responseBid.strain !== openingBid.strain &&
		responseBid.level >=
			openingBid.level +
				1 +
				(suitRank[responseBid.strain] <= suitRank[openingBid.strain] ? 1 : 0)
	);
}

function naturalOpeningCandidate(
	context: EvaluationContext
): string | undefined {
	if (
		context.system.adoptedOfficialItemIds.includes("A-OB-02") &&
		strongTwoClubEligible(context)
	) {
		return;
	}
	const suitCalls = [4, 3, 2, 1].flatMap((level) =>
		(["S", "H", "D", "C"] as const).map((suit) => `${level}${suit}`)
	);
	return ["1NT", "2NT", "3NT", "4NT", ...suitCalls].find((call) => {
		const bid = parseBid(call);
		const agreement = bid ? naturalOpeningAgreement(context, bid) : undefined;
		return agreement?.adopted && agreement.valid;
	});
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

interface NaturalOpeningAgreement {
	adopted: boolean;
	valid: boolean;
}

function naturalNtOpeningAgreement(
	context: EvaluationContext,
	bid: Bid
): NaturalOpeningAgreement | undefined {
	if (bid.strain !== "NT") {
		return;
	}
	const { opening } = context.system.settings;
	const profiles: Partial<
		Record<
			number,
			{
				allowSingletonTopHonor: boolean;
				maximum: number;
				minimum: number;
				variant: string;
			}
		>
	> = {
		1: {
			allowSingletonTopHonor: opening.allowSingletonTopHonor,
			maximum: opening.oneNtMaxHcp,
			minimum: opening.oneNtMinHcp,
			variant: "Natural 1NT",
		},
		2: {
			allowSingletonTopHonor: false,
			maximum: opening.twoNtMaxHcp,
			minimum: opening.twoNtMinHcp,
			variant: "Natural 2NT",
		},
		3: {
			allowSingletonTopHonor: false,
			maximum: opening.threeNtMaxHcp,
			minimum: opening.threeNtMinHcp,
			variant: "Natural 3NT",
		},
	};
	const profile =
		profiles[bid.level] ??
		(bid.level >= 4
			? {
					allowSingletonTopHonor: false,
					maximum: opening.fourPlusNtMaxHcp,
					minimum: opening.fourPlusNtMinHcp,
					variant: "Natural 4+-level NT",
				}
			: undefined);
	if (!profile) {
		return;
	}
	return {
		adopted: hasVariant(context, "A-OB-01", profile.variant),
		valid:
			context.points >= profile.minimum &&
			context.points <= profile.maximum &&
			isBalanced(context.hand, profile.allowSingletonTopHonor),
	};
}

function naturalTwoSuitOpeningAgreement(
	context: EvaluationContext,
	bid: Bid
): NaturalOpeningAgreement | undefined {
	if (bid.level !== 2 || bid.strain === "NT") {
		return;
	}
	if (
		bid.strain === "C" &&
		context.system.adoptedOfficialItemIds.includes("A-OB-02")
	) {
		return;
	}
	const strongAdopted = hasVariant(context, "A-OB-01", "Natural Strong Two");
	const weakAdopted = hasVariant(context, "A-OB-01", "Weak Two");
	return {
		adopted: strongAdopted || weakAdopted,
		valid:
			naturalStrongTwoHandQualifies(context, context.hand, bid.strain) ||
			weakTwoHandQualifies(context, context.hand, bid.strain),
	};
}

function naturalSuitOpeningAgreement(
	context: EvaluationContext,
	bid: Bid
): NaturalOpeningAgreement | undefined {
	if (bid.strain === "NT") {
		return;
	}
	const { opening } = context.system.settings;
	if (bid.level === 1) {
		return {
			adopted: hasVariant(context, "A-OB-01", "1-level natural"),
			valid:
				context.points >= opening.oneLevelMinHcp &&
				bidSuitLength(context, bid) >=
					naturalOpeningMinLength(context, bid.strain),
		};
	}
	if (bid.level === 3) {
		return {
			adopted: hasVariant(context, "A-OB-01", "Natural 3-level"),
			valid:
				context.points >= opening.threeLevelMinHcp &&
				context.points <= opening.threeLevelMaxHcp &&
				bidSuitLength(context, bid) >= opening.threeLevelMinLength,
		};
	}
	return bid.level >= 4
		? {
				adopted: hasVariant(context, "A-OB-01", "Natural 4+-level"),
				valid:
					context.points >= opening.fourPlusLevelMinHcp &&
					context.points <= opening.fourPlusLevelMaxHcp &&
					bidSuitLength(context, bid) >= opening.fourPlusLevelMinLength,
			}
		: undefined;
}

function naturalOpeningAgreement(
	context: EvaluationContext,
	bid: Bid
): NaturalOpeningAgreement | undefined {
	return (
		naturalNtOpeningAgreement(context, bid) ??
		naturalTwoSuitOpeningAgreement(context, bid) ??
		naturalSuitOpeningAgreement(context, bid)
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
	if (
		!bid ||
		(bid.level === 2 &&
			bid.strain === "C" &&
			context.system.adoptedOfficialItemIds.includes("A-OB-02"))
	) {
		return notApplicable(rule);
	}
	const agreement = naturalOpeningAgreement(context, bid);
	if (!agreement) {
		return notApplicable(rule);
	}
	if (!agreement.adopted) {
		return notApplicable(rule, "NATURAL_OPENING_VARIANT_NOT_ADOPTED");
	}
	const facts = {
		call,
		hcp: context.points,
		suitLength: bidSuitLength(context, bid),
	};
	return agreement.valid
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
	const bid = parseBid(call);
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
	const naturalAlternative = bid
		? naturalOpeningAgreement(context, bid)
		: undefined;
	if (naturalAlternative?.adopted && naturalAlternative.valid) {
		return notApplicable(rule, "VALID_NATURAL_OPENING_SELECTED");
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

function isHighLevelConventionAsk(
	context: EvaluationContext,
	call: string
): boolean {
	if (call === "4NT") {
		return hasVariant(context, "A-RR-06", "Blackwood");
	}
	if (call !== "5NT") {
		return false;
	}
	return (
		hasVariant(context, "A-RR-06", "5NT king ask") ||
		hasVariant(context, "A-RR-08", "Grand Slam Force")
	);
}

function isGerberAsk(context: EvaluationContext, call: string): boolean {
	return (
		(call === "4C" && hasVariant(context, "A-RR-07", "4C ace ask")) ||
		(call === "5C" && hasVariant(context, "A-RR-07", "5C king ask"))
	);
}

function isWeakTwoInquiryAsk(
	context: EvaluationContext,
	openingBid: Bid,
	partnerCall: string
): boolean {
	if (partnerCall !== "2NT" || openingBid.level !== 2) {
		return false;
	}
	if (openingBid.strain === "NT") {
		return false;
	}
	return Boolean(
		weakTwoHandQualifies(context, context.hand, openingBid.strain) &&
			(hasVariant(context, "A-RR-05", "Feature ask") ||
				hasVariant(context, "A-RR-05", "Ogust-style ask"))
	);
}

function isSpecificResponderConvention(
	context: EvaluationContext,
	call: string,
	partnerRebidCall: string,
	partnerRebidBid: Bid | undefined
): boolean {
	const heroGerberAsk =
		(call === "4C" &&
			partnerRebidBid?.strain === "NT" &&
			hasVariant(context, "A-RR-07", "4C ace ask")) ||
		(call === "5C" && hasVariant(context, "A-RR-07", "5C king ask"));
	return (
		isHighLevelConventionAsk(context, call) ||
		isHighLevelConventionAsk(context, partnerRebidCall) ||
		heroGerberAsk ||
		isGerberAsk(context, partnerRebidCall)
	);
}

function isSpecificOpenerRebidAsk(
	context: EvaluationContext,
	openingBid: Bid,
	partnerCall: string
): boolean {
	const ntConvention =
		openingBid.strain === "NT" &&
		((partnerCall === "2C" && hasVariant(context, "A-RR-02", "Stayman")) ||
			isGerberAsk(context, partnerCall));
	return (
		ntConvention ||
		isHighLevelConventionAsk(context, partnerCall) ||
		isWeakTwoInquiryAsk(context, openingBid, partnerCall)
	);
}

function evaluateNaturalOpenerRebid(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	if (!hasVariant(context, "A-RR-01", "Opener rebid")) {
		return;
	}
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
	if (!(partnerAction && action)) {
		return;
	}
	const partnerCall = normalizeCall(partnerAction.call);
	if (isSpecificOpenerRebidAsk(context, openingBid, partnerCall)) {
		return notApplicable(rule, "MORE_SPECIFIC_CONVENTION_APPLIES");
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
		bid.strain === "NT"
			? isBalanced(
					context.hand,
					context.system.settings.opening.allowSingletonTopHonor
				)
			: length >= minimumLength;
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
	if (!hasVariant(context, "A-RR-01", "Responder rebid")) {
		return;
	}
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
	const partnerRebidCall = normalizeCall(partnerRebid.call);
	const isSpecificConvention = isSpecificResponderConvention(
		context,
		call,
		partnerRebidCall,
		partnerRebidBid
	);
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
		bid.strain === "NT"
			? isBalanced(
					context.hand,
					context.system.settings.opening.allowSingletonTopHonor
				)
			: length >= minimumLength;
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

function isSpecificTwoNtResponse(
	context: EvaluationContext,
	openingBid: Bid,
	openerHand: string,
	call: string
): boolean {
	if (call !== "2NT" || openingBid.level !== 2 || openingBid.strain === "NT") {
		return false;
	}
	const openingSuit = openingBid.strain;
	return (
		(hasVariant(context, "A-RR-04", "Weak 2NT response") &&
			naturalStrongTwoHandQualifies(context, openerHand, openingSuit)) ||
		((hasVariant(context, "A-RR-05", "Feature ask") ||
			hasVariant(context, "A-RR-05", "Ogust-style ask")) &&
			weakTwoHandQualifies(context, openerHand, openingSuit))
	);
}

function isSpecificInitialResponseConvention(
	context: EvaluationContext,
	opening: AuctionCall,
	openingBid: Bid,
	call: string,
	bid: Bid | undefined
): boolean {
	const openerHand = context.input.deal.hands[opening.seat];
	const ntConvention =
		openingBid.strain === "NT" &&
		((call === "2C" && hasVariant(context, "A-RR-02", "Stayman")) ||
			isGerberAsk(context, call));
	const artificialTwoDiamond =
		normalizeCall(opening.call) === "2C" &&
		call === "2D" &&
		hasVariant(context, "A-RR-03", "Artificial 2D response");
	const fitShowingJump = Boolean(
		bid &&
			openingBid.strain !== "NT" &&
			hasVariant(context, "A-RR-10", "Fit-showing jump") &&
			isJumpShift(openingBid, bid)
	);
	return (
		ntConvention ||
		artificialTwoDiamond ||
		isSpecificTwoNtResponse(context, openingBid, openerHand, call) ||
		isHighLevelConventionAsk(context, call) ||
		fitShowingJump
	);
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
	if (!hasVariant(context, "A-RR-01", "Response")) {
		return notApplicable(rule, "NATURAL_RESPONSE_VARIANT_NOT_ADOPTED");
	}
	const call = normalizeCall(response.action.call);
	const bid = parseBid(call);
	if (
		isSpecificInitialResponseConvention(
			context,
			response.opening,
			response.openingBid,
			call,
			bid
		)
	) {
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

function evaluateStaymanResponse(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const opening = openingBy(context, context.heroSeat);
	if (!opening || normalizeCall(opening.call) !== "1NT") {
		return;
	}
	const ask = context.calls.find(
		(candidate) =>
			candidate.index > opening.index &&
			candidate.seat === partner(context.heroSeat) &&
			normalizeCall(candidate.call) === "2C"
	);
	const action = ask ? heroCallAfter(context, ask.index) : undefined;
	if (!(ask && action)) {
		return;
	}
	const interference = context.calls.some(
		(candidate) =>
			candidate.index > ask.index &&
			candidate.index < action.index &&
			!samePartnership(candidate.seat, context.heroSeat) &&
			normalizeCall(candidate.call) !== "PASS"
	);
	if (interference) {
		return indeterminate(rule, "STAYMAN_INTERFERENCE_NOT_OBJECTIVE");
	}
	let expected = "2D";
	if (context.lengths.H >= 4 && context.lengths.S >= 4) {
		expected = `2${context.system.settings.responseRebid.staymanBothMajorsResponse}`;
	} else if (context.lengths.H >= 4) {
		expected = "2H";
	} else if (context.lengths.S >= 4) {
		expected = "2S";
	}
	const actual = normalizeCall(action.call);
	const facts = {
		actual,
		expected,
		hearts: context.lengths.H,
		spades: context.lengths.S,
	};
	return actual === expected
		? complied(rule, "STAYMAN_RESPONSE_COMPLIED", facts, action)
		: wrong(rule, "STAYMAN_RESPONSE_WRONG", facts, action);
}

function evaluateStayman(rule: RuleDefinition, context: EvaluationContext) {
	const responseVerdict = evaluateStaymanResponse(rule, context);
	if (responseVerdict) {
		return responseVerdict;
	}
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
	const openingStrain = response.openingBid.strain as "D" | "H" | "S";
	const openerHand = context.input.deal.hands[response.opening.seat];
	if (!naturalStrongTwoHandQualifies(context, openerHand, openingStrain)) {
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

function selectedWeakTwoInquiryVariant(context: EvaluationContext) {
	const variants = context.system.selectedVariants["A-RR-05"] ?? [];
	return variants.length === 1 ? variants[0] : undefined;
}

function featureInquiryResponse(
	rule: RuleDefinition,
	context: EvaluationContext,
	openingSuit: "D" | "H" | "S"
) {
	const minimumHonor =
		context.system.settings.responseRebid.weakTwoFeatureMinimumHonor;
	const eligibleRanks = minimumHonor === "A" ? ["A"] : ["A", "K"];
	const features = suitOrder.filter(
		(suit) =>
			suit !== openingSuit &&
			eligibleRanks.some((rank) => holdings(context.hand)[suit].includes(rank))
	);
	if (features.length > 1) {
		return indeterminate(rule, "FEATURE_ASK_MULTIPLE_FEATURES", {
			featureCount: features.length,
			features: features.join("+"),
			minimumHonor,
		});
	}
	return {
		expected: features[0] ? `3${features[0]}` : `3${openingSuit}`,
		facts: { feature: features[0] ?? null, minimumHonor },
	};
}

function ogustInquiryResponse(
	context: EvaluationContext,
	openingSuit: "D" | "H" | "S"
) {
	const topHonors = [...holdings(context.hand)[openingSuit]].filter((rank) =>
		["A", "K", "Q"].includes(rank)
	).length;
	const maximum =
		context.points >=
		context.system.settings.responseRebid.weakTwoOgustMaximumMinHcp;
	const goodSuit =
		topHonors >=
		context.system.settings.responseRebid.weakTwoOgustGoodSuitTopHonors;
	const responseByQuality: Record<string, string> = {
		"false-false": "3C",
		"false-true": "3D",
		"true-false": "3H",
		"true-true": "3S",
	};
	return {
		expected:
			topHonors === 3 ? "3NT" : responseByQuality[`${maximum}-${goodSuit}`],
		facts: { goodSuit, maximum, topHonors },
	};
}

function evaluateWeakTwoInquiryResponse(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const selectedVariant = selectedWeakTwoInquiryVariant(context);
	const heroOpening = openingBy(context, context.heroSeat);
	const heroOpeningBid = heroOpening ? parseBid(heroOpening.call) : undefined;
	if (
		!heroOpening ||
		heroOpeningBid?.level !== 2 ||
		heroOpeningBid.strain === "C" ||
		heroOpeningBid.strain === "NT"
	) {
		return;
	}
	if (!weakTwoHandQualifies(context, context.hand, heroOpeningBid.strain)) {
		return notApplicable(rule, "OPENING_NOT_CLASSIFIED_AS_WEAK_TWO");
	}
	const partnerInquiry = context.calls.find(
		(candidate) =>
			candidate.index > heroOpening.index &&
			candidate.seat === partner(context.heroSeat) &&
			normalizeCall(candidate.call) === "2NT"
	);
	const openerResponse = partnerInquiry
		? heroCallAfter(context, partnerInquiry.index)
		: undefined;
	if (!(partnerInquiry && openerResponse)) {
		return;
	}
	if (!selectedVariant) {
		return indeterminate(rule, "WEAK_TWO_INQUIRY_VARIANT_AMBIGUOUS");
	}
	const response =
		selectedVariant === "Feature ask"
			? featureInquiryResponse(rule, context, heroOpeningBid.strain)
			: ogustInquiryResponse(context, heroOpeningBid.strain);
	if ("automaticVerdict" in response) {
		return response;
	}
	const actual = normalizeCall(openerResponse.call);
	const facts = {
		...response.facts,
		actual,
		expected: response.expected ?? null,
		inquiryVariant: selectedVariant,
	};
	return actual === response.expected
		? complied(
				rule,
				"WEAK_TWO_INQUIRY_RESPONSE_COMPLIED",
				facts,
				openerResponse
			)
		: wrong(
				rule,
				"WEAK_TWO_INQUIRY_RESPONSE_WRONG_STEP",
				facts,
				openerResponse
			);
}

function evaluateWeakTwoInquiry(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const responseVerdict = evaluateWeakTwoInquiryResponse(rule, context);
	if (responseVerdict) {
		return responseVerdict;
	}
	const selectedVariant = selectedWeakTwoInquiryVariant(context);
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
	const openingStrain = response.openingBid.strain as "D" | "H" | "S";
	const openerHand = context.input.deal.hands[response.opening.seat];
	if (!weakTwoHandQualifies(context, openerHand, openingStrain)) {
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
					{ hcp: context.points, inquiryVariant: selectedVariant ?? "UNSET" },
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

function nextContractBid(call: string, offset: number): string | undefined {
	const bid = parseBid(call);
	if (!bid) {
		return;
	}
	const strains: Bid["strain"][] = ["C", "D", "H", "S", "NT"];
	const current =
		(bid.level - 1) * strains.length + strains.indexOf(bid.strain);
	const target = current + offset;
	const level = Math.floor(target / strains.length) + 1;
	const strain = strains[target % strains.length];
	return level <= 7 && strain ? `${level}${strain}` : undefined;
}

function expectedBlackwoodInterferenceResponse(
	context: EvaluationContext,
	askCall: string,
	opponentsBetween: AuctionCall[],
	count: number
) {
	const method = (context.system.selectedVariants["A-RR-06"] ?? []).find(
		(variant) => ["DOPI", "DEPO", "ROPI"].includes(variant)
	);
	if (method === "DEPO") {
		return count % 2 === 0 ? "X" : "PASS";
	}
	if (method === "DOPI") {
		if (count <= 1) {
			return count === 0 ? "X" : "PASS";
		}
		const anchor = opponentsBetween
			.map((candidate) => normalizeCall(candidate.call))
			.findLast((candidate) => Boolean(parseBid(candidate)));
		return anchor ? nextContractBid(anchor, count - 1) : undefined;
	}
	if (
		method !== "ROPI" ||
		normalizeCall(opponentsBetween.at(-1)?.call ?? "") !== "X"
	) {
		return;
	}
	if (count <= 1) {
		return count === 0 ? "XX" : "PASS";
	}
	return nextContractBid(askCall, count - 1);
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
	const count = acesOrKings % 4;
	return expectedBlackwoodInterferenceResponse(
		context,
		askCall,
		opponentsBetween,
		count
	);
}

function evaluateBlackwood(rule: RuleDefinition, context: EvaluationContext) {
	const partnerAsk = context.calls
		.filter((candidate) => {
			if (candidate.seat !== partner(context.heroSeat)) {
				return false;
			}
			const call = normalizeCall(candidate.call);
			if (call === "4NT") {
				return hasVariant(context, "A-RR-06", "Blackwood");
			}
			return (
				call === "5NT" &&
				hasVariant(context, "A-RR-06", "5NT king ask") &&
				context.calls.some(
					(prior) =>
						prior.index < candidate.index &&
						samePartnership(prior.seat, context.heroSeat) &&
						normalizeCall(prior.call) === "4NT"
				)
			);
		})
		.at(-1);
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
	const action = context.heroCalls
		.filter((candidate) => {
			const call = normalizeCall(candidate.call);
			if (call === "4NT") {
				return (
					hasVariant(context, "A-RR-06", "Blackwood") &&
					Boolean(partnershipFit(context, candidate.index))
				);
			}
			if (call !== "5NT" || !hasVariant(context, "A-RR-06", "5NT king ask")) {
				return false;
			}
			return context.calls.some(
				(prior) =>
					prior.index < candidate.index &&
					samePartnership(prior.seat, context.heroSeat) &&
					normalizeCall(prior.call) === "4NT"
			);
		})
		.at(-1);
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
	const directGrandSlamForceAsk = context.calls.some(
		(candidate) =>
			samePartnership(candidate.seat, context.heroSeat) &&
			normalizeCall(candidate.call) === "5NT" &&
			!context.calls.some(
				(prior) =>
					prior.index < candidate.index &&
					samePartnership(prior.seat, context.heroSeat) &&
					normalizeCall(prior.call) === "4NT"
			)
	);
	if (directGrandSlamForceAsk) {
		return notApplicable(rule, "DIRECT_5NT_RESERVED_FOR_GRAND_SLAM_FORCE");
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

function partnershipNtBefore(context: EvaluationContext, action: AuctionCall) {
	return context.calls.some(
		(candidate) =>
			candidate.index < action.index &&
			samePartnership(candidate.seat, context.heroSeat) &&
			parseBid(candidate.call)?.strain === "NT"
	);
}

function priorGerberFourClubAsk(
	context: EvaluationContext,
	action: AuctionCall
) {
	return context.calls.find(
		(candidate) =>
			candidate.index < action.index &&
			candidate.seat === action.seat &&
			normalizeCall(candidate.call) === "4C" &&
			partnershipNtBefore(context, candidate)
	);
}

function evaluateGerberResponse(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const partnerAsk = context.calls
		.filter((candidate) => {
			if (candidate.seat !== partner(context.heroSeat)) {
				return false;
			}
			const call = normalizeCall(candidate.call);
			return (
				(call === "4C" &&
					hasVariant(context, "A-RR-07", "4C ace ask") &&
					partnershipNtBefore(context, candidate)) ||
				(call === "5C" &&
					hasVariant(context, "A-RR-07", "5C king ask") &&
					Boolean(priorGerberFourClubAsk(context, candidate)))
			);
		})
		.at(-1);
	const partnerAskResponse = partnerAsk
		? heroCallAfter(context, partnerAsk.index)
		: undefined;
	if (!(partnerAsk && partnerAskResponse)) {
		return;
	}
	const interference = context.calls.some(
		(candidate) =>
			candidate.index > partnerAsk.index &&
			candidate.index < partnerAskResponse.index &&
			!samePartnership(candidate.seat, context.heroSeat) &&
			normalizeCall(candidate.call) !== "PASS"
	);
	if (interference) {
		return indeterminate(rule, "GERBER_INTERFERENCE_NOT_OBJECTIVE", {
			ask: normalizeCall(partnerAsk.call),
		});
	}
	const ask = normalizeCall(partnerAsk.call);
	const targetRank = ask === "4C" ? "A" : "K";
	const controlsHeld = [...context.hand].filter(
		(rank) => rank === targetRank
	).length;
	const steps =
		ask === "4C" ? ["4D", "4H", "4S", "4NT"] : ["5D", "5H", "5S", "5NT"];
	const expected = steps[controlsHeld % 4] ?? "";
	const actual = normalizeCall(partnerAskResponse.call);
	return actual === expected
		? complied(
				rule,
				"GERBER_RESPONSE_COMPLIED",
				{ actual, ask, controlsHeld, expected, targetRank },
				partnerAskResponse
			)
		: wrong(
				rule,
				"GERBER_RESPONSE_WRONG_STEP",
				{ actual, ask, controlsHeld, expected, targetRank },
				partnerAskResponse
			);
}

function evaluateGerber(rule: RuleDefinition, context: EvaluationContext) {
	const responseVerdict = evaluateGerberResponse(rule, context);
	if (responseVerdict) {
		return responseVerdict;
	}

	const response = responseContext(context);
	if (!(response?.action && response.openingBid?.strain === "NT")) {
		return notApplicable(rule);
	}
	const heroAsks = context.heroCalls.filter((candidate) => {
		const candidateCall = normalizeCall(candidate.call);
		return (
			(candidateCall === "4C" &&
				hasVariant(context, "A-RR-07", "4C ace ask")) ||
			(candidateCall === "5C" && hasVariant(context, "A-RR-07", "5C king ask"))
		);
	});
	const action = heroAsks.at(-1) ?? response.action;
	const call = normalizeCall(action.call);
	if (
		(call === "4C" && !hasVariant(context, "A-RR-07", "4C ace ask")) ||
		(call === "5C" && !hasVariant(context, "A-RR-07", "5C king ask"))
	) {
		return notApplicable(rule, "GERBER_VARIANT_NOT_ADOPTED");
	}
	const eligible =
		context.points >= context.system.settings.responseRebid.gerberMinHcp;
	if (call === "5C" && !priorGerberFourClubAsk(context, action)) {
		return wrong(
			rule,
			"GERBER_KING_ASK_WITHOUT_ACE_SEQUENCE",
			{ hcp: context.points },
			action
		);
	}
	if (["4C", "5C"].includes(call)) {
		return eligible
			? complied(
					rule,
					"GERBER_ASK_USED",
					{ ask: call, hcp: context.points },
					action
				)
			: wrong(
					rule,
					"GERBER_OUTSIDE_SLAM_RANGE",
					{ ask: call, hcp: context.points },
					action
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

function evaluateGrandSlamForceResponse(
	rule: RuleDefinition,
	context: EvaluationContext
): RuleEvaluationResult | undefined {
	const ask = context.calls.find(
		(candidate) =>
			candidate.seat === partner(context.heroSeat) &&
			normalizeCall(candidate.call) === "5NT" &&
			!context.calls.some(
				(prior) =>
					prior.index < candidate.index &&
					samePartnership(prior.seat, context.heroSeat) &&
					normalizeCall(prior.call) === "4NT"
			)
	);
	const action = ask ? heroCallAfter(context, ask.index) : undefined;
	const fit = ask ? partnershipFit(context, ask.index) : undefined;
	if (!(ask && action && fit)) {
		return;
	}
	const holding = holdings(context.hand)[fit.strain];
	const topHonors = [...holding].filter((rank) =>
		["A", "K", "Q"].includes(rank)
	).length;
	const grandThreshold =
		context.system.settings.responseRebid.grandSlamForceGrandTopHonors;
	const expected = `${topHonors >= grandThreshold ? 7 : 6}${fit.strain}`;
	const actual = normalizeCall(action.call);
	const facts = {
		actual,
		expected,
		grandThreshold,
		holding,
		topHonors,
		trump: fit.strain,
	};
	return actual === expected
		? complied(rule, "GRAND_SLAM_FORCE_RESPONSE_COMPLIED", facts, action)
		: wrong(rule, "GRAND_SLAM_FORCE_RESPONSE_WRONG", facts, action);
}

function evaluateGrandSlamForce(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const responseVerdict = evaluateGrandSlamForceResponse(rule, context);
	if (responseVerdict) {
		return responseVerdict;
	}
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
	const blackwoodSequence = context.calls.some(
		(candidate) =>
			samePartnership(candidate.seat, context.heroSeat) &&
			normalizeCall(candidate.call) === "4NT"
	);
	if (blackwoodSequence) {
		return notApplicable(rule, "FIVE_NT_FOLLOWS_BLACKWOOD_SEQUENCE");
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
			isBalanced(
				context.hand,
				context.system.settings.opening.allowSingletonTopHonor
			);
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
	return notApplicable(rule);
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
	const isJump = Boolean(bid && isJumpShift(openingBid, bid));
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
		const minimumHcp =
			context.system.settings.responseRebid.fitShowingJumpMinHcp;
		return support >= 3 &&
			support + jumpLength >= 9 &&
			context.points >= minimumHcp
			? complied(
					rule,
					"FIT_SHOWING_JUMP_CONDITIONS_MET",
					{ hcp: context.points, jumpLength, minimumHcp, support },
					response.action
				)
			: wrong(
					rule,
					"FIT_SHOWING_JUMP_CONDITIONS_FAILED",
					{ hcp: context.points, jumpLength, minimumHcp, support },
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

function lowestLegalSuitBidLevel(
	opening: Bid,
	strain: "C" | "D" | "H" | "S"
): number | undefined {
	const level =
		suitRank[strain] > suitRank[opening.strain]
			? opening.level
			: opening.level + 1;
	return level <= 7 ? level : undefined;
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
		const variant = level === 1 ? "One-level" : "Two-level";
		if (!hasVariant(context, "A-CD-01", variant)) {
			return notApplicable(rule, "NATURAL_OVERCALL_VARIANT_NOT_ADOPTED");
		}
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
	const candidate = openingBid
		? (["S", "H", "D", "C"] as const)
				.map((strain) => {
					const level = lowestLegalSuitBidLevel(openingBid, strain);
					const variant = level === 1 ? "One-level" : "Two-level";
					const minimumHcp =
						level === 1
							? context.system.settings.overcall.oneLevelMinHcp
							: context.system.settings.overcall.twoLevelMinHcp;
					const minimumLength =
						level === 1
							? context.system.settings.overcall.oneLevelMinLength
							: context.system.settings.overcall.twoLevelMinLength;
					return {
						level,
						minimumHcp,
						minimumLength,
						strain,
						variant,
					};
				})
				.find(
					(option) =>
						option.level !== undefined &&
						option.strain !== openingBid.strain &&
						hasVariant(context, "A-CD-01", option.variant) &&
						context.points >= option.minimumHcp &&
						context.lengths[option.strain] >= option.minimumLength
				)
		: undefined;
	return call === "PASS" && candidate
		? missed(
				rule,
				"NATURAL_OVERCALL_MISSED",
				{
					hcp: context.points,
					minimumHcp: candidate.minimumHcp,
					minimumLength: candidate.minimumLength,
					targetCall: `${candidate.level}${candidate.strain}`,
					targetSuit: candidate.strain,
					variant: candidate.variant,
				},
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

function unusualNtVariant(opening: Bid) {
	return opening.strain === "S" || opening.strain === "H"
		? "Minors"
		: "Two lowest unbid";
}

function heroPassedBefore(context: EvaluationContext, action: AuctionCall) {
	return context.calls.some(
		(candidate) =>
			candidate.index < action.index &&
			candidate.seat === context.heroSeat &&
			normalizeCall(candidate.call) === "PASS"
	);
}

function evaluateUnusualNt(rule: RuleDefinition, context: EvaluationContext) {
	const opening = opponentOpening(context);
	const openingBid = opening ? parseBid(opening.call) : undefined;
	const action = opening ? responseAfter(context, opening) : undefined;
	if (!(openingBid && action)) {
		return notApplicable(rule);
	}
	const target = unusualSuits(openingBid);
	const variant = unusualNtVariant(openingBid);
	if (!hasVariant(context, "A-CD-02", variant)) {
		return notApplicable(rule, "UNUSUAL_NT_VARIANT_NOT_ADOPTED");
	}
	const shape = target
		.map((suit) => context.lengths[suit])
		.sort((left, right) => right - left);
	const eligible = (shape[0] ?? 0) >= 5 && (shape[1] ?? 0) >= 4;
	const call = normalizeCall(action.call);
	const facts = {
		longest: shape[0] ?? 0,
		secondLongest: shape[1] ?? 0,
		suits: target.join("+"),
		variant,
	};
	const ntBid = parseBid(call);
	const hasPreviouslyPassed = heroPassedBefore(context, action);
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
	if (!(opening && openingBid && openingBid.strain !== "NT" && action)) {
		return notApplicable(rule);
	}
	const otherLengths = (["S", "H", "D", "C"] as const)
		.filter((suit) => suit !== openingBid.strain)
		.map((suit) => context.lengths[suit]);
	const callsBetween = context.calls.filter(
		(candidate) =>
			candidate.index > opening.index && candidate.index < action.index
	);
	const balancing =
		callsBetween.length >= 2 &&
		callsBetween
			.slice(-2)
			.every((candidate) => normalizeCall(candidate.call) === "PASS");
	const variant = balancing ? "Balancing" : "Direct";
	if (!(context.system.selectedVariants["A-CD-03"] ?? []).includes(variant)) {
		return notApplicable(rule, "TAKEOUT_DOUBLE_VARIANT_NOT_ADOPTED");
	}
	const minimumHcp = balancing
		? context.system.settings.competitive.balancingTakeoutDoubleMinHcp
		: context.system.settings.competitive.takeoutDoubleMinHcp;
	const eligible =
		context.points >= minimumHcp &&
		context.lengths[openingBid.strain] <= 2 &&
		otherLengths.filter((length) => length >= 3).length >= 2;
	const call = normalizeCall(action.call);
	const facts = {
		hcp: context.points,
		minimumHcp,
		opponentSuitLength: context.lengths[openingBid.strain],
		variant,
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

function opponentSlamCall(context: EvaluationContext) {
	return context.calls.find((candidate) => {
		const bid = parseBid(candidate.call);
		return Boolean(
			bid &&
				bid.level >= 6 &&
				!samePartnership(candidate.seat, context.heroSeat)
		);
	});
}

function evaluateNonSlamLightnerDouble(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const heroDouble = context.heroCalls.find(
		(candidate) => normalizeCall(candidate.call) === "X"
	);
	if (!heroDouble) {
		return notApplicable(rule);
	}
	const priorContract = [...callsBefore(context, heroDouble)]
		.reverse()
		.find(
			(candidate) =>
				parseBid(candidate.call) &&
				!samePartnership(candidate.seat, context.heroSeat)
		);
	const priorBid = priorContract ? parseBid(priorContract.call) : undefined;
	return priorBid && priorBid.level >= 4
		? wrong(
				rule,
				"LIGHTNER_DOUBLE_NOT_OVER_SLAM",
				{ contract: normalizeCall(priorContract?.call ?? "") },
				heroDouble
			)
		: notApplicable(rule);
}

function evaluateLightnerDouble(
	rule: RuleDefinition,
	context: EvaluationContext
) {
	const slam = opponentSlamCall(context);
	if (!slam) {
		return evaluateNonSlamLightnerDouble(rule, context);
	}
	const action = heroCallAfter(context, slam.index);
	const bid = parseBid(slam.call);
	const call = action ? normalizeCall(action.call) : "";
	if (!bid) {
		return indeterminate(rule, "LIGHTNER_SLAM_CONTRACT_NOT_PARSED");
	}
	if (bid.strain === "NT") {
		return indeterminate(rule, "LIGHTNER_NT_SLAM_INTENT_NOT_OBJECTIVE", {
			actual: call,
			contract: normalizeCall(slam.call),
		});
	}
	const requireVoid = context.system.settings.competitive.lightnerRequireVoid;
	const voidSuit = (["S", "H", "D", "C"] as const).find(
		(suit) => suit !== bid.strain && context.lengths[suit] === 0
	);
	if (call === "X") {
		return !requireVoid || Boolean(voidSuit)
			? complied(
					rule,
					"LIGHTNER_DOUBLE_USED",
					{
						contract: normalizeCall(slam.call),
						requireVoid,
						voidSuit: voidSuit ?? null,
					},
					action
				)
			: wrong(
					rule,
					"LIGHTNER_DOUBLE_WITHOUT_REQUIRED_VOID",
					{
						contract: normalizeCall(slam.call),
						requireVoid,
						voidSuit: voidSuit ?? null,
					},
					action
				);
	}
	if (!requireVoid) {
		return indeterminate(
			rule,
			"LIGHTNER_LEAD_REQUEST_NOT_OBJECTIVELY_DETERMINABLE"
		);
	}
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
	if (hasVariant(context, "A-CA-01", "Honor sequence")) {
		for (const sequence of ["AKQ", "KQJ", "QJT", "JT9"]) {
			if ([...sequence].every((rank) => holding.includes(rank))) {
				return sequence[0];
			}
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
	if (context.system.settings.lead.fromSmall === "MUD" && holding.length >= 3) {
		return holding[1];
	}
	return;
}

function evaluateOpeningLead(rule: RuleDefinition, context: EvaluationContext) {
	if (
		context.input.deal.declarer &&
		samePartnership(context.input.deal.declarer, context.heroSeat)
	) {
		return notApplicable(rule, "HERO_NOT_DEFENDER");
	}
	const lead = [...(context.input.play ?? [])].sort(
		(left, right) => left.index - right.index
	)[0];
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
	if (
		context.input.deal.declarer &&
		samePartnership(context.input.deal.declarer, context.heroSeat)
	) {
		return notApplicable(rule, "HERO_NOT_DEFENDER");
	}
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
	const variantByPriority = {
		ATTITUDE: "Normal attitude",
		COUNT: "Count",
		SUIT_PREFERENCE: "Suit preference",
	} as const;
	const signalPriority = context.system.settings.signal.priority.find(
		(signal) => hasVariant(context, "A-CA-02", variantByPriority[signal])
	);
	if (signalPriority !== "COUNT") {
		return indeterminate(rule, "ATTITUDE_OR_PREFERENCE_INTENT_NOT_OBJECTIVE", {
			heroPlayCount: heroPlays.length,
			signalPriority: signalPriority ?? "UNSET",
		});
	}
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
