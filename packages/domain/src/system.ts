import {
	JCBL_LIST_A_2026_05_01,
	JCBL_RULESET_VERSION,
	type RuleDefinition,
} from "./ruleset";
import {
	defaultSystemSettings,
	type SystemSettings,
	systemSettingsSchema,
} from "./types";

export interface RuleTemplateCondition {
	[key: string]: boolean | number | string;
}

export interface RuleTemplate {
	condition: RuleTemplateCondition;
	officialItemId: string;
	priority: number;
	templateId: string;
	variant: string;
}

export interface SystemDraftInput {
	adoptedOfficialItemIds: string[];
	rulesetVersion: string;
	selectedVariants: Record<string, string[]>;
	settings: unknown;
}

export interface SystemValidationIssue {
	code:
		| "CONFLICT"
		| "DUPLICATE_RULE"
		| "INVALID_RANGE"
		| "INVALID_SETTING"
		| "INVALID_VARIANT"
		| "MISSING_VARIANT"
		| "UNKNOWN_RULE"
		| "WRONG_RULESET";
	message: string;
	officialItemId?: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

/** Upgrades persisted settings from earlier schema revisions without mutating them. */
export function normalizeSystemSettings(input: unknown): SystemSettings {
	const source = isRecord(input) ? input : {};
	const opening = isRecord(source.opening) ? source.opening : {};
	const responseRebid = isRecord(source.responseRebid)
		? source.responseRebid
		: {};
	const overcall = isRecord(source.overcall) ? source.overcall : {};
	const competitive = isRecord(source.competitive) ? source.competitive : {};
	const lead = isRecord(source.lead) ? source.lead : {};
	const signal = isRecord(source.signal) ? source.signal : {};

	return systemSettingsSchema.parse({
		opening: { ...defaultSystemSettings.opening, ...opening },
		responseRebid: {
			...defaultSystemSettings.responseRebid,
			...responseRebid,
		},
		overcall: { ...defaultSystemSettings.overcall, ...overcall },
		competitive: {
			...defaultSystemSettings.competitive,
			...competitive,
		},
		lead: { ...defaultSystemSettings.lead, ...lead },
		signal: { ...defaultSystemSettings.signal, ...signal },
	});
}

const ruleTemplates: RuleTemplate[] = [
	{
		condition: { auction: "weak-two-2nt-inquiry-response" },
		officialItemId: "A-RR-05",
		priority: 20,
		templateId: "rr05-feature",
		variant: "Feature ask",
	},
	{
		condition: { auction: "weak-two-2nt-inquiry-response" },
		officialItemId: "A-RR-05",
		priority: 20,
		templateId: "rr05-ogust",
		variant: "Ogust-style ask",
	},
	{
		condition: { auction: "blackwood-interference" },
		officialItemId: "A-RR-06",
		priority: 20,
		templateId: "rr06-dopi",
		variant: "DOPI",
	},
	{
		condition: { auction: "blackwood-interference" },
		officialItemId: "A-RR-06",
		priority: 20,
		templateId: "rr06-depo",
		variant: "DEPO",
	},
	{
		condition: { auction: "blackwood-interference" },
		officialItemId: "A-RR-06",
		priority: 20,
		templateId: "rr06-ropi",
		variant: "ROPI",
	},
	{
		condition: { lead: "from-ak" },
		officialItemId: "A-CA-01",
		priority: 20,
		templateId: "ca01-a-from-ak",
		variant: "A from AK",
	},
	{
		condition: { lead: "from-ak" },
		officialItemId: "A-CA-01",
		priority: 20,
		templateId: "ca01-k-from-ak",
		variant: "K from AK",
	},
	...(["Fourth highest", "Top of Nothing", "MUD"] as const).map(
		(variant): RuleTemplate => ({
			condition: { lead: "from-small" },
			officialItemId: "A-CA-01",
			priority: 20,
			templateId: `ca01-${variant.toLowerCase().replaceAll(" ", "-")}`,
			variant,
		})
	),
];

export const SYSTEM_RULE_TEMPLATES: readonly RuleTemplate[] = ruleTemplates;
const RULE_CATALOG: ReadonlyMap<string, RuleDefinition> = new Map(
	JCBL_LIST_A_2026_05_01.map((item) => [item.officialItemId, item])
);

function conditionsEqual(
	left: RuleTemplateCondition,
	right: RuleTemplateCondition
) {
	const leftEntries = Object.entries(left);
	const rightEntries = Object.entries(right);
	return (
		leftEntries.length === rightEntries.length &&
		leftEntries.every(([key, value]) => right[key] === value)
	);
}

function conditionMatches(
	condition: RuleTemplateCondition,
	context: RuleTemplateCondition
) {
	return Object.entries(condition).every(
		([key, value]) => context[key] === value
	);
}

/**
 * Resolves code-owned templates for an auction/play context. More specific
 * conditions win; an equal-priority/equal-specificity tie is an invalid system.
 */
export function resolveRuleTemplate(
	templates: readonly RuleTemplate[],
	context: RuleTemplateCondition
): RuleTemplate | undefined {
	const matches = templates.filter((template) =>
		conditionMatches(template.condition, context)
	);
	if (matches.length === 0) {
		return;
	}
	const ordered = [...matches].sort((left, right) => {
		const specificity =
			Object.keys(right.condition).length - Object.keys(left.condition).length;
		return specificity || right.priority - left.priority;
	});
	const winner = ordered[0];
	const runnerUp = ordered[1];
	if (
		winner &&
		runnerUp &&
		winner.priority === runnerUp.priority &&
		Object.keys(winner.condition).length ===
			Object.keys(runnerUp.condition).length
	) {
		throw new Error(
			`Rule template conflict: ${winner.templateId}, ${runnerUp.templateId}`
		);
	}
	return winner;
}

function validateRuleSelection(
	draft: SystemDraftInput,
	issues: SystemValidationIssue[]
): Set<string> {
	const adopted = new Set<string>();
	for (const officialItemId of draft.adoptedOfficialItemIds) {
		if (adopted.has(officialItemId)) {
			issues.push({
				code: "DUPLICATE_RULE",
				message: `${officialItemId}が重複しています。`,
				officialItemId,
			});
			continue;
		}
		adopted.add(officialItemId);
		if (!RULE_CATALOG.has(officialItemId)) {
			issues.push({
				code: "UNKNOWN_RULE",
				message: `${officialItemId}はRuleset Manifestに存在しません。`,
				officialItemId,
			});
		}
	}

	for (const officialItemId of Object.keys(draft.selectedVariants)) {
		if (!RULE_CATALOG.has(officialItemId)) {
			issues.push({
				code: "UNKNOWN_RULE",
				message: `${officialItemId}のVariant定義が不明です。`,
				officialItemId,
			});
		}
	}

	for (const officialItemId of adopted) {
		const definition = RULE_CATALOG.get(officialItemId);
		if (!definition) {
			continue;
		}
		const selected = draft.selectedVariants[officialItemId] ?? [];
		if (selected.length === 0) {
			issues.push({
				code: "MISSING_VARIANT",
				message: `${officialItemId}のVariant設定が不完全です。`,
				officialItemId,
			});
		}
		for (const variant of selected) {
			if (!definition.variants.includes(variant)) {
				issues.push({
					code: "INVALID_VARIANT",
					message: `${officialItemId}に未定義のVariant「${variant}」があります。`,
					officialItemId,
				});
			}
		}
	}
	return adopted;
}

function validatedSettings(
	draft: SystemDraftInput,
	issues: SystemValidationIssue[]
): SystemSettings | undefined {
	try {
		return systemSettingsSchema.parse(draft.settings);
	} catch {
		issues.push({
			code: "INVALID_SETTING",
			message: "System設定の型または必須項目が不正です。",
		});
	}
	return;
}

function validateSettingsRanges(
	settings: SystemSettings,
	issues: SystemValidationIssue[]
): void {
	if (settings.opening.oneNtMinHcp > settings.opening.oneNtMaxHcp) {
		issues.push({
			code: "INVALID_RANGE",
			message: "1NTの下限が上限を超えています。",
		});
	}
	for (const [label, minimum, maximum] of [
		["2NT", settings.opening.twoNtMinHcp, settings.opening.twoNtMaxHcp],
		["3NT", settings.opening.threeNtMinHcp, settings.opening.threeNtMaxHcp],
		[
			"4+-level NT",
			settings.opening.fourPlusNtMinHcp,
			settings.opening.fourPlusNtMaxHcp,
		],
		[
			"3-level",
			settings.opening.threeLevelMinHcp,
			settings.opening.threeLevelMaxHcp,
		],
		[
			"4+-level",
			settings.opening.fourPlusLevelMinHcp,
			settings.opening.fourPlusLevelMaxHcp,
		],
	] as const) {
		if (minimum > maximum) {
			issues.push({
				code: "INVALID_RANGE",
				message: `${label} Openingの下限が上限を超えています。`,
				officialItemId: "A-OB-01",
			});
		}
	}
	if (settings.opening.weakTwoMinHcp > settings.opening.weakTwoMaxHcp) {
		issues.push({
			code: "INVALID_RANGE",
			message: "Weak Twoの下限が上限を超えています。",
		});
	}
	if (
		settings.opening.weakTwoMaxHcp >= settings.opening.naturalStrongTwoMinHcp
	) {
		issues.push({
			code: "CONFLICT",
			message:
				"Weak TwoとNatural Strong TwoのHCP範囲が同じ2-level natural callで競合しています。",
			officialItemId: "A-OB-01",
		});
	}
	if (
		settings.responseRebid.minimumResponseHcp >
			settings.responseRebid.invitationalMinHcp ||
		settings.responseRebid.invitationalMinHcp >
			settings.responseRebid.gameForcingMinHcp
	) {
		issues.push({
			code: "INVALID_RANGE",
			message: "ResponseのMinimum、Invitation、Game forcingの順序が不正です。",
		});
	}
	if (new Set(settings.signal.priority).size !== 3) {
		issues.push({
			code: "INVALID_SETTING",
			message: "Signalの優先順位には3種類を1回ずつ指定してください。",
		});
	}
}

function validateTemplateConflicts(
	draft: SystemDraftInput,
	adopted: ReadonlySet<string>,
	issues: SystemValidationIssue[]
): void {
	const selectedTemplates = SYSTEM_RULE_TEMPLATES.filter(
		(template) =>
			adopted.has(template.officialItemId) &&
			(draft.selectedVariants[template.officialItemId] ?? []).includes(
				template.variant
			)
	);
	for (let index = 0; index < selectedTemplates.length; index += 1) {
		const current = selectedTemplates[index];
		if (!current) {
			continue;
		}
		const conflict = selectedTemplates
			.slice(index + 1)
			.find(
				(candidate) =>
					candidate.priority === current.priority &&
					conditionsEqual(candidate.condition, current.condition)
			);
		if (conflict) {
			issues.push({
				code: "CONFLICT",
				message: `${current.officialItemId}の「${current.variant}」と「${conflict.variant}」は同一条件・同順位で競合します。`,
				officialItemId: current.officialItemId,
			});
		}
	}
}

function validateLeadSettings(
	draft: SystemDraftInput,
	settings: SystemSettings,
	adopted: ReadonlySet<string>,
	issues: SystemValidationIssue[]
): void {
	if (!adopted.has("A-CA-01")) {
		return;
	}
	const selected = draft.selectedVariants["A-CA-01"] ?? [];
	const requiredSmall = {
		FOURTH_HIGHEST: "Fourth highest",
		MUD: "MUD",
		TOP_OF_NOTHING: "Top of Nothing",
	}[settings.lead.fromSmall];
	const requiredAk = `${settings.lead.fromAk} from AK`;
	if (!(selected.includes(requiredSmall) && selected.includes(requiredAk))) {
		issues.push({
			code: "INVALID_SETTING",
			message: "Opening LeadのVariantと型付き設定が一致していません。",
			officialItemId: "A-CA-01",
		});
	}
}

function validateVariantDependencies(
	draft: SystemDraftInput,
	adopted: ReadonlySet<string>,
	issues: SystemValidationIssue[]
): void {
	const selected = (officialItemId: string, variant: string) =>
		(draft.selectedVariants[officialItemId] ?? []).includes(variant);
	const requireVariant = (
		officialItemId: string,
		variant: string,
		requiredOfficialItemId: string,
		requiredVariant?: string
	) => {
		if (!(adopted.has(officialItemId) && selected(officialItemId, variant))) {
			return;
		}
		const dependencyMet =
			adopted.has(requiredOfficialItemId) &&
			(!requiredVariant || selected(requiredOfficialItemId, requiredVariant));
		if (!dependencyMet) {
			issues.push({
				code: "MISSING_VARIANT",
				message: `${officialItemId}の「${variant}」には${requiredOfficialItemId}${
					requiredVariant ? `の「${requiredVariant}」` : ""
				}が必要です。`,
				officialItemId,
			});
		}
	};

	requireVariant("A-OB-01", "Rule of 10", "A-OB-01", "Weak Two");
	requireVariant("A-RR-02", "Stayman", "A-OB-01", "Natural 1NT");
	requireVariant("A-RR-03", "Artificial 2D response", "A-OB-02");
	requireVariant(
		"A-RR-04",
		"Weak 2NT response",
		"A-OB-01",
		"Natural Strong Two"
	);
	for (const variant of ["Feature ask", "Ogust-style ask"]) {
		requireVariant("A-RR-05", variant, "A-OB-01", "Weak Two");
	}
	for (const variant of ["5NT king ask", "DOPI", "DEPO", "ROPI"]) {
		requireVariant("A-RR-06", variant, "A-RR-06", "Blackwood");
	}
	requireVariant("A-RR-07", "4C ace ask", "A-OB-01", "Natural 1NT");
	requireVariant("A-RR-07", "5C king ask", "A-RR-07", "4C ace ask");
	requireVariant("A-RR-09", "Stayman eligibility", "A-RR-02");
	requireVariant("A-RR-09", "Gerber eligibility", "A-RR-07");
}

export function validateSystemDraft(
	draft: SystemDraftInput
): SystemValidationIssue[] {
	const issues: SystemValidationIssue[] = [];
	if (draft.rulesetVersion !== JCBL_RULESET_VERSION) {
		issues.push({
			code: "WRONG_RULESET",
			message: `Ruleset Versionは${JCBL_RULESET_VERSION}である必要があります。`,
		});
	}
	const adopted = validateRuleSelection(draft, issues);
	const settings = validatedSettings(draft, issues);
	if (settings) {
		validateSettingsRanges(settings, issues);
		validateLeadSettings(draft, settings, adopted, issues);
	}
	validateTemplateConflicts(draft, adopted, issues);
	validateVariantDependencies(draft, adopted, issues);

	return issues;
}
