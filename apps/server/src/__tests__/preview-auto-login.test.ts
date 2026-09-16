import { readFileSync } from "node:fs";
import { fileURLToPath, URL as NodeURL } from "node:url";
import { Miniflare } from "miniflare";
import { afterEach, describe, expect, it } from "vitest";

import { app } from "../worker";

const bindingsConfig = {
	BETTER_AUTH_SECRET: "test-secret-that-is-at-least-thirty-two-characters",
	BETTER_AUTH_URL: "https://api.example.test",
	BOOTSTRAP_TOKEN: "test-bootstrap-token-at-least-thirty-two-characters",
	CORS_ORIGIN: "https://web.example.test",
	PREVIEW_AUTO_LOGIN: "true",
};

const miniflares: Miniflare[] = [];

afterEach(async () => {
	await Promise.all(
		miniflares.splice(0).map((miniflare) => miniflare.dispose())
	);
});

async function bindings(previewAutoLogin = "true"): Promise<Env> {
	const miniflare = new Miniflare({
		compatibilityDate: "2026-04-08",
		d1Databases: ["DB"],
		modules: true,
		r2Buckets: ["RAW_IMPORTS"],
		script: "export default { fetch() { return new Response('OK') } }",
	});
	miniflares.push(miniflare);
	const database = await miniflare.getD1Database("DB");
	for (const filename of [
		"0000_slimy_night_nurse.sql",
		"0001_young_stepford_cuckoos.sql",
		"0002_immutable_system_versions.sql",
		"0003_dashing_lady_bullseye.sql",
		"0004_history_index.sql",
	]) {
		const migration = readFileSync(
			fileURLToPath(
				new NodeURL(
					`../../../../packages/db/src/migrations/${filename}`,
					import.meta.url
				)
			),
			"utf8"
		);
		for (const statement of migration.split("--> statement-breakpoint")) {
			if (statement.trim()) {
				await database.prepare(statement).run();
			}
		}
	}
	return {
		...bindingsConfig,
		DB: database,
		PREVIEW_AUTO_LOGIN: previewAutoLogin,
		RAW_IMPORTS: await miniflare.getR2Bucket("RAW_IMPORTS"),
	} as Env;
}

function cookie(response: Response): string {
	const setCookie = response.headers.get("set-cookie");
	if (!setCookie) {
		throw new Error("Preview login did not set a session cookie");
	}
	return setCookie.split(";", 1)[0] ?? "";
}

describe("preview auto-login", () => {
	it("does not expose the automatic-login endpoint outside preview", async () => {
		const runtime = await bindings("false");
		const response = await app.request(
			"/api/auth/preview/auto-login",
			{
				headers: { Origin: bindingsConfig.CORS_ORIGIN },
				method: "POST",
			},
			runtime
		);

		expect(response.status).toBe(404);
	});

	it("redirects through the preview API only to the configured web origin", async () => {
		const runtime = await bindings();
		const valid = await app.request(
			"/api/preview/access?returnTo=https%3A%2F%2Fweb.example.test%2Ftournaments",
			undefined,
			runtime
		);
		expect(valid.status).toBe(302);
		expect(valid.headers.get("location")).toBe(
			"https://web.example.test/tournaments?previewApiAccess=1"
		);

		const invalid = await app.request(
			"/api/preview/access?returnTo=https%3A%2F%2Fother.example.test",
			undefined,
			runtime
		);
		expect(invalid.status).toBe(400);
	});

	it("creates a fresh Better Auth session for the copied development user", async () => {
		const runtime = await bindings();
		const bootstrap = await app.request(
			"/api/bootstrap",
			{
				body: JSON.stringify({
					email: "developer@example.test",
					name: "Developer",
					password: "correct-horse-battery-staple",
				}),
				headers: {
					Authorization: `Bearer ${bindingsConfig.BOOTSTRAP_TOKEN}`,
					"Content-Type": "application/json",
					Origin: bindingsConfig.CORS_ORIGIN,
				},
				method: "POST",
			},
			runtime
		);
		expect(bootstrap.status).toBe(201);

		const login = await app.request(
			"/api/auth/preview/auto-login",
			{
				headers: { Origin: bindingsConfig.CORS_ORIGIN },
				method: "POST",
			},
			runtime
		);
		expect(login.status).toBe(200);

		const currentSession = await app.request(
			"/api/auth/get-session",
			{
				headers: { Cookie: cookie(login), Origin: bindingsConfig.CORS_ORIGIN },
			},
			runtime
		);
		expect(currentSession.status).toBe(200);
		await expect(currentSession.json()).resolves.toMatchObject({
			user: { email: "developer@example.test" },
		});
	});
});
