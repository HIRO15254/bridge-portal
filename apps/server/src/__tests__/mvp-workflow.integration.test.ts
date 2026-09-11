import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { appRouter } from "@bridge-portal/api/routers/index";
import { createDb, type D1Database } from "@bridge-portal/db";
import { RULE_ENGINE_VERSION } from "@bridge-portal/domain";
import { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { app } from "../worker";

const admin = {
	email: "learner@example.test",
	funbridgeId: "replace-with-your-funbridge-id",
	name: "Learner",
	password: "correct-horse-battery-staple",
};
const bindingsConfig = {
	BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
	BETTER_AUTH_URL: "http://api.example.test",
	BOOTSTRAP_TOKEN: "test-bootstrap-token-at-least-thirty-two-characters",
	CORS_ORIGIN: "http://web.example.test",
};
const cookieBoundaryPattern = /,(?=[^;,]+=)/;

let miniflare: Miniflare;

async function applyMigrations(database: D1Database): Promise<void> {
	for (const filename of [
		"0000_slimy_night_nurse.sql",
		"0001_young_stepford_cuckoos.sql",
		"0002_immutable_system_versions.sql",
	]) {
		const source = readFileSync(
			fileURLToPath(
				new NodeURL(
					`../../../../packages/db/src/migrations/${filename}`,
					import.meta.url
				)
			),
			"utf8"
		);
		for (const statement of source.split("--> statement-breakpoint")) {
			if (statement.trim()) {
				await database.prepare(statement).run();
			}
		}
	}
}

function sessionCookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) {
		throw new Error("Sign-in response did not set a session cookie");
	}
	return setCookie
		.split(cookieBoundaryPattern)
		.map((value) => value.split(";", 1)[0])
		.join("; ");
}

describe("stored MVP workflow", () => {
	beforeAll(async () => {
		miniflare = new Miniflare({
			compatibilityDate: "2026-04-01",
			d1Databases: ["DB"],
			modules: true,
			r2Buckets: ["RAW_IMPORTS"],
			script: "export default { fetch() { return new Response('OK') } }",
		});
		await applyMigrations((await miniflare.getD1Database("DB")) as D1Database);
	});

	afterAll(async () => {
		await miniflare.dispose();
	});

	it("runs bootstrap → system → import → evaluation → statistics → PBN", async () => {
		const bindings = {
			...bindingsConfig,
			DB: (await miniflare.getD1Database("DB")) as D1Database,
			RAW_IMPORTS: await miniflare.getR2Bucket("RAW_IMPORTS"),
		} as Env;
		const bootstrap = await app.request(
			"/api/bootstrap",
			{
				body: JSON.stringify(admin),
				headers: {
					Authorization: `Bearer ${bindingsConfig.BOOTSTRAP_TOKEN}`,
					"Content-Type": "application/json",
					Origin: bindingsConfig.CORS_ORIGIN,
				},
				method: "POST",
			},
			bindings
		);
		expect(bootstrap.status).toBe(201);

		const signIn = await app.request(
			"/api/auth/sign-in/email",
			{
				body: JSON.stringify({ email: admin.email, password: admin.password }),
				headers: {
					"Content-Type": "application/json",
					Origin: bindingsConfig.CORS_ORIGIN,
				},
				method: "POST",
			},
			bindings
		);
		expect(signIn.status).toBe(200);
		const cookie = sessionCookie(signIn);
		const db = createDb(bindings.DB);
		const learner = await db.query.user.findFirst();
		expect(learner?.funbridgeId).toBe(admin.funbridgeId);
		if (!learner) {
			throw new Error("Bootstrap did not create the learner");
		}
		const caller = appRouter.createCaller({
			db,
			session: {
				user: { id: learner.id, email: learner.email, name: learner.name },
			},
		});

		const createdSystem = await caller.systems.create({ name: "Study System" });
		const published = await caller.systems.publish({
			systemId: createdSystem.id,
		});
		expect(published.versionNumber).toBe(1);

		const source = readFileSync(
			fileURLToPath(
				new NodeURL(
					"../../../web/public/funbridge-import-example.json",
					import.meta.url
				)
			),
			"utf8"
		);
		const form = new FormData();
		form.set(
			"file",
			new File([source], "daily.json", { type: "application/json" })
		);
		const imported = await app.request(
			"/api/imports/funbridge-json",
			{
				body: form,
				headers: { Cookie: cookie, Origin: bindingsConfig.CORS_ORIGIN },
				method: "POST",
			},
			bindings
		);
		expect(imported.status).toBe(201);
		const importedBody = (await imported.json()) as {
			revisionNumber: number;
			tournamentId: string;
		};
		expect(importedBody.revisionNumber).toBe(1);

		const duplicateForm = new FormData();
		duplicateForm.set(
			"file",
			new File([source], "daily-duplicate.json", {
				type: "application/json",
			})
		);
		const duplicate = await app.request(
			"/api/imports/funbridge-json",
			{
				body: duplicateForm,
				headers: { Cookie: cookie, Origin: bindingsConfig.CORS_ORIGIN },
				method: "POST",
			},
			bindings
		);
		expect(duplicate.status).toBe(200);
		await expect(duplicate.json()).resolves.toMatchObject({
			duplicate: true,
			tournamentId: importedBody.tournamentId,
		});

		const updatedJson = JSON.parse(source) as {
			boards: Array<{ score?: number }>;
			tournament: { score?: number };
		};
		updatedJson.tournament.score = 55.5;
		if (updatedJson.boards[0]) {
			updatedJson.boards[0].score = 60.25;
		}
		const updatedForm = new FormData();
		updatedForm.set(
			"file",
			new File([JSON.stringify(updatedJson)], "daily-updated.json", {
				type: "application/json",
			})
		);
		const updated = await app.request(
			"/api/imports/funbridge-json",
			{
				body: updatedForm,
				headers: { Cookie: cookie, Origin: bindingsConfig.CORS_ORIGIN },
				method: "POST",
			},
			bindings
		);
		expect(updated.status).toBe(201);
		await expect(updated.json()).resolves.toMatchObject({
			duplicate: false,
			revisionNumber: 2,
			tournamentId: importedBody.tournamentId,
		});

		const importedTournament = await caller.tournaments.byId({
			id: importedBody.tournamentId,
		});
		expect(importedTournament.revisions).toHaveLength(2);
		const activeRevision = importedTournament.revisions.find(
			(revision) => revision.id === importedTournament.activeRevisionId
		);
		expect(activeRevision?.revisionNumber).toBe(2);
		expect(activeRevision?.tournamentScore).toBe(55.5);
		expect(activeRevision?.boards).toHaveLength(1);
		const boardId = activeRevision?.boards[0]?.id;
		if (!boardId) {
			throw new Error("Import did not create an active board");
		}

		await caller.tournaments.setDefaultSystem({
			tournamentId: importedBody.tournamentId,
			systemVersionId: published.id,
		});
		const board = await caller.boards.byId({ id: boardId });
		expect(board.systemVersionId).toBe(published.id);
		expect(board.evaluations).toHaveLength(22);
		expect(board.evaluationRun?.ruleEngineVersion).toBe(RULE_ENGINE_VERSION);
		const automatic = board.evaluations[0];
		if (!automatic) {
			throw new Error("Evaluation was not persisted");
		}
		await caller.boards.override({
			evaluationId: automatic.id,
			reason: "実戦メモを確認して意図を訂正",
			verdict: "INDETERMINATE",
		});
		const correctedBoard = await caller.boards.byId({ id: boardId });
		const corrected = correctedBoard.evaluations.find(
			(evaluation) => evaluation.id === automatic.id
		);
		expect(corrected?.automaticVerdict).toBe(automatic.automaticVerdict);
		expect(corrected?.override).toMatchObject({
			correctedByUserId: learner.id,
			reason: "実戦メモを確認して意図を訂正",
			verdict: "INDETERMINATE",
		});
		expect(corrected?.override?.createdAt).toBeInstanceOf(Date);

		const stats = await caller.statistics.summary();
		expect(
			Object.values(stats.counts).reduce(
				(total, count) => total + Number(count ?? 0),
				0
			)
		).toBe(22);
		const breakdown = await caller.statistics.ruleBreakdown();
		expect(breakdown.every((row) => row.scoreType === "MP")).toBe(true);

		const pbn = await app.request(
			`/api/boards/${boardId}/export.pbn`,
			{ headers: { Cookie: cookie, Origin: bindingsConfig.CORS_ORIGIN } },
			bindings
		);
		expect(pbn.status).toBe(200);
		await expect(pbn.text()).resolves.toContain(
			'[FunbridgeTournamentId "daily-example-2026-09-12"]'
		);

		const storedObjects = await bindings.RAW_IMPORTS.list();
		expect(storedObjects.objects).toHaveLength(2);
		const storedObject = await bindings.RAW_IMPORTS.head(
			storedObjects.objects[0]?.key ?? ""
		);
		expect(storedObject?.customMetadata?.source).toBe("funbridge");
	});
});
