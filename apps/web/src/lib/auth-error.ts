interface AuthErrorDetails {
	code?: string;
	message?: string;
}

const registrationMessages: Record<string, string> = {
	INVALID_EMAIL: "有効なメールアドレスを入力してください。",
	PASSWORD_TOO_LONG: "パスワードは128文字以下で入力してください。",
	PASSWORD_TOO_SHORT: "パスワードは12文字以上で入力してください。",
	REGISTRATION_CLOSED: "管理者アカウントは登録済みです。ログインしてください。",
	USER_ALREADY_EXISTS:
		"このメールアドレスは登録済みです。ログインしてください。",
	USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
		"このメールアドレスは登録済みです。ログインしてください。",
};

export function registrationErrorMessage(error: AuthErrorDetails): string {
	const knownMessage = error.code
		? registrationMessages[error.code]
		: undefined;
	if (knownMessage) {
		return knownMessage;
	}
	if (error.message) {
		return `登録できませんでした: ${error.message}`;
	}
	return "登録できませんでした。入力内容を確認して再試行してください。";
}
