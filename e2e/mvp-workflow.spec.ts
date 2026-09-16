import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const apiUrl = "http://127.0.0.1:8787";
const importCompletePattern = /取込が完了しました/;
const tournamentPattern = /Daily example/;
const boardPattern = /BOARD 1/;
const parPattern = /^Par /;
const admin = {
	email: "learner@example.test",
	name: "Learner",
	password: "correct-horse-battery-staple",
};

test("新規登録からFunbridge履歴の取込・閲覧まで完走する", async ({
	page,
	request,
}) => {
	test.setTimeout(120_000);
	await page.goto("/");
	await page.getByRole("button", { name: "新規登録" }).click();
	await page.getByLabel("表示名").fill(admin.name);
	await page.getByLabel("メールアドレス").fill(admin.email);
	await page.getByLabel("パスワード", { exact: true }).fill(admin.password);
	await page.getByLabel("パスワード（確認）").fill(admin.password);
	await page.getByRole("button", { name: "アカウントを作成" }).click();
	await expect(page.getByRole("link", { name: "History" })).toBeVisible();

	const registrationStatus = await request.get(
		`${apiUrl}/api/registration-status`,
		{ headers: { Origin: "http://127.0.0.1:3001" } }
	);
	expect(await registrationStatus.json()).toEqual({ available: false });

	await page.getByRole("link", { name: "History" }).click();
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
	await page.getByRole("button", { name: "取り込む" }).click();
	await expect(page.getByText(importCompletePattern)).toBeVisible();
	await page.getByRole("link", { name: tournamentPattern }).click();
	await page.getByRole("link", { name: boardPattern }).click();

	await page.getByRole("button", { name: "DDSで解析" }).click();
	await expect(
		page.getByRole("button", { name: "解析を保存しました" })
	).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(".dd-panel").getByText(parPattern)).toBeVisible();

	await page.getByRole("button", { name: "進む" }).click();
	await expect(page.locator(".trick-grid").getByText("S9")).toBeVisible();
	const boardId = new URL(page.url()).pathname.split("/").at(-1);
	expect(boardId).toBeTruthy();
	const pbn = await page.request.get(
		`${apiUrl}/api/boards/${boardId}/export.pbn`
	);
	expect(pbn.status()).toBe(200);
	expect(await pbn.text()).toContain('[FunbridgeTournamentFamily "DAILY"]');

	const closedStatus = page.waitForResponse((response) =>
		response.url().includes("/api/registration-status")
	);
	await page.getByRole("button", { name: "ログアウト" }).click();
	await closedStatus;
	await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
	await expect(page.getByRole("button", { name: "新規登録" })).toHaveCount(0);
});
