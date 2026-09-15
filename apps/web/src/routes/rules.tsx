import { defaultSystemSettings } from "@bridge-portal/domain";
import {
	IconBook2,
	IconChevronDown,
	IconSearch,
	IconStack2,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ConventionRuleSet } from "@/components/convention-rule-set";
import {
	getConventionTopics,
	resolveConventionTopic,
} from "@/lib/convention-topics";
import { ruleGuides } from "@/lib/rule-guide";
import { trpc, type trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
	validateSearch: (
		search: Record<string, unknown>
	): { rule?: string; topic?: string } => ({
		rule: typeof search.rule === "string" ? search.rule : undefined,
		topic: typeof search.topic === "string" ? search.topic : undefined,
	}),
});
const labels: Record<string, string> = {
	OPENING_BIDS: "オープニング",
	RESPONSES_REBIDS: "レスポンス・リビッド",
	COMPETITIVE_DEFENSIVE: "競り合い・ディフェンス",
	CARDING: "カーディング",
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
	const [query, setQuery] = useState("");
	const search = Route.useSearch();
	const navigate = useNavigate();
	const selected = search.rule ?? "A-OB-01";
	const detail = rules.data?.find((item) => item.officialItemId === selected);
	const topic = resolveConventionTopic(
		detail?.officialItemId ?? "A-OB-01",
		search.topic
	);
	const systemOptions = getSystemOptions(systems.data ?? []);
	const snapshot = systemOptions.find(
		(option) => option.key === systemSelection
	)?.snapshot;
	const related = useQuery({
		...trpc.rules.relatedBoards.queryOptions({ officialItemId: selected }),
		enabled: Boolean(detail),
	});
	const items = (rules.data ?? [])
		.map((item) => ({
			...item,
			topics: getConventionTopics(item.officialItemId).filter((entry) =>
				`${entry.title} ${entry.variant} ${item.title} ${item.officialItemId}`
					.toLowerCase()
					.includes(query.toLowerCase())
			),
		}))
		.filter((item) => item.topics.length > 0);
	const guide = detail ? ruleGuides[detail.officialItemId] : undefined;
	return (
		<main className="rules-page">
			<div className="rules-page-heading">
				<h1>
					Rules <span>JCBL リストA · 22分類</span>
				</h1>
				<label className="convention-system-picker">
					<IconStack2 aria-hidden="true" size={16} />
					<span className="sr-only">説明・注釈に使うSystem</span>
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
				</label>
			</div>
			{rules.isError && (
				<p className="error" role="alert">
					ルールを読み込めませんでした。ページを再読み込みしてください。
				</p>
			)}
			<div className="rules-layout">
				<section aria-label="ルール一覧" className="rule-list">
					<label className="catalog-search">
						<IconSearch aria-hidden="true" size={16} />
						<input
							aria-label="ルールを検索"
							onChange={(event) => setQuery(event.target.value)}
							placeholder="ルールを検索…"
							value={query}
						/>
					</label>
					{Object.entries(labels).map(([category, label]) => {
						const group = items.filter((item) => item.category === category);
						return (
							group.length > 0 && (
								<div key={category}>
									<h2 className="rule-category-heading">{label}</h2>
									{group.map((item) => (
										<details
											className="catalog-group"
											key={`${item.officialItemId}:${query}`}
											open={item.officialItemId === selected || Boolean(query)}
										>
											<summary>
												<IconChevronDown aria-hidden="true" size={14} />
												{item.title}
												<small>{item.topics.length}</small>
											</summary>
											<div className="catalog-topics">
												{item.topics.map((entry) => (
													<button
														aria-pressed={
															selected === item.officialItemId &&
															topic?.key === entry.key
														}
														className="rule-row"
														key={entry.key}
														onClick={async () => {
															await navigate({
																to: "/rules",
																search: {
																	rule: item.officialItemId,
																	topic: entry.key,
																},
															});
															if (
																window.matchMedia("(max-width: 760px)").matches
															) {
																document
																	.getElementById("rule-detail")
																	?.scrollIntoView({ block: "start" });
															}
														}}
														type="button"
													>
														<strong>{entry.title}</strong>
													</button>
												))}
											</div>
										</details>
									))}
								</div>
							)
						);
					})}
					{rules.isPending && <p className="catalog-empty">読み込み中…</p>}
					{rules.isSuccess && items.length === 0 && (
						<p className="catalog-empty">該当する項目がありません。</p>
					)}
				</section>
				<article
					className="rule-detail"
					id="rule-detail"
					key={`${selected}:${topic?.key}`}
				>
					{detail && topic && guide ? (
						<>
							<div className="rule-detail-meta">
								<IconBook2 aria-hidden="true" size={15} />
								<span>{detail.officialItemId}</span>
								<span>{alertLabels[detail.alert]}</span>
							</div>
							<h2>{topic.title}</h2>
							<p className="rule-breadcrumb">
								{labels[detail.category]} / {detail.title}
							</p>
							<SnapshotConvention
								key={`${selected}:${topic.key}:${systemSelection}`}
								officialItemId={detail.officialItemId}
								snapshot={snapshot}
								topic={topic}
							/>
							<div className="rule-detail-footer">
								<span>条件・注釈は選択中のSystemを参照</span>
								<Link to="/systems">My Systemで編集 →</Link>
							</div>
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
								<p>{guide.variantNotes[topic.variant]}</p>
								<h3>
									{detail.exampleKind === "PLAY" ? "Play例" : "Auction例"}
									（分類全体）
								</h3>
								<p>{detail.example}</p>
								<h3>My Systemで決める項目</h3>
								<ul>
									{detail.configuration.map((item) => (
										<li key={item}>{item}</li>
									))}
								</ul>
								<p>{detail.applicability}</p>
								<a href={detail.officialUrl} rel="noreferrer" target="_blank">
									公式資料（施行日 {detail.effectiveDate}） ↗
								</a>
							</details>
							<details className="rule-source-condition">
								<summary>用語・Full Disclosure・Alertについて</summary>
								<p>{manifest.data?.fullDisclosure}</p>
								<ul>
									{Object.entries(manifest.data?.glossary ?? {}).map(
										([term, definition]) => (
											<li key={term}>
												<strong>{term}:</strong> {definition}
											</li>
										)
									)}
								</ul>
								<p>{manifest.data?.alertPolicy}</p>
								<p>
									Auction表記：XはDouble、XXはRedouble、括弧内は相手のCallです。
								</p>
							</details>
							<RelatedHands boards={related.data ?? []} />
						</>
					) : (
						<div className="empty">
							<strong>{rules.isPending ? "読み込み中" : "ルールを選択"}</strong>
							<p>左の一覧から項目を選択してください。</p>
						</div>
					)}
				</article>
			</div>
		</main>
	);
}

function getSystemOptions(
	systems: Awaited<ReturnType<typeof trpcClient.systems.list.query>>
) {
	return systems.flatMap((system) => [
		...(system.draft
			? [
					{
						key: `draft:${system.id}`,
						label: `${system.name} · Draft`,
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
}

function RelatedHands({
	boards,
}: {
	boards: Awaited<ReturnType<typeof trpcClient.rules.relatedBoards.query>>;
}) {
	return (
		<section className="rule-related">
			<h3>
				関連ハンド <small>JCBL分類単位</small>
			</h3>
			<div className="related-boards">
				{boards?.map((board) => (
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
				{boards?.length === 0 && <p>評価済みハンドはまだありません。</p>}
			</div>
		</section>
	);
}

function SnapshotConvention({
	officialItemId,
	snapshot,
	topic,
}: {
	officialItemId: import("@bridge-portal/domain").OfficialItemId;
	snapshot?: ReturnType<typeof getSystemOptions>[number]["snapshot"];
	topic: import("@/lib/convention-topics").ConventionTopic;
}) {
	return (
		<ConventionRuleSet
			adopted={
				!snapshot || snapshot.adoptedOfficialItemIds.includes(officialItemId)
			}
			officialItemId={officialItemId}
			selectedVariants={
				snapshot ? (snapshot.selectedVariants[officialItemId] ?? []) : undefined
			}
			settings={snapshot?.settings ?? defaultSystemSettings}
			topic={topic}
		/>
	);
}
