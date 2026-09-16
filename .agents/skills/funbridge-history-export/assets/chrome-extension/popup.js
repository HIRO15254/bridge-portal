const elements = {
	accountId: document.querySelector("#account-id"),
	connect: document.querySelector("#connect"),
	disconnect: document.querySelector("#disconnect"),
	export: document.querySelector("#export"),
	portalToken: document.querySelector("#portal-token"),
	progress: document.querySelector("#progress"),
	statusDetail: document.querySelector("#status-detail"),
	statusDot: document.querySelector("#status-dot"),
	statusTitle: document.querySelector("#status-title"),
};
const chromeApi = globalThis.chrome;
let lastState;

function statusClass(state, busy, ready) {
	if (state.phase === "ERROR") {
		return "error";
	}
	if (busy) {
		return "busy";
	}
	return ready ? "ready" : "idle";
}

function render(state) {
	lastState = state;
	const connected = state.connected === true;
	const busy = state.phase === "EXPORTING" || state.phase === "UPLOADING";
	const ready = connected && state.authObserved;
	elements.statusTitle.textContent = state.title;
	elements.statusDetail.textContent = state.detail;
	elements.statusDot.className = `dot ${statusClass(state, busy, ready)}`;
	elements.connect.disabled = connected;
	elements.disconnect.disabled = !connected || busy;
	elements.export.disabled = !ready || busy;
	elements.upload.disabled =
		!ready || busy || !elements.portalToken.value.trim();
	elements.accountId.disabled = busy;
	if (busy && state.progress) {
		elements.progress.hidden = false;
		elements.progress.max = state.progress.total || 1;
		elements.progress.value = state.progress.current || 0;
	} else {
		elements.progress.hidden = true;
	}
}

async function send(message) {
	const response = await chromeApi.runtime.sendMessage(message);
	if (!response?.ok) {
		throw new Error(response?.error || "拡張機能との通信に失敗しました。");
	}
	render(response.state);
}

elements.connect.addEventListener("click", async () => {
	try {
		await send({ type: "CONNECT" });
	} catch (error) {
		render({ phase: "ERROR", title: "接続できません", detail: error.message });
	}
});

elements.disconnect.addEventListener("click", async () => {
	try {
		await send({ type: "DISCONNECT" });
	} catch (error) {
		render({ phase: "ERROR", title: "解除できません", detail: error.message });
	}
});

elements.export.addEventListener("click", async () => {
	try {
		await send({ type: "EXPORT", accountId: elements.accountId.value.trim() });
	} catch (error) {
		render({
			phase: "ERROR",
			title: "取得を開始できません",
			detail: error.message,
		});
	}
});

elements.upload.addEventListener("click", async () => {
	try {
		await send({
			accessToken: elements.portalToken.value.trim(),
			accountId: elements.accountId.value.trim(),
			type: "EXPORT_PORTAL",
		});
	} catch (error) {
		render({
			phase: "ERROR",
			title: "Portal投入を開始できません",
			detail: error.message,
		});
	}
});

elements.portalToken.addEventListener("input", () => {
	if (lastState) {
		render(lastState);
	}
});

chromeApi.runtime.onMessage.addListener((message) => {
	if (message.type === "STATE") {
		render(message.state);
	}
});

send({ type: "GET_STATE" }).catch((error) => {
	render({
		phase: "ERROR",
		title: "状態を取得できません",
		detail: error.message,
	});
});
