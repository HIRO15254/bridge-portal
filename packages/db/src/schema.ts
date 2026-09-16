import type { SystemSettings } from "@bridge-portal/domain";
import { relations, sql } from "drizzle-orm";
import {
	index,
	integer,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
	createdAt: integer("created_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.$onUpdate(() => new Date())
		.notNull(),
};

export const user = sqliteTable(
	"user",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		email: text("email").notNull().unique(),
		emailVerified: integer("email_verified", { mode: "boolean" })
			.default(false)
			.notNull(),
		image: text("image"),
		funbridgeId: text("funbridge_id").unique(),
		singletonKey: integer("singleton_key").default(1).notNull(),
		...timestamps,
	},
	(table) => [uniqueIndex("user_singleton_uq").on(table.singletonKey)]
);
export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		token: text("token").notNull().unique(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		...timestamps,
	},
	(table) => [index("session_user_id_idx").on(table.userId)]
);
export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: integer("access_token_expires_at", {
			mode: "timestamp",
		}),
		refreshTokenExpiresAt: integer("refresh_token_expires_at", {
			mode: "timestamp",
		}),
		scope: text("scope"),
		password: text("password"),
		...timestamps,
	},
	(table) => [index("account_user_id_idx").on(table.userId)]
);
export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		...timestamps,
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const apiToken = sqliteTable(
	"api_token",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		tokenHash: text("token_hash").notNull().unique(),
		expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [index("api_token_user_id_idx").on(table.userId)]
);

export const bridgeSystem = sqliteTable(
	"bridge_system",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		...timestamps,
	},
	(table) => [index("bridge_system_user_id_idx").on(table.userId)]
);
export const systemDraft = sqliteTable("system_draft", {
	id: text("id").primaryKey(),
	systemId: text("system_id")
		.notNull()
		.references(() => bridgeSystem.id, { onDelete: "cascade" })
		.unique(),
	rulesetVersion: text("ruleset_version").notNull(),
	adoptedOfficialItemIds: text("adopted_official_item_ids", { mode: "json" })
		.$type<string[]>()
		.notNull(),
	selectedVariants: text("selected_variants", { mode: "json" })
		.$type<Record<string, string[]>>()
		.notNull(),
	settings: text("settings", { mode: "json" })
		.$type<SystemSettings>()
		.notNull(),
	...timestamps,
});
export const systemVersion = sqliteTable(
	"system_version",
	{
		id: text("id").primaryKey(),
		systemId: text("system_id")
			.notNull()
			.references(() => bridgeSystem.id, { onDelete: "restrict" }),
		versionNumber: integer("version_number").notNull(),
		name: text("name").notNull(),
		rulesetVersion: text("ruleset_version").notNull(),
		adoptedOfficialItemIds: text("adopted_official_item_ids", { mode: "json" })
			.$type<string[]>()
			.notNull(),
		selectedVariants: text("selected_variants", { mode: "json" })
			.$type<Record<string, string[]>>()
			.notNull(),
		settings: text("settings", { mode: "json" })
			.$type<SystemSettings>()
			.notNull(),
		publishedAt: integer("published_at", { mode: "timestamp" }).notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("system_version_number_uq").on(
			table.systemId,
			table.versionNumber
		),
	]
);

export const tournament = sqliteTable(
	"tournament",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		externalId: text("external_id").notNull(),
		family: text("family", {
			enum: ["BP_CIRCUIT", "DAILY", "SERIES"],
		}).notNull(),
		name: text("name").notNull(),
		activeRevisionId: text("active_revision_id"),
		defaultSystemVersionId: text("default_system_version_id").references(
			() => systemVersion.id,
			{ onDelete: "set null" }
		),
		...timestamps,
	},
	(table) => [
		uniqueIndex("tournament_external_uq").on(
			table.userId,
			table.family,
			table.externalId
		),
	]
);
export const importRevision = sqliteTable(
	"import_revision",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		tournamentId: text("tournament_id").references(() => tournament.id, {
			onDelete: "cascade",
		}),
		sha256: text("sha256").notNull(),
		r2Key: text("r2_key").notNull(),
		status: text("status", {
			enum: ["PENDING", "ACTIVE", "INVALID"],
		}).notNull(),
		warnings: text("warnings", { mode: "json" }).$type<string[]>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("import_revision_hash_uq").on(table.userId, table.sha256),
	]
);
export const historyIndex = sqliteTable(
	"history_index",
	{
		id: text("id").primaryKey(),
		importRevisionId: text("import_revision_id")
			.notNull()
			.references(() => importRevision.id, { onDelete: "cascade" })
			.unique(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		family: text("family", {
			enum: ["BP_CIRCUIT", "DAILY", "SERIES"],
		}).notNull(),
		capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
		captureMode: text("capture_mode").notNull(),
		locale: text("locale").notNull(),
		coverage: text("coverage", { mode: "json" })
			.$type<{
				rowCount: number;
				scope: "NONE" | "VISIBLE_WINDOW" | "FULL";
				totalCount: number;
			}>()
			.notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		index("history_index_user_family_idx").on(table.userId, table.family),
	]
);
export const historyIndexEntry = sqliteTable(
	"history_index_entry",
	{
		id: text("id").primaryKey(),
		historyIndexId: text("history_index_id")
			.notNull()
			.references(() => historyIndex.id, { onDelete: "cascade" }),
		sourceTournamentId: text("source_tournament_id").notNull(),
		title: text("title").notNull(),
		playedAt: integer("played_at", { mode: "timestamp" }),
		registeredPlayerCount: integer("registered_player_count").notNull(),
		inProgress: integer("in_progress", { mode: "boolean" }).notNull(),
		rank: integer("rank"),
		score: real("score"),
		scoreType: text("score_type", { enum: ["MP", "IMP"] }),
		boardCount: integer("board_count"),
		playedBoardCount: integer("played_board_count"),
		metadata: text("metadata", { mode: "json" })
			.$type<Record<string, unknown>>()
			.notNull(),
	},
	(table) => [
		index("history_index_entry_source_idx").on(table.sourceTournamentId),
	]
);
export const tournamentRevision = sqliteTable(
	"tournament_revision",
	{
		id: text("id").primaryKey(),
		tournamentId: text("tournament_id")
			.notNull()
			.references(() => tournament.id, { onDelete: "cascade" }),
		importRevisionId: text("import_revision_id")
			.notNull()
			.references(() => importRevision.id, { onDelete: "restrict" })
			.unique(),
		revisionNumber: integer("revision_number").notNull(),
		playedAt: integer("played_at", { mode: "timestamp" }),
		completion: text("completion").notNull(),
		boardCount: integer("board_count").notNull(),
		scoreType: text("score_type", { enum: ["MP", "IMP"] }).notNull(),
		tournamentScore: real("tournament_score"),
		rank: integer("rank"),
		participantCount: integer("participant_count"),
		familyMetadata: text("family_metadata", { mode: "json" })
			.$type<Record<string, string | number | null>>()
			.notNull(),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("tournament_revision_number_uq").on(
			table.tournamentId,
			table.revisionNumber
		),
	]
);
export const deal = sqliteTable("deal", {
	id: text("id").primaryKey(),
	dealHash: text("deal_hash").notNull().unique(),
	dealer: text("dealer", { enum: ["N", "E", "S", "W"] }).notNull(),
	vulnerability: text("vulnerability", {
		enum: ["None", "NS", "EW", "Both"],
	}).notNull(),
	pbnDeal: text("pbn_deal").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
});
export const boardAttempt = sqliteTable(
	"board_attempt",
	{
		id: text("id").primaryKey(),
		tournamentRevisionId: text("tournament_revision_id")
			.notNull()
			.references(() => tournamentRevision.id, { onDelete: "cascade" }),
		dealId: text("deal_id")
			.notNull()
			.references(() => deal.id, { onDelete: "restrict" }),
		boardNumber: integer("board_number").notNull(),
		heroSeat: text("hero_seat", { enum: ["N", "E", "S", "W"] }),
		contract: text("contract"),
		declarer: text("declarer", { enum: ["N", "E", "S", "W"] }),
		result: integer("result"),
		historyMetadata: text("history_metadata", { mode: "json" })
			.$type<{
				comparison?: Record<string, unknown>;
				source?: Record<string, unknown>;
			}>()
			.notNull()
			.default(sql`'{}'`),
		sourceStatus: text("source_status", {
			enum: ["NO_CONTRACT_OR_PLAY", "NO_PLAY", "PASSED_OUT"],
		}),
		systemVersionId: text("system_version_id").references(
			() => systemVersion.id,
			{ onDelete: "set null" }
		),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("board_attempt_number_uq").on(
			table.tournamentRevisionId,
			table.boardNumber
		),
	]
);
export const auctionCall = sqliteTable(
	"auction_call",
	{
		id: text("id").primaryKey(),
		boardAttemptId: text("board_attempt_id")
			.notNull()
			.references(() => boardAttempt.id, { onDelete: "cascade" }),
		callIndex: integer("call_index").notNull(),
		seat: text("seat", { enum: ["N", "E", "S", "W"] }).notNull(),
		call: text("call").notNull(),
		alert: text("alert"),
	},
	(table) => [
		uniqueIndex("auction_call_order_uq").on(
			table.boardAttemptId,
			table.callIndex
		),
	]
);
export const playAction = sqliteTable(
	"play_action",
	{
		id: text("id").primaryKey(),
		boardAttemptId: text("board_attempt_id")
			.notNull()
			.references(() => boardAttempt.id, { onDelete: "cascade" }),
		actionIndex: integer("action_index").notNull(),
		trickNumber: integer("trick_number").notNull(),
		seat: text("seat", { enum: ["N", "E", "S", "W"] }).notNull(),
		card: text("card").notNull(),
	},
	(table) => [
		uniqueIndex("play_action_order_uq").on(
			table.boardAttemptId,
			table.actionIndex
		),
	]
);
export const boardScore = sqliteTable("board_score", {
	id: text("id").primaryKey(),
	boardAttemptId: text("board_attempt_id")
		.notNull()
		.references(() => boardAttempt.id, { onDelete: "cascade" })
		.unique(),
	type: text("type", { enum: ["MP", "IMP"] }).notNull(),
	value: real("value"),
	contractMade: integer("contract_made", { mode: "boolean" }),
});

export const evaluationRun = sqliteTable(
	"evaluation_run",
	{
		id: text("id").primaryKey(),
		boardAttemptId: text("board_attempt_id")
			.notNull()
			.references(() => boardAttempt.id, { onDelete: "cascade" }),
		rulesetVersion: text("ruleset_version").notNull(),
		ruleEngineVersion: text("rule_engine_version").notNull(),
		systemVersionId: text("system_version_id").references(
			() => systemVersion.id,
			{ onDelete: "set null" }
		),
		completedAt: integer("completed_at", { mode: "timestamp" }).notNull(),
	},
	(table) => [index("evaluation_run_board_idx").on(table.boardAttemptId)]
);
export const ruleEvaluation = sqliteTable(
	"rule_evaluation",
	{
		id: text("id").primaryKey(),
		evaluationRunId: text("evaluation_run_id")
			.notNull()
			.references(() => evaluationRun.id, { onDelete: "cascade" }),
		ruleVersionId: text("rule_version_id").notNull(),
		evaluationKey: text("evaluation_key").notNull(),
		automaticVerdict: text("automatic_verdict").notNull(),
		reasonCode: text("reason_code").notNull(),
		actionIndex: integer("action_index"),
		facts: text("facts", { mode: "json" })
			.$type<Record<string, string | number | boolean | null>>()
			.notNull(),
	},
	(table) => [
		uniqueIndex("rule_evaluation_key_uq").on(
			table.evaluationRunId,
			table.ruleVersionId,
			table.evaluationKey
		),
	]
);
export const ruleEvaluationOverride = sqliteTable("rule_evaluation_override", {
	id: text("id").primaryKey(),
	ruleEvaluationId: text("rule_evaluation_id")
		.notNull()
		.references(() => ruleEvaluation.id, { onDelete: "cascade" })
		.unique(),
	verdict: text("verdict").notNull(),
	reason: text("reason").notNull(),
	correctedByUserId: text("corrected_by_user_id")
		.notNull()
		.references(() => user.id, { onDelete: "restrict" }),
	createdAt: integer("created_at", { mode: "timestamp" })
		.default(sql`(unixepoch())`)
		.notNull(),
});
export const doubleDummyResult = sqliteTable(
	"double_dummy_result",
	{
		id: text("id").primaryKey(),
		boardAttemptId: text("board_attempt_id")
			.notNull()
			.references(() => boardAttempt.id, { onDelete: "cascade" }),
		dealHash: text("deal_hash").notNull(),
		solverVersion: text("solver_version").notNull(),
		ddTable: text("dd_table", { mode: "json" })
			.$type<Record<string, number>>()
			.notNull(),
		par: text("par", { mode: "json" })
			.$type<{ contracts: string[]; score: number }>()
			.notNull(),
		actualContractMaxTricks: integer("actual_contract_max_tricks"),
		createdAt: integer("created_at", { mode: "timestamp" })
			.default(sql`(unixepoch())`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("double_dummy_version_uq").on(
			table.boardAttemptId,
			table.solverVersion
		),
	]
);

export const userRelations = relations(user, ({ many }) => ({
	apiTokens: many(apiToken),
	sessions: many(session),
	systems: many(bridgeSystem),
	tournaments: many(tournament),
	historyIndexes: many(historyIndex),
}));
export const apiTokenRelations = relations(apiToken, ({ one }) => ({
	user: one(user, { fields: [apiToken.userId], references: [user.id] }),
}));
export const historyIndexRelations = relations(
	historyIndex,
	({ one, many }) => ({
		importRevision: one(importRevision, {
			fields: [historyIndex.importRevisionId],
			references: [importRevision.id],
		}),
		user: one(user, { fields: [historyIndex.userId], references: [user.id] }),
		entries: many(historyIndexEntry),
	})
);
export const historyIndexEntryRelations = relations(
	historyIndexEntry,
	({ one }) => ({
		historyIndex: one(historyIndex, {
			fields: [historyIndexEntry.historyIndexId],
			references: [historyIndex.id],
		}),
	})
);
export const systemRelations = relations(bridgeSystem, ({ one, many }) => ({
	user: one(user, { fields: [bridgeSystem.userId], references: [user.id] }),
	draft: one(systemDraft),
	versions: many(systemVersion),
}));
export const systemDraftRelations = relations(systemDraft, ({ one }) => ({
	system: one(bridgeSystem, {
		fields: [systemDraft.systemId],
		references: [bridgeSystem.id],
	}),
}));
export const systemVersionRelations = relations(systemVersion, ({ one }) => ({
	system: one(bridgeSystem, {
		fields: [systemVersion.systemId],
		references: [bridgeSystem.id],
	}),
}));
export const tournamentRelations = relations(tournament, ({ one, many }) => ({
	user: one(user, { fields: [tournament.userId], references: [user.id] }),
	defaultSystemVersion: one(systemVersion, {
		fields: [tournament.defaultSystemVersionId],
		references: [systemVersion.id],
	}),
	revisions: many(tournamentRevision),
}));
export const tournamentRevisionRelations = relations(
	tournamentRevision,
	({ one, many }) => ({
		tournament: one(tournament, {
			fields: [tournamentRevision.tournamentId],
			references: [tournament.id],
		}),
		importRevision: one(importRevision, {
			fields: [tournamentRevision.importRevisionId],
			references: [importRevision.id],
		}),
		boards: many(boardAttempt),
	})
);
export const boardAttemptRelations = relations(
	boardAttempt,
	({ one, many }) => ({
		tournamentRevision: one(tournamentRevision, {
			fields: [boardAttempt.tournamentRevisionId],
			references: [tournamentRevision.id],
		}),
		deal: one(deal, { fields: [boardAttempt.dealId], references: [deal.id] }),
		systemVersion: one(systemVersion, {
			fields: [boardAttempt.systemVersionId],
			references: [systemVersion.id],
		}),
		auctionCalls: many(auctionCall),
		playActions: many(playAction),
		score: one(boardScore),
		evaluationRuns: many(evaluationRun),
	})
);
export const auctionCallRelations = relations(auctionCall, ({ one }) => ({
	board: one(boardAttempt, {
		fields: [auctionCall.boardAttemptId],
		references: [boardAttempt.id],
	}),
}));
export const playActionRelations = relations(playAction, ({ one }) => ({
	board: one(boardAttempt, {
		fields: [playAction.boardAttemptId],
		references: [boardAttempt.id],
	}),
}));
export const boardScoreRelations = relations(boardScore, ({ one }) => ({
	board: one(boardAttempt, {
		fields: [boardScore.boardAttemptId],
		references: [boardAttempt.id],
	}),
}));
export const evaluationRunRelations = relations(
	evaluationRun,
	({ one, many }) => ({
		board: one(boardAttempt, {
			fields: [evaluationRun.boardAttemptId],
			references: [boardAttempt.id],
		}),
		evaluations: many(ruleEvaluation),
	})
);
export const ruleEvaluationRelations = relations(ruleEvaluation, ({ one }) => ({
	run: one(evaluationRun, {
		fields: [ruleEvaluation.evaluationRunId],
		references: [evaluationRun.id],
	}),
	override: one(ruleEvaluationOverride),
}));
export const ruleEvaluationOverrideRelations = relations(
	ruleEvaluationOverride,
	({ one }) => ({
		evaluation: one(ruleEvaluation, {
			fields: [ruleEvaluationOverride.ruleEvaluationId],
			references: [ruleEvaluation.id],
		}),
	})
);

export const schema = {
	account,
	apiToken,
	apiTokenRelations,
	auctionCall,
	auctionCallRelations,
	boardAttempt,
	boardAttemptRelations,
	boardScore,
	boardScoreRelations,
	bridgeSystem,
	deal,
	doubleDummyResult,
	evaluationRun,
	evaluationRunRelations,
	importRevision,
	historyIndex,
	historyIndexEntry,
	historyIndexEntryRelations,
	historyIndexRelations,
	playAction,
	playActionRelations,
	ruleEvaluation,
	ruleEvaluationRelations,
	ruleEvaluationOverride,
	ruleEvaluationOverrideRelations,
	session,
	systemDraft,
	systemDraftRelations,
	systemRelations,
	systemVersion,
	systemVersionRelations,
	tournament,
	tournamentRelations,
	tournamentRevision,
	tournamentRevisionRelations,
	user,
	userRelations,
	verification,
};
