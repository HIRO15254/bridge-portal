import {
	type ConventionCondition,
	conventionSources,
	conventionTerms,
	describeConventionTerm,
	getConventionRules,
	getRule,
	isNaturalNtShape,
	type OfficialItemId,
	type SystemSettings,
} from "@bridge-portal/domain";
import { useId, useState } from "react";

export function ConventionRuleSet({
	officialItemId,
	settings,
	selectedVariants,
	adopted = true,
}: {
	officialItemId: OfficialItemId;
	settings: SystemSettings;
	selectedVariants?: readonly string[];
	adopted?: boolean;
}) {
	const anchor = useId();
	const [variant, setVariant] = useState("*");
	const source = conventionSources[officialItemId];
	const allRows = getConventionRules(officialItemId, settings);
	const rows = allRows.filter((row) =>
		variant === "*"
			? !selectedVariants || selectedVariants.includes(row.variant)
			: row.variant === variant
	);
	const variants = getRule(officialItemId)?.variants ?? [];
	const parameters = new Map(
		rows.flatMap((row) =>
			row.when.all.flatMap((condition) =>
				condition.kind === "compare" && condition.settingRef
					? [[condition.settingRef, condition.value] as const]
					: []
			)
		)
	);
	const hasBalanced =
		officialItemId === "A-OB-01" ||
		rows.some((row) =>
			row.when.all.some((condition) => condition.kind === "term")
		);
	return (
		<section
			aria-label="条件とアクションのルールセット"
			className="convention-rule-set"
		>
			<dl className="convention-source-map">
				<dt>JCBLの対応欄</dt>
				<dd>
					{source.jcbl}{" "}
					<a href={source.jcblUrl} rel="noreferrer" target="_blank">
						記入解説 ↗
					</a>
				</dd>
				<dt>Funbridge</dt>
				<dd>
					{source.funbridge}{" "}
					<a href={source.funbridgeUrl} rel="noreferrer" target="_blank">
						出典 ↗
					</a>
				</dd>
			</dl>
			<p className="convention-caption">
				JCBL欄はカードの記載先との対応です。アプリの設定例とFunbridgeの内部判定は同一とは限りません。
			</p>
			<label className="convention-variant-picker">
				表示する方式
				<select
					onChange={(event) => setVariant(event.target.value)}
					value={variant}
				>
					<option value="*">
						{selectedVariants ? "採用中の方式" : "すべての方式"}
					</option>
					{variants.map((name) => (
						<option key={name} value={name}>
							{name}
							{selectedVariants?.includes(name) ? "（採用）" : ""}
						</option>
					))}
				</select>
			</label>
			{!adopted && (
				<p className="notice">
					この項目は選択したSystemでは未採用です。以下は比較用の説明です。
				</p>
			)}
			{variant !== "*" &&
				selectedVariants &&
				!selectedVariants.includes(variant) && (
					<p className="notice">
						この方式は未採用です。採用する場合はMy
						SystemのDraftで選択して保存してください。
					</p>
				)}
			{rows.length === 0 ? (
				<p>採用している方式がありません。方式を選ぶと条件を確認できます。</p>
			) : (
				<>
					<h3>自然言語での説明</h3>
					<ol className="convention-explanations">
						{rows.map((row) => (
							<li key={row.id}>
								<strong>{row.title}</strong>
								<p>{row.explanation}</p>
							</li>
						))}
					</ol>
					<h3>プログラム的なルール</h3>
					<p className="convention-caption">
						各行の条件はすべて満たす必要があります。「候補」は他の採用規則との比較が必要です。情報不足は判定保留として扱います。
					</p>
					<div className="convention-table-wrap">
						<table className="convention-table">
							<thead>
								<tr>
									<th scope="col">適用条件（AND）</th>
									<th scope="col">アクションと示す意味</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((row, index) => (
									<tr key={row.id}>
										<td>
											<strong>
												ルール {index + 1} · {row.title}
											</strong>
											<ul>
												{row.when.all.map((condition) => (
													<li key={JSON.stringify(condition)}>
														<Condition anchor={anchor} condition={condition} />
													</li>
												))}
											</ul>
										</td>
										<td>
											<span className="pill">
												{
													{
														CANDIDATE: "候補",
														REQUIRED: "指定応答・手順",
														VALIDATION: "設定検査",
													}[row.selection]
												}
											</span>
											<p>
												<code>
													{row.action.type} {row.action.value}
												</code>
											</p>
											<p>{row.meaning}</p>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
			{hasBalanced && (
				<p
					aria-live="polite"
					className="convention-definition"
					id={`${anchor}-balanced`}
				>
					<strong>注1 バランスハンド：</strong>
					{describeConventionTerm("balanced", settings)}。<br />
					<small>参照元：{conventionTerms.balanced.settingLabel}</small>
				</p>
			)}
			{parameters.size > 0 && (
				<details className="convention-parameters">
					<summary>条件が参照している設定値</summary>
					<ul>
						{[...parameters].map(([path, value]) => (
							<li key={path}>
								<code>{path}</code>：{value}
							</li>
						))}
					</ul>
				</details>
			)}
			{officialItemId === "A-OB-01" && (
				<NaturalNtSample
					adopted={
						adopted &&
						(!selectedVariants || selectedVariants.includes("Natural 1NT"))
					}
					settings={settings}
				/>
			)}
			<details>
				<summary>ルールデータを表示</summary>
				<pre className="convention-json">{JSON.stringify(rows, null, 2)}</pre>
			</details>
		</section>
	);
}

function Condition({
	condition,
	anchor,
}: {
	condition: ConventionCondition;
	anchor: string;
}) {
	if (condition.kind === "term") {
		return (
			<>
				{conventionTerms[condition.term].label}{" "}
				<a aria-describedby={`${anchor}-balanced`} href={`#${anchor}-balanced`}>
					[注1]
				</a>
			</>
		);
	}
	if (condition.kind === "context") {
		return <>{condition.label}</>;
	}
	return (
		<>
			{condition.label} {condition.operator} {condition.value}
			{condition.settingRef && (
				<span className="convention-setting-ref">（設定値）</span>
			)}
		</>
	);
}

function NaturalNtSample({
	settings,
	adopted,
}: {
	settings: SystemSettings;
	adopted: boolean;
}) {
	const [hcp, setHcp] = useState(16);
	const [shape, setShape] = useState("4432");
	const [unopened, setUnopened] = useState(true);
	const hands: Record<string, string> = {
		"4333": "AKQJ.K32.432.432",
		"4432": "AKQJ.K432.432.32",
		"5332": "AKQJ2.K32.432.32",
		"5422": "AKQJ2.K432.32.32",
	};
	const hand = hands[shape] ?? "";
	const reasons = [
		...(adopted ? [] : ["Natural 1NTが未採用"]),
		...(unopened ? [] : ["オープン前・手番の条件外"]),
		...(hcp < settings.opening.oneNtMinHcp || hcp > settings.opening.oneNtMaxHcp
			? ["HCPが設定レンジ外"]
			: []),
		...(isNaturalNtShape(
			hand,
			settings,
			settings.opening.allowSingletonTopHonor
		)
			? []
			: ["全体設定のバランスハンドに該当しない"]),
		...(!settings.opening.oneNtFiveCardMajor &&
		hand
			.split(".")
			.slice(0, 2)
			.some((suit) => suit.length >= 5)
			? ["5枚メジャーでの1NTを採用していない"]
			: []),
	];
	return (
		<section aria-label="1NT条件のサンプル判定" className="convention-sample">
			<h3>1NTの条件を試す</h3>
			<div className="settings-grid">
				<label>
					サンプルHCP
					<input
						max={37}
						min={0}
						onChange={(event) => setHcp(Number(event.target.value))}
						type="number"
						value={hcp}
					/>
				</label>
				<label>
					手の形
					<select
						onChange={(event) => setShape(event.target.value)}
						value={shape}
					>
						{Object.keys(hands).map((value) => (
							<option key={value} value={value}>
								{value}
								{value.startsWith("5") ? "（5枚メジャー）" : ""}
							</option>
						))}
					</select>
				</label>
				<label>
					<input
						checked={unopened}
						onChange={(event) => setUnopened(event.target.checked)}
						type="checkbox"
					/>
					自分の番・まだ誰もオープンしていない
				</label>
			</div>
			<p aria-live="polite" className="notice">
				{reasons.length
					? `適用外：${reasons.join(" ／ ")}。他の規則を確認します。`
					: "適用：bid 1NT。1NTの条件が成立しています。"}
			</p>
		</section>
	);
}
