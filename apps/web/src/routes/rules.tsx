import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/rules")({
	component: RulesPage,
	validateSearch: (search: Record<string, unknown>) => ({
		rule: typeof search.rule === "string" ? search.rule : undefined,
	}),
});
const labels: Record<string, string> = {
	OPENING_BIDS: "Opening bids",
	RESPONSES_REBIDS: "Responses & rebids",
	COMPETITIVE_DEFENSIVE: "Competitive & defensive",
	CARDING: "Carding",
};

function RulesPage() {
	const rules = useQuery(trpc.rules.list.queryOptions());
	const manifest = useQuery(trpc.rules.manifest.queryOptions());
	const search = Route.useSearch();
	const [query, setQuery] = useState("");
	const [selected, setSelected] = useState<string | undefined>(search.rule);
	const related = useQuery({
		...trpc.rules.relatedBoards.queryOptions({
			officialItemId: selected ?? "_",
		}),
		enabled: Boolean(selected),
	});
	const items = useMemo(
		() =>
			(rules.data ?? []).filter((rule) =>
				`${rule.title}${rule.summary}${rule.applicability}${rule.variants.join(" ")}`
					.toLowerCase()
					.includes(query.toLowerCase())
			),
		[rules.data, query]
	);
	const detail = items.find((item) => item.officialItemId === selected);
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">RULE CATALOG</p>
					<h1>JCBL リストA</h1>
					<p>公式項目を、実戦で判断できる単位にほどいて学びます。</p>
				</div>
				<input
					className="search"
					onChange={(event) => setQuery(event.target.value)}
					placeholder="ルールを検索…"
					value={query}
				/>
			</div>
			<div className="rules-layout">
				<section className="rule-list">
					<article className="panel">
						<h2>定義とFull Disclosure</h2>
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
					</article>
					{Object.entries(labels).map(([category, label]) => (
						<div key={category}>
							<h2>{label}</h2>
							{items
								.filter((item) => item.category === category)
								.map((item) => (
									<button
										className={
											selected === item.officialItemId
												? "rule-row selected"
												: "rule-row"
										}
										key={item.officialItemId}
										onClick={() => setSelected(item.officialItemId)}
										type="button"
									>
										<span>{item.officialItemId}</span>
										<div>
											<strong>{item.title}</strong>
											<p>{item.summary}</p>
										</div>
										<b>→</b>
									</button>
								))}
						</div>
					))}
				</section>
				<aside className="rule-detail">
					{detail ? (
						<>
							<p className="eyebrow">{detail.officialItemId}</p>
							<h2>{detail.title}</h2>
							<span
								className={`pill ${detail.alert === "REQUIRED" ? "warn" : ""}`}
							>
								Alert: {detail.alert}
							</span>
							<p>{detail.summary}</p>
							<h3>適用条件</h3>
							<p>{detail.applicability}</p>
							<h3>{detail.exampleKind === "PLAY" ? "Play例" : "Auction例"}</h3>
							<p>{detail.example}</p>
							<h3>Variants</h3>
							<div className="tag-list">
								{detail.variants.map((variant) => (
									<span key={variant}>{variant}</span>
								))}
							</div>
							<h3>設定項目</h3>
							<ul>
								{detail.configuration.map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
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
