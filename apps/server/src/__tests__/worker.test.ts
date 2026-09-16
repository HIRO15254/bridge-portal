import { Miniflare } from "miniflare";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { app } from "../worker";

const bindings = {
	BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
	BETTER_AUTH_URL: "https://api.example.test",
	BOOTSTRAP_TOKEN: "test-bootstrap-token-at-least-thirty-two-characters",
	CORS_ORIGIN: "https://web.example.test",
	DB: {} as D1Database,
	RAW_IMPORTS: {} as R2Bucket,
};

const historyImportToken = "bpih_test-history-import-token";
const miniflares: Miniflare[] = [];

async function migratedDatabase(): Promise<D1Database> {
	const miniflare = new Miniflare({
		cf: false,
		compatibilityDate: "2026-04-08",
		d1Databases: ["DB"],
		modules: true,
		script: "export default { fetch() { return new Response('ok'); } }",
	});
	miniflares.push(miniflare);
	const database = await miniflare.getD1Database("DB");
	await database.exec(`
		CREATE TABLE user (id text PRIMARY KEY NOT NULL, name text NOT NULL, email text NOT NULL, singleton_key integer NOT NULL DEFAULT 1);
		CREATE TABLE api_token (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, label text NOT NULL, token_hash text NOT NULL UNIQUE, expires_at integer NOT NULL, created_at integer NOT NULL DEFAULT (unixepoch()));
		CREATE TABLE import_revision (id text PRIMARY KEY NOT NULL, user_id text NOT NULL, tournament_id text, sha256 text NOT NULL, r2_key text NOT NULL, status text NOT NULL, warnings text NOT NULL, created_at integer NOT NULL DEFAULT (unixepoch()));
		CREATE TABLE history_index (id text PRIMARY KEY NOT NULL, import_revision_id text NOT NULL UNIQUE, user_id text NOT NULL, family text NOT NULL, captured_at integer NOT NULL, capture_mode text NOT NULL, locale text NOT NULL, coverage text NOT NULL, created_at integer NOT NULL DEFAULT (unixepoch()));
		CREATE TABLE history_index_entry (id text PRIMARY KEY NOT NULL, history_index_id text NOT NULL, source_tournament_id text NOT NULL, title text NOT NULL, played_at integer, registered_player_count integer NOT NULL, in_progress integer NOT NULL, rank integer, score real, score_type text, board_count integer, played_board_count integer, metadata text NOT NULL);
	`);
	await database
		.prepare(
			"INSERT INTO user (id, name, email, singleton_key) VALUES (?, ?, ?, ?)"
		)
		.bind("portal-user", "Portal User", "portal@example.test", 1)
		.run();
	return database;
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value)
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

afterEach(async () => {
	await Promise.all(
		miniflares.splice(0).map((miniflare) => miniflare.dispose())
	);
});

describe("worker", () => {
	it("returns the HTTP health response", async () => {
		const response = await app.request("/", {}, bindings);

		expect(response.status).toBe(200);
		await expect(response.text()).resolves.toBe("OK");
	});

	it("serves the tRPC health check", async () => {
		const response = await app.request("/trpc/healthCheck", {}, bindings);
		const payload = (await response.json()) as {
			result?: { data?: string };
		};

		expect(response.status).toBe(200);
		expect(payload.result?.data).toBe("OK");
	});

	it("allows the configured web origin", async () => {
		const response = await app.request(
			"/",
			{ headers: { Origin: bindings.CORS_ORIGIN } },
			bindings
		);

		expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
			bindings.CORS_ORIGIN
		);
	});

	describe("history import API", () => {
		let apiBindings: typeof bindings;
		let storedImports: Map<string, ArrayBuffer>;

		beforeEach(async () => {
			storedImports = new Map();
			apiBindings = {
				...bindings,
				DB: await migratedDatabase(),
				RAW_IMPORTS: {
					delete: (key: string) => {
						storedImports.delete(key);
						return Promise.resolve();
					},
					put: (key: string, value: ArrayBuffer) => {
						storedImports.set(key, value);
						return Promise.resolve();
					},
				} as unknown as R2Bucket,
			};
			await apiBindings.DB.prepare(
				"INSERT INTO api_token (id, user_id, label, token_hash, expires_at) VALUES (?, ?, ?, ?, ?)"
			)
				.bind(
					"history-import-token",
					"portal-user",
					"test",
					await sha256(historyImportToken),
					Math.floor(Date.now() / 1000) + 3600
				)
				.run();
		});

		it("rejects a request without the import token", async () => {
			const response = await app.request(
				"/api/v1/imports/funbridge-json",
				{
					body: "{}",
					method: "POST",
					headers: { "Content-Type": "application/json" },
				},
				apiBindings
			);

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
		});

		it("rejects malformed history data after authenticating the caller", async () => {
			const response = await app.request(
				"/api/v1/imports/funbridge-json",
				{
					body: "not-json",
					method: "POST",
					headers: {
						Authorization: `Bearer ${historyImportToken}`,
						"Content-Type": "application/json",
					},
				},
				apiBindings
			);

			expect(response.status).toBe(400);
			await expect(response.json()).resolves.toMatchObject({
				error: "INVALID_FUNBRIDGE_JSON",
			});
		});

		it("persists a valid history index for the Portal account", async () => {
			const response = await app.request(
				"/api/v1/imports/funbridge-json",
				{
					body: JSON.stringify({
						capturedAt: "2026-09-16T00:00:00.000Z",
						coverage: { rowCount: 1, scope: "FULL", totalCount: 1 },
						family: "DAILY",
						format: "FUNBRIDGE_HISTORY_INDEX",
						formatVersion: 1,
						source: {
							captureMode: "NETWORK_RESPONSE",
							locale: "ja-JP",
							platform: "FUNBRIDGE_WEB",
						},
						tournaments: [
							{
								inProgress: false,
								registeredPlayerCount: 24,
								sourceTournamentId: "daily-123",
								title: "Daily tournament",
							},
						],
					}),
					method: "POST",
					headers: {
						Authorization: `Bearer ${historyImportToken}`,
						"Content-Type": "application/json",
					},
				},
				apiBindings
			);

			expect(response.status).toBe(201);
			await expect(response.json()).resolves.toMatchObject({
				duplicate: false,
				kind: "HISTORY_INDEX",
				rowCount: 1,
			});
			expect(storedImports.size).toBe(1);
			await expect(
				apiBindings.DB.prepare(
					"SELECT count(*) AS count FROM history_index"
				).first<{ count: number }>()
			).resolves.toEqual({ count: 1 });
		});
	});
});
