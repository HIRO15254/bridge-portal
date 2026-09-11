import { describe, expect, it } from "vitest";

import { app } from "../worker";

const bindings = {
	CORS_ORIGIN: "https://web.example.test",
	DB: {} as D1Database,
};

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
});
