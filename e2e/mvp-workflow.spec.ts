import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const apiUrl = "http://127.0.0.1:8787";
const importCompletePattern = /取込が完了しました/;
const tournamentPattern = /Daily example/;
const boardPattern = /BOARD 1/;
const openingRulePattern = /A-OB-01@2026-05-01/;
const relatedBoardPattern = /Daily example · Board 1/;
const admin = {
	email: "learner@example.test",
	funbridgeId: "replace-with-your-funbridge-id",
	name: "Learner",
	password: "correct-horse-battery-staple",
};

test("Rule学習から実戦Boardへの往復まで完走する", async ({ page, request }) => {
	const bootstrap = await request.post(`${apiUrl}/api/bootstrap`, {
		data: admin,
		headers: {
			Authorization:
				"Bearer e2e-bootstrap-token-at-least-thirty-two-characters",
			Origin: "http://127.0.0.1:3001",
		},
	});
	expect(bootstrap.status()).toBe(201);

	await page.goto("/");
	await page.getByLabel("メールアドレス").fill(admin.email);
	await page.getByLabel("パスワード").fill(admin.password);
	await page.getByRole("button", { name: "ログイン" }).click();
	await expect(page.getByRole("link", { name: "My Systems" })).toBeVisible();

	await page.getByRole("link", { name: "My Systems" }).click();
	await page.getByPlaceholder("例: Standard 15–17 NT").fill("Study System");
	await page.getByRole("button", { name: "新しいDraftを作る" }).click();
	await expect(page.getByText("Draftを作成しました。")).toBeVisible();
	await page.getByRole("button", { name: "新Versionを公開" }).click();
	await expect(
		page.getByText("変更不能な新しいSystem Versionを公開しました。")
	).toBeVisible();

	await page.getByRole("link", { name: "Tournaments" }).click();
	await page
		.locator('input[type="file"]')
		.setInputFiles(
			fileURLToPath(
				new URL(
					"../apps/web/public/funbridge-import-example.json",
					import.meta.url
				)
			)
		);
	await page.getByRole("button", { name: "取込・自動評価" }).click();
	await expect(page.getByText(importCompletePattern)).toBeVisible();
	await page.getByRole("link", { name: tournamentPattern }).click();

	const assignment = page.waitForResponse(
		(response) =>
			response.url().includes("tournaments.setDefaultSystem") && response.ok()
	);
	await page
		.getByLabel("標準System")
		.selectOption({ label: "Study System v1" });
	await assignment;
	await page.getByRole("link", { name: boardPattern }).click();
	await expect(
		page.getByRole("heading", { name: "22項目の判定" })
	).toBeVisible();
	await expect(page.locator(".evaluation-list article")).toHaveCount(22);

	await page.getByRole("button", { name: "進む" }).click();
	await expect(page.locator(".trick-grid").getByText("S9")).toBeVisible();
	const boardUrl = page.url();
	const boardId = new URL(boardUrl).pathname.split("/").at(-1);
	expect(boardId).toBeTruthy();
	const pbn = await page.request.get(
		`${apiUrl}/api/boards/${boardId}/export.pbn`
	);
	expect(pbn.status()).toBe(200);
	expect(await pbn.text()).toContain(
		'[FunbridgeTournamentId "daily-example-2026-09-12"]'
	);

	await page.getByRole("link", { name: "Statistics" }).click();
	await expect(page.getByText("Engine 2.2.0")).toBeVisible();
	await expect(page.locator(".stats-table .table-row").first()).toBeVisible();

	await page.goto(boardUrl);
	await page.getByRole("link", { name: openingRulePattern }).click();
	await expect(
		page.getByRole("heading", { name: "ナチュラル・オープン" })
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: relatedBoardPattern })
	).toBeVisible();
});
