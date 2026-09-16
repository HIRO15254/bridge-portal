const portalImportPath = "/api/v1/imports/funbridge-json";
const deviceAuthorizationPath = "/api/v1/device-authorizations";
const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

export class PortalUploadError extends Error {
	constructor(code, message, status) {
		super(message);
		this.code = code;
		this.status = status;
	}
}

export function normalizePortalApiUrl(value) {
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new PortalUploadError(
			"PORTAL_URL_INVALID",
			"Portal API URL は http:// または https:// で始まるURLにしてください。"
		);
	}
	const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(url.hostname);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) {
		throw new PortalUploadError(
			"PORTAL_URL_INSECURE",
			"Portal API URL は HTTPS を使用してください（localhost は HTTP を使用できます）。"
		);
	}
	if (
		url.username ||
		url.password ||
		url.pathname !== "/" ||
		url.search ||
		url.hash
	) {
		throw new PortalUploadError(
			"PORTAL_URL_INVALID",
			"Portal API URL はパス、認証情報、クエリを含まないオリジンURLにしてください。"
		);
	}
	return url.origin;
}

async function errorPayload(response) {
	try {
		return await response.json();
	} catch {
		return undefined;
	}
}

function uploadError(response, payload) {
	if (response.status === 401) {
		return new PortalUploadError(
			"PORTAL_UNAUTHORIZED",
			"Portal のアクセストークンが無効または失効しています。ブラウザで新しいトークンを発行してください。",
			response.status
		);
	}
	if (response.status === 413) {
		return new PortalUploadError(
			"PORTAL_FILE_TOO_LARGE",
			"Portal のファイル上限を超えています。",
			response.status
		);
	}
	const detail =
		typeof payload?.error === "string" ? ` (${payload.error})` : "";
	return new PortalUploadError(
		"PORTAL_REJECTED",
		`Portal が投入を受け付けませんでした${detail}。`,
		response.status
	);
}

export async function uploadPortalJson({
	accessToken,
	data,
	fetchFn = fetch,
	portalApiUrl,
	sleep = (milliseconds) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
	if (!(typeof accessToken === "string" && accessToken.trim())) {
		throw new PortalUploadError(
			"PORTAL_TOKEN_MISSING",
			"Portal のアクセストークンを入力してください。"
		);
	}
	const endpoint = `${normalizePortalApiUrl(portalApiUrl)}${portalImportPath}`;
	let lastError;
	for (let attempt = 0; attempt < 3; attempt += 1) {
		try {
			const response = await fetchFn(endpoint, {
				body: JSON.stringify(data),
				headers: {
					Authorization: `Bearer ${accessToken.trim()}`,
					"Content-Type": "application/json",
				},
				method: "POST",
			});
			const payload = await errorPayload(response);
			if (response.ok) {
				return {
					duplicate: payload?.duplicate === true,
					payload,
				};
			}
			lastError = uploadError(response, payload);
			if (!retryableStatuses.has(response.status)) {
				throw lastError;
			}
		} catch (error) {
			if (error instanceof PortalUploadError) {
				if (!retryableStatuses.has(error.status)) {
					throw error;
				}
				lastError = error;
			} else {
				lastError = new PortalUploadError(
					"PORTAL_NETWORK_ERROR",
					"Portal への通信に失敗しました。ネットワークと Portal API URL を確認してください。"
				);
			}
		}
		if (attempt < 2) {
			await sleep(2 ** attempt * 500);
		}
	}
	throw lastError;
}

export async function startPortalAuthorization({
	fetchFn = fetch,
	portalApiUrl,
}) {
	const response = await fetchFn(
		`${normalizePortalApiUrl(portalApiUrl)}${deviceAuthorizationPath}`,
		{ method: "POST" }
	);
	const payload = await errorPayload(response);
	if (!response.ok) {
		throw uploadError(response, payload);
	}
	if (
		!(
			typeof payload?.deviceCode === "string" &&
			typeof payload.userCode === "string" &&
			typeof payload.verificationUriComplete === "string" &&
			typeof payload.interval === "number" &&
			typeof payload.expiresIn === "number"
		)
	) {
		throw new PortalUploadError(
			"PORTAL_AUTHORIZATION_INVALID",
			"Portal の認証開始レスポンスが不正です。"
		);
	}
	return payload;
}

export async function pollPortalAuthorization({
	deviceCode,
	fetchFn = fetch,
	portalApiUrl,
}) {
	const response = await fetchFn(
		`${normalizePortalApiUrl(portalApiUrl)}${deviceAuthorizationPath}/token`,
		{
			body: JSON.stringify({ deviceCode }),
			headers: { "Content-Type": "application/json" },
			method: "POST",
		}
	);
	const payload = await errorPayload(response);
	if (response.status === 428 && payload?.error === "AUTHORIZATION_PENDING") {
		return undefined;
	}
	if (!response.ok) {
		throw uploadError(response, payload);
	}
	if (typeof payload?.accessToken !== "string") {
		throw new PortalUploadError(
			"PORTAL_AUTHORIZATION_INVALID",
			"Portal の認証完了レスポンスが不正です。"
		);
	}
	return payload.accessToken;
}

export async function authorizePortal({
	fetchFn = fetch,
	onStart,
	portalApiUrl,
	sleep = (milliseconds) =>
		new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) {
	const authorization = await startPortalAuthorization({
		fetchFn,
		portalApiUrl,
	});
	await onStart?.(authorization);
	const expiresAt = Date.now() + authorization.expiresIn * 1000;
	while (Date.now() < expiresAt) {
		await sleep(authorization.interval * 1000);
		const accessToken = await pollPortalAuthorization({
			deviceCode: authorization.deviceCode,
			fetchFn,
			portalApiUrl,
		});
		if (accessToken) {
			return accessToken;
		}
	}
	throw new PortalUploadError(
		"PORTAL_AUTHORIZATION_EXPIRED",
		"Portal の認証コードが期限切れです。もう一度接続してください。"
	);
}
