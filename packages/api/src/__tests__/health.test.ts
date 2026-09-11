import { createDb } from "@bridge-portal/db";
import { describe, expect, it } from "vitest";

import { appRouter } from "../routers/index";

describe("healthCheck", () => {
	it("returns OK", async () => {
		const caller = appRouter.createCaller({
			db: createDb({} as Parameters<typeof createDb>[0]),
			session: null,
		});

		await expect(caller.healthCheck()).resolves.toBe("OK");
	});
});
