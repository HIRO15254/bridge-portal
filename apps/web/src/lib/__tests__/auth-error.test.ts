import { describe, expect, it } from "vitest";

import { registrationErrorMessage } from "../auth-error";

describe("registrationErrorMessage", () => {
	it.each([
		["PASSWORD_TOO_SHORT", "パスワードは12文字以上で入力してください。"],
		["PASSWORD_TOO_LONG", "パスワードは128文字以下で入力してください。"],
		["INVALID_EMAIL", "有効なメールアドレスを入力してください。"],
		[
			"USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
			"このメールアドレスは登録済みです。ログインしてください。",
		],
		[
			"REGISTRATION_CLOSED",
			"管理者アカウントは登録済みです。ログインしてください。",
		],
	])("maps %s to a Japanese action", (code, expected) => {
		expect(registrationErrorMessage({ code })).toBe(expected);
	});

	it("keeps an unknown server reason visible", () => {
		expect(
			registrationErrorMessage({ message: "Unexpected authentication error" })
		).toBe("登録できませんでした: Unexpected authentication error");
	});
});
