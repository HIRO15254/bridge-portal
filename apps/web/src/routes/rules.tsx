import {
	defaultSystemSettings,
	type OfficialItemId,
} from "@bridge-portal/domain";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ConventionRuleSet } from "@/components/convention-rule-set";
import { ruleGuides } from "@/lib/rule-guide";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
	validateSearch: (search: Record<string, unknown>) => ({
		rule: typeof search.rule === "string" ? search.rule : undefined,
	}),
});
const labels: Record<string, string> = {
	OPENING_BIDS: "オープニングBid",
	RESPONSES_REBIDS: "ResponseとRebid",
	COMPETITIVE_DEFENSIVE: "競り合い・ディフェンスのCall",
	CARDING: "リードとSignal",
};

const alertLabels = {
	REQUIRED: "Alert対象",
	NOT_REQUIRED: "リストA固有のAlert不要",
	CONTEXTUAL: "合意と状況を確認",
} as const;

function RulesPage() {
	const rules = useQuery(trpc.rules.list.queryOptions());
	const manifest = useQuery(trpc.rules.manifest.queryOptions());
	const systems = useQuery(trpc.systems.list.queryOptions());
	const [systemSelection, setSystemSelection] = useState("default");
	const systemOptions = (systems.data ?? []).flatMap((system) => [
		...(system.draft
			? [
					{
						key: `draft:${system.id}`,
						label: `${system.name} · Draft（保存済み）`,
						snapshot: system.draft,
					},
				]
			: []),
		...system.versions.map((version) => ({
			key: `version:${version.id}`,
			label: `${system.name} · Version ${version.versionNumber}`,
			snapshot: version,
		})),
	]);
	const snapshot = systemOptions.find(
		(option) => option.key === systemSelection
	)?.snapshot;
	const search = Route.useSearch();
	const navigate = useNavigate();
	const [query, setQuery] = useState("");
	const selected = search.rule ?? "A-RR-02";
	const related = useQuery({
		...trpc.rules.relatedBoards.queryOptions({
			officialItemId: selected ?? "_",
		}),
		enabled: Boolean(selected),
	});
	const items = useMemo(
		() =>
			(rules.data ?? []).filter((rule) =>
				`${rule.title}${rule.summary}${rule.applicability}${rule.variants.join(" ")}${ruleGuides[rule.officialItemId].when}${ruleGuides[rule.officialItemId].meaning}`
					.toLowerCase()
					.includes(query.toLowerCase())
			),
		[rules.data, query]
	);
	const detail = rules.data?.find((item) => item.officialItemId === selected);
	const guide = detail ? ruleGuides[detail.officialItemId] : undefined;
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">RULE CATALOG</p>
					<h1>JCBL リストA</h1>
					<p>22項目から方式を選び、説明・条件・アクションを確認できます。</p>
				</div>
				<input
					aria-label="ルールを検索"
					className="search"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="ルールを検索…"
					value={query}
				/>
			</div>
			<label className="convention-system-picker">
				説明・注釈に使うSystem
				<select
					onChange={(event) => setSystemSelection(event.target.value)}
					value={systemSelection}
				>
					<option value="default">初期設定の例（未保存）</option>
					{systemOptions.map((option) => (
						<option key={option.key} value={option.key}>
							{option.label}
						</option>
					))}
				</select>
				<Link to="/systems">My Systemで方式・共通定義を編集 →</Link>
			</label>
			<p className="rule-catalog-note">
				ここに表示するのはリストAの枠組みです。点数レンジ・応答ステップなど、ペアごとに変わる意味はMy
				Systemでの合意が必要です。
				<br />
				Auction表記：1NT–2♣は1NTの後にパートナーが2♣。XはDouble、XXはRedouble、括弧内は相手のCallです。
			</p>
			<div className="rules-layout">
				<section className="rule-list">
					<details className="panel rule-glossary">
						<summary>用語・Full Disclosure・Alertについて</summary>
						<p>{manifest.data?.fullDisclosure}</p>
						{manifest.data && (
							<ul>
								{Object.entries(manifest.data.glossary).map(
									([term, definition]) => (
										<li key={term}>
											<strong>{term}:</strong> {definition}
										</li>
									)
								)}
							</ul>
						)}
						<small>{manifest.data?.alertPolicy}</small>
					</details>
					{Object.entries(labels).map(([category, label]) => (
						<div key={category}>
							<h2 className="rule-category-heading">{label}</h2>
							{items
								.filter((item) => item.category === category)
								.map((item) => (
									<button
										aria-pressed={selected === item.officialItemId}
										className={
											selected === item.officialItemId
												? "rule-row selected"
												: "rule-row"
										}
										key={item.officialItemId}
										onClick={async () => {
											await navigate({
												to: "/rules",
												search: { rule: item.officialItemId },
											});
											if (window.matchMedia("(max-width: 950px)").matches) {
												document
													.getElementById("rule-detail")
													?.scrollIntoView();
											}
										}}
										type="button"
									>
										<span>{item.officialItemId}</span>
										<div>
											<strong>{item.title}</strong>
											<p>
												<b>使う局面</b> {ruleGuides[item.officialItemId].when}
											</p>
											<p>
												<b>示す意味</b>{" "}
												{ruleGuides[item.officialItemId].meaning}
											</p>
										</div>
										<b>→</b>
									</button>
								))}
						</div>
					))}
					{rules.isSuccess && items.length === 0 && (
						<p className="rule-no-results">
							該当するルールがありません。検索語を変えてください。
						</p>
					)}
				</section>
				<aside className="rule-detail" id="rule-detail">
					{detail && guide ? (
						<>
							<p className="eyebrow">{detail.officialItemId}</p>
							<h2>{detail.title}</h2>
							<span
								className={`pill ${detail.alert === "REQUIRED" ? "warn" : ""}`}
							>
								{alertLabels[detail.alert]}
							</span>
							<p className="rule-detail-summary">{detail.summary}</p>
							<ConventionRuleSet
								adopted={
									!snapshot ||
									snapshot.adoptedOfficialItemIds.includes(
										detail.officialItemId
									)
								}
								key={`${selected}:${systemSelection}`}
								officialItemId={detail.officialItemId as OfficialItemId}
								selectedVariants={
									snapshot
										? (snapshot.selectedVariants[detail.officialItemId] ?? [])
										: undefined
								}
								settings={snapshot?.settings ?? defaultSystemSettings}
							/>
							<details className="rule-source-condition">
								<summary>背景・継続・方式の補足</summary>
								<div className="rule-guide-grid">
									<section>
										<h3>① いつ使うか</h3>
										<p>{guide.when}</p>
									</section>
									<section>
										<h3>② 何を示すか</h3>
										<p>{guide.meaning}</p>
									</section>
									<section>
										<h3>③ 次のCall・Play</h3>
										<p>{guide.continuation}</p>
									</section>
									<section>
										<h3>④ 境界と注意</h3>
										<p>{guide.check}</p>
									</section>
								</div>
								<h3>方式・Variantごとの意味</h3>
								<ul className="rule-variant-list">
									{detail.variants.map((variant) => (
										<li key={variant}>
											<strong>{variant}</strong>
											<span>{guide.variantNotes[variant]}</span>
										</li>
									))}
								</ul>
							</details>
							<h3>{detail.exampleKind === "PLAY" ? "Play例" : "Auction例"}</h3>
							<p>{detail.example}</p>
							<h3>My Systemで決める項目</h3>
							<ul>
								{detail.configuration.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
							<details className="rule-source-condition">
								<summary>収録された適用条件を読む</summary>
								<p>{detail.applicability}</p>
							</details>
							<h3>関連ハンド</h3>
							<div className="related-boards">
								{related.data?.map((board) => (
									<Link
										key={board.boardId}
										params={{ boardId: board.boardId }}
										to="/boards/$boardId"
									>
										<strong>
											{board.tournamentName} · Board {board.boardNumber}
										</strong>
										<span>{board.verdict}</span>
									</Link>
								))}
								{related.data?.length === 0 && (
									<p>評価済みハンドはまだありません。</p>
								)}
							</div>
							<a href={detail.officialUrl} rel="noreferrer" target="_blank">
								公式資料（施行日 {detail.effectiveDate}）を確認 ↗
							</a>
						</>
					) : (
						<div className="empty">
							<strong>ルールを選択</strong>
							<p>項目を選ぶと解説と設定条件が表示されます。</p>
						</div>
					)}
				</aside>
			</div>
		</main>
	);
}
