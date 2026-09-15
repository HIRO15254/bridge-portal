import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { RULE_ENGINE_VERSION } from "../packages/domain/src/evaluator";

const apiUrl = "http://127.0.0.1:8787";
const importCompletePattern = /取込が完了しました/;
const tournamentPattern = /Daily example/;
const boardPattern = /BOARD 1/;
const openingRulePattern = /A-OB-01@2026-05-01/;
const relatedBoardPattern = /Daily example · Board 1/;
const staymanUrlPattern = /rule=A-RR-02/;
const parPattern = /^Par /;
const actualContractMaximumPattern = /^実Contract最大 /;
const admin = {
	email: "learner@example.test",
	funbridgeId: "replace-with-your-funbridge-id",
	name: "Learner",
	password: "correct-horse-battery-staple",
};

test("新規登録からRule学習と実戦Boardの往復まで完走する", async ({
	page,
	request,
}) => {
	await page.goto("/");
	await page.getByRole("button", { name: "新規登録" }).click();
	await page.getByLabel("表示名").fill(admin.name);
	await page.getByLabel("メールアドレス").fill(admin.email);
	await page.getByLabel("パスワード", { exact: true }).fill(admin.password);
	await page.getByLabel("パスワード（確認）").fill(admin.password);
	await page.getByRole("button", { name: "アカウントを作成" }).click();
	await expect(page.getByRole("link", { name: "My Systems" })).toBeVisible();
	const registrationStatus = await request.get(
		`${apiUrl}/api/registration-status`,
		{ headers: { Origin: "http://127.0.0.1:3001" } }
	);
	expect(await registrationStatus.json()).toEqual({ available: false });

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

	await page.getByRole("button", { name: "DDSで解析" }).click();
	await expect(
		page.getByRole("button", { name: "解析を保存しました" })
	).toBeVisible({ timeout: 30_000 });
	await expect(page.locator(".dd-panel").getByText(parPattern)).toBeVisible();
	await expect(
		page.locator(".dd-panel").getByText(actualContractMaximumPattern)
	).toBeVisible();

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
	await expect(page.getByText(`Engine ${RULE_ENGINE_VERSION}`)).toBeVisible();
	await expect(page.locator(".stats-table .table-row").first()).toBeVisible();

	await page.goto(boardUrl);
	await page.getByRole("link", { name: openingRulePattern }).click();
	await expect(
		page.getByRole("heading", { name: "ナチュラル・オープン" })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "自然言語での説明" })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "プログラム的なルール" })
	).toBeVisible();
	await page.getByText("背景・継続・方式の補足", { exact: true }).click();
	await expect(
		page.getByRole("heading", { name: "① いつ使うか" })
	).toBeVisible();
	await expect(
		page.getByRole("heading", { name: "② 何を示すか" })
	).toBeVisible();
	await expect(
		page.getByText(
			"Weak TwoのHCP＋ビッドスーツ枚数は10以上。10未満のWeak TwoはリストAでは使用不可。"
		)
	).toBeVisible();
	await expect(
		page.getByRole("link", { name: relatedBoardPattern })
	).toBeVisible();
	await page
		.locator(".rule-row")
		.filter({ hasText: "Stayman" })
		.first()
		.click();
	await expect(page).toHaveURL(staymanUrlPattern);
	await expect(page.getByRole("heading", { name: "Stayman" })).toBeVisible();
	await expect(
		page
			.getByText(
				"すぐ上の♣を人工的にBidし、オープナーの4枚メジャーを問い合わせます（例：1NT–2♣）。",
				{ exact: true }
			)
			.first()
	).toBeVisible();

	const closedStatus = page.waitForResponse((response) =>
		response.url().includes("/api/registration-status")
	);
	await page.getByRole("button", { name: "ログアウト" }).click();
	await closedStatus;
	await expect(page.getByRole("button", { name: "ログイン" })).toBeVisible();
	await expect(page.getByRole("button", { name: "新規登録" })).toHaveCount(0);
});
