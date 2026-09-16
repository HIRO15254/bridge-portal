import { exportAllHistory } from "./lib/exporter.js";
import { authorizePortal, uploadPortalJson } from "./lib/portal.js";
import {
	authorizationFrom,
	parseApiUrl,
	parsePostData,
	runtimeFetchExpression,
	unwrapApiResult,
} from "./lib/protocol.js";

const protocolVersion = "1.3";
const productionPortalApiUrl =
	"https://bridge-portal-api.hiro15254.workers.dev";
const funbridgePagePattern = /^https:\/\/([^.]+\.)?funbridge\.com\//;
const chromeApi = globalThis.chrome;

let session;
let portalAccessToken;
let state = {
	authObserved: false,
	connected: false,
	detail: "Funbridgeのタブを開いて「検出を開始」を押してください。",
	phase: "IDLE",
	portalAuthorized: false,
	title: "未接続",
};

function publicState() {
	return structuredClone(state);
}

function publish(patch) {
	state = { ...state, ...patch };
	chromeApi.runtime
		.sendMessage({ state: publicState(), type: "STATE" })
		.catch(() => {
			// The popup is normally closed while the service worker is exporting.
		});
}

async function activeFunbridgeTab() {
	const [tab] = await chromeApi.tabs.query({
		active: true,
		currentWindow: true,
	});
	if (!(tab?.id && funbridgePagePattern.test(tab.url ?? ""))) {
		throw new Error(
			"ログイン済みのFunbridgeタブを開いてから実行してください。"
		);
	}
	return tab;
}

async function disconnect() {
	const current = session;
	session = undefined;
	portalAccessToken = undefined;
	if (current) {
		try {
			await chromeApi.debugger.detach(current.debuggee);
		} catch {
			// The tab may already be closed or detached.
		}
	}
	publish({
		authObserved: false,
		connected: false,
		detail: "Funbridgeのタブを開いて「検出を開始」を押してください。",
		phase: "IDLE",
		portalAuthorized: false,
		progress: undefined,
		title: "未接続",
	});
}

async function connect() {
	if (session) {
		return publicState();
	}
	const tab = await activeFunbridgeTab();
	const debuggee = { tabId: tab.id };
	await chromeApi.debugger.attach(debuggee, protocolVersion);
	try {
		await chromeApi.debugger.sendCommand(debuggee, "Network.enable");
		await chromeApi.debugger.sendCommand(debuggee, "Runtime.enable");
	} catch (error) {
		await chromeApi.debugger.detach(debuggee).catch(() => {
			// Preserve the original setup error if Chrome already detached the tab.
		});
		throw error;
	}
	session = {
		debuggee,
		pendingRequests: new Map(),
		tabId: tab.id,
		templates: {},
	};
	publish({
		authObserved: false,
		connected: true,
		detail:
			"Funbridge内で履歴や大会結果を1回開いてください。API認証をメモリー内だけで検出します。",
		phase: "MONITORING",
		title: "APIリクエストを待機中",
	});
	return publicState();
}

function observeAuthorization(current, parsed, headers) {
	const authorization = authorizationFrom(headers);
	if (!authorization) {
		return;
	}
	current.authorization = authorization;
	current.apiRoot = parsed.root;
	publish({
		authObserved: true,
		detail: "認証済みAPIを検出しました。全履歴を取得できます。",
		phase: "READY",
		title: "取得準備完了",
	});
}

chromeApi.debugger.onEvent.addListener((source, method, params) => {
	const current = session;
	if (!current || source.tabId !== current.tabId) {
		return;
	}
	if (method === "Network.requestWillBeSent") {
		const parsed = parseApiUrl(params.request?.url);
		if (!parsed) {
			return;
		}
		const body = parsePostData(params.request?.postData);
		current.pendingRequests.set(params.requestId, parsed);
		current.templates[parsed.endpoint] = { body, url: params.request.url };
		observeAuthorization(current, parsed, params.request?.headers);
		return;
	}
	if (method === "Network.requestWillBeSentExtraInfo") {
		const parsed = current.pendingRequests.get(params.requestId);
		if (parsed) {
			observeAuthorization(current, parsed, params.headers);
		}
	}
});

chromeApi.debugger.onDetach.addListener((source) => {
	if (!session || source.tabId !== session.tabId) {
		return;
	}
	session = undefined;
	portalAccessToken = undefined;
	publish({
		authObserved: false,
		connected: false,
		detail:
			"ブラウザーとの接続が解除されました。必要なら再度検出してください。",
		phase: "IDLE",
		portalAuthorized: false,
		progress: undefined,
		title: "接続解除",
	});
});

async function apiPost(endpoint, body) {
	const current = session;
	if (!(current?.authorization && current.apiRoot)) {
		throw new Error("認証済みAPIが検出されていません。");
	}
	const expression = runtimeFetchExpression(
		current.apiRoot,
		endpoint,
		current.authorization,
		body
	);
	const result = await chromeApi.debugger.sendCommand(
		current.debuggee,
		"Runtime.evaluate",
		{
			awaitPromise: true,
			expression,
			returnByValue: true,
		}
	);
	return unwrapApiResult(result, endpoint);
}

async function downloadJson(path, data) {
	const json = `${JSON.stringify(data, null, 2)}\n`;
	const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
	await chromeApi.downloads.download({
		conflictAction: "overwrite",
		filename: path,
		saveAs: false,
		url,
	});
}

function collectExport(accountId) {
	const current = session;
	if (!(current?.authorization && current.apiRoot)) {
		throw new Error("認証済みAPIが検出されていません。");
	}
	publish({
		detail: "BP Circuit・Series・Dailyの履歴を取得しています。",
		phase: "EXPORTING",
		progress: { current: 0, total: 1 },
		title: "全履歴を取得中",
	});
	return exportAllHistory({
		accountId,
		onProgress(progress) {
			publish({ detail: progress.detail, progress });
		},
		post: apiPost,
		templates: current.templates,
	});
}

async function startExport(accountId) {
	try {
		const result = await collectExport(accountId);
		publish({
			detail: `${result.files.length}ファイルをダウンロードしています。`,
			progress: { current: 0, total: result.files.length },
		});
		for (const [index, file] of result.files.entries()) {
			await downloadJson(file.path, file.data);
			publish({
				detail: `${index + 1}/${result.files.length}ファイルを保存しました。`,
				progress: { current: index + 1, total: result.files.length },
			});
		}
		publish({
			detail: `${result.summary.tournamentFileCount}大会・${result.summary.boardCount}ボードを保存しました。取得不能: ${result.summary.skipped.length}件。接続解除で認証情報を破棄できます。`,
			phase: "READY",
			progress: undefined,
			title: "取得完了",
		});
	} catch (error) {
		publish({
			detail: error instanceof Error ? error.message : String(error),
			phase: "ERROR",
			progress: undefined,
			title: "取得に失敗しました",
		});
	}
}

async function startPortalExport(accountId, accessToken) {
	try {
		const result = await collectExport(accountId);
		publish({
			detail: `${result.files.length}ファイルをPortalへ投入しています。`,
			phase: "UPLOADING",
			progress: { current: 0, total: result.files.length },
			title: "Portalへ投入中",
		});
		let duplicates = 0;
		for (const [index, file] of result.files.entries()) {
			const uploaded = await uploadPortalJson({
				accessToken,
				data: file.data,
				portalApiUrl: productionPortalApiUrl,
			});
			if (uploaded.duplicate) {
				duplicates += 1;
			}
			publish({
				detail: `${index + 1}/${result.files.length}ファイルをPortalへ投入しました。`,
				progress: { current: index + 1, total: result.files.length },
			});
		}
		publish({
			detail: `${result.summary.tournamentFileCount}大会・${result.summary.boardCount}ボードをPortalへ投入しました。重複: ${duplicates}件。取得不能: ${result.summary.skipped.length}件。`,
			phase: "READY",
			progress: undefined,
			title: "Portal投入完了",
		});
	} catch (error) {
		publish({
			detail: error instanceof Error ? error.message : String(error),
			phase: "ERROR",
			progress: undefined,
			title: "Portal投入に失敗しました",
		});
	}
}

async function authorizePortalForExtension() {
	try {
		portalAccessToken = undefined;
		publish({
			detail: "ブラウザでPortalへログインし、この端末を承認してください。",
			phase: "PORTAL_AUTHORIZING",
			portalAuthorized: false,
			title: "Portal認証を待機中",
		});
		portalAccessToken = await authorizePortal({
			onStart: async ({ userCode, verificationUriComplete }) => {
				await chromeApi.tabs.create({ url: verificationUriComplete });
				publish({
					detail: `Portal画面でコード ${userCode} を承認してください。`,
				});
			},
			portalApiUrl: productionPortalApiUrl,
		});
		publish({
			detail: "Portalへの接続が承認されました。全履歴を投入できます。",
			phase: "READY",
			portalAuthorized: true,
			title: "Portal投入準備完了",
		});
	} catch (error) {
		portalAccessToken = undefined;
		publish({
			detail: error instanceof Error ? error.message : String(error),
			phase: "ERROR",
			portalAuthorized: false,
			title: "Portal認証に失敗しました",
		});
	}
}

chromeApi.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message.type === "GET_STATE") {
		sendResponse({ ok: true, state: publicState() });
		return false;
	}
	if (message.type === "AUTHORIZE_PORTAL") {
		if (state.phase === "PORTAL_AUTHORIZING") {
			sendResponse({ error: "Portal認証を待機中です。", ok: false });
			return false;
		}
		authorizePortalForExtension();
		sendResponse({ ok: true, state: publicState() });
		return false;
	}
	if (message.type === "EXPORT" || message.type === "EXPORT_PORTAL") {
		if (
			state.phase === "EXPORTING" ||
			state.phase === "UPLOADING" ||
			state.phase === "PORTAL_AUTHORIZING"
		) {
			sendResponse({
				error: "すでに取得中です。",
				ok: false,
				state: publicState(),
			});
			return false;
		}
		const start =
			message.type === "EXPORT_PORTAL"
				? () => {
						if (!portalAccessToken) {
							throw new Error("先にPortalへの接続を完了してください。");
						}
						return startPortalExport(message.accountId, portalAccessToken);
					}
				: () => startExport(message.accountId);
		start().catch((error) => {
			publish({
				detail: error instanceof Error ? error.message : String(error),
				phase: "ERROR",
				title: "取得に失敗しました",
			});
		});
		sendResponse({ ok: true, state: publicState() });
		return false;
	}
	const actions = { CONNECT: connect, DISCONNECT: disconnect };
	const action = actions[message.type];
	if (!action) {
		sendResponse({
			error: "不明な操作です。",
			ok: false,
			state: publicState(),
		});
		return false;
	}
	action()
		.then((nextState) =>
			sendResponse({ ok: true, state: nextState ?? publicState() })
		)
		.catch((error) => {
			publish({
				connected: Boolean(session),
				detail: error instanceof Error ? error.message : String(error),
				phase: "ERROR",
				title: "操作に失敗しました",
			});
			sendResponse({ error: state.detail, ok: false, state: publicState() });
		});
	return true;
});
