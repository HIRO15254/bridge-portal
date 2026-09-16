#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import {
	authorizePortal,
	uploadPortalJson,
} from "../assets/chrome-extension/lib/portal.js";

const acceptedFormats = new Set([
	"FUNBRIDGE_EXPORT",
	"FUNBRIDGE_HISTORY_INDEX",
]);
const productionPortalApiUrl =
	"https://bridge-portal-api.hiro15254.workers.dev";

function usage() {
	console.error("Usage: node upload-to-portal.mjs <file-or-directory>");
}

async function collectJsonFiles(target) {
	const stat = await fs.stat(target);
	if (stat.isFile()) {
		return [target];
	}
	const entries = await fs.readdir(target, { withFileTypes: true });
	const nested = await Promise.all(
		entries
			.sort((left, right) => left.name.localeCompare(right.name))
			.map((entry) => {
				const child = path.join(target, entry.name);
				if (entry.isDirectory()) {
					return collectJsonFiles(child);
				}
				return entry.isFile() && entry.name.endsWith(".json") ? [child] : [];
			})
	);
	return nested.flat();
}

async function readExport(file) {
	let data;
	try {
		data = JSON.parse(await fs.readFile(file, "utf8"));
	} catch (error) {
		throw new Error(`${file}: JSONを読み取れません: ${error.message}`);
	}
	if (!acceptedFormats.has(data?.format)) {
		throw new Error(
			`${file}: FUNBRIDGE_EXPORT または FUNBRIDGE_HISTORY_INDEX ではありません。`
		);
	}
	return data;
}

const target = process.argv[2];
if (!target) {
	usage();
	process.exit(2);
}

let files;
try {
	files = await collectJsonFiles(path.resolve(target));
} catch (error) {
	console.error(`入力ファイルを確認できません: ${error.message}`);
	process.exit(2);
}
if (files.length === 0) {
	console.error("投入対象の JSON がありません。");
	process.exit(2);
}

let duplicates = 0;
let uploaded = 0;
console.log("Bridge Portal への接続を開始します。");
const accessToken = await authorizePortal({
	onStart: ({ userCode, verificationUriComplete }) => {
		console.log(`ブラウザで開く: ${verificationUriComplete}`);
		console.log(`表示されたコード: ${userCode}`);
		console.log(
			"Portalへログインして、この端末からの履歴投入を承認してください。"
		);
	},
	portalApiUrl: productionPortalApiUrl,
});
console.log("Portalへの接続が承認されました。投入を開始します。");
for (const file of files) {
	try {
		const result = await uploadPortalJson({
			accessToken,
			data: await readExport(file),
			portalApiUrl: productionPortalApiUrl,
		});
		if (result.duplicate) {
			duplicates += 1;
			console.log(`重複のためスキップ: ${file}`);
		} else {
			uploaded += 1;
			console.log(`投入完了: ${file}`);
		}
	} catch (error) {
		console.error(`${file}: ${error.message}`);
		process.exitCode = 1;
	}
}

if (process.exitCode) {
	console.error(
		"一部の投入に失敗しました。失敗したファイルだけを再実行できます。"
	);
} else {
	console.log(`投入完了: ${uploaded}件、新規。重複: ${duplicates}件。`);
}
