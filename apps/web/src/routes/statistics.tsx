import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/statistics")({
	component: StatisticsPage,
});
function pct(value: number | null | undefined) {
	return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
}

function StatisticsPage() {
	const stats = useQuery(trpc.statistics.summary.queryOptions());
	const breakdown = useQuery(trpc.statistics.ruleBreakdown.queryOptions());
	const counts = stats.data?.counts ?? {};
	const rows = [
		["COMPLIED", "遵守"],
		["DEVIATED_WRONG_APPLICATION", "誤適用"],
		["DEVIATED_MISSED_OPPORTUNITY", "使用漏れ"],
		["INDETERMINATE", "判定不能"],
		["NOT_APPLICABLE", "非該当"],
	] as const;
	const max = Math.max(1, ...rows.map(([key]) => Number(counts[key] ?? 0)));
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">STATISTICS</p>
					<h1>結果ではなく、判断の傾向を見る。</h1>
					<p>MPとIMPを混ぜず、相関を因果として扱わないための学習指標です。</p>
				</div>
				<span className="pill">Engine {stats.data?.engineVersion ?? "—"}</span>
			</div>
			<section className="metric-grid three">
				<article className="metric accent">
					<small>適用精度</small>
					<strong>{pct(stats.data?.applicationAccuracy)}</strong>
					<span>COMPLIED / (COMPLIED + WRONG)</span>
				</article>
				<article className="metric">
					<small>使用率</small>
					<strong>{pct(stats.data?.usageRate)}</strong>
					<span>COMPLIED / (COMPLIED + MISSED)</span>
				</article>
				<article className="metric">
					<small>総合遵守率</small>
					<strong>{pct(stats.data?.overallCompliance)}</strong>
					<span>判定不能・非該当は分母外</span>
				</article>
			</section>
			<section className="panel">
				<div className="panel-title">
					<h2>判定内訳</h2>
					<span>最新評価Run</span>
				</div>
				<div className="bar-chart">
					{rows.map(([key, label]) => (
						<div className="bar-row" key={key}>
							<span>{label}</span>
							<div>
								<i
									style={{
										width: `${(Number(counts[key] ?? 0) / max) * 100}%`,
									}}
								/>
							</div>
							<strong>{counts[key] ?? 0}</strong>
						</div>
					))}
				</div>
			</section>
			<section className="panel table-panel stats-table">
				<div className="panel-title">
					<h2>ルール別成績</h2>
					<span>MP / IMPは別行で集計</span>
				</div>
				<div className="table">
					<div className="table-head">
						<span>Rule / 判定</span>
						<span>Family</span>
						<span>Score</span>
						<span>標本 / 達成率</span>
					</div>
					{breakdown.data?.map((row) => (
						<div
							className="table-row"
							key={`${row.ruleVersionId}-${row.verdict}-${row.family}-${row.scoreType}-${row.systemVersionId}`}
						>
							<strong>
								{row.ruleVersionId}
								<small>{row.verdict}</small>
							</strong>
							<span>
								{row.family}
								<small>
									{row.systemVersionName
										? `${row.systemVersionName} v${row.systemVersionNumber}`
										: "System未設定"}
								</small>
							</span>
							<span>
								{row.averageScore == null
									? "—"
									: Number(row.averageScore).toFixed(2)}{" "}
								{row.scoreType}
							</span>
							<span>
								{Number(row.sampleCount)} /{" "}
								{row.contractMadeRate == null
									? "—"
									: `${Math.round(Number(row.contractMadeRate) * 100)}%`}
							</span>
						</div>
					))}
				</div>
			</section>
		</main>
	);
}
