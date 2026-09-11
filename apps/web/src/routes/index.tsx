import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/")({ component: HomePage });

function percent(value: number | null | undefined) {
	return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function HomePage() {
	const stats = useQuery(trpc.statistics.summary.queryOptions());
	const tournaments = useQuery(trpc.tournaments.list.queryOptions());
	return (
		<main className="page">
			<div className="page-heading">
				<div>
					<p className="eyebrow">LEARNING OVERVIEW</p>
					<h1>おかえりなさい。</h1>
					<p>今日もひとつ、実戦から確かな判断を積み上げましょう。</p>
				</div>
				<Link className="primary button-link" to="/tournaments">
					＋ Funbridge JSONを取り込む
				</Link>
			</div>
			<section className="metric-grid">
				<article className="metric accent">
					<small>総合遵守率</small>
					<strong>{percent(stats.data?.overallCompliance)}</strong>
					<span>確定可能な判定のみ</span>
				</article>
				<article className="metric">
					<small>適用精度</small>
					<strong>{percent(stats.data?.applicationAccuracy)}</strong>
					<span>誤適用を除く精度</span>
				</article>
				<article className="metric">
					<small>使用率</small>
					<strong>{percent(stats.data?.usageRate)}</strong>
					<span>機会を逃さなかった率</span>
				</article>
				<article className="metric">
					<small>トーナメント</small>
					<strong>{tournaments.data?.length ?? 0}</strong>
					<span>保存済み</span>
				</article>
			</section>
			<div className="two-column">
				<section className="panel">
					<div className="panel-title">
						<div>
							<p className="eyebrow">NEXT STEP</p>
							<h2>学習ループを始める</h2>
						</div>
					</div>
					<ol className="learning-loop">
						<li>
							<span>01</span>
							<div>
								<strong>Rulesを読む</strong>
								<p>JCBLリストAの22項目を、自分の言葉で理解します。</p>
							</div>
						</li>
						<li>
							<span>02</span>
							<div>
								<strong>My Systemを公開</strong>
								<p>採用ルールとレンジを固定し、実戦の基準を作ります。</p>
							</div>
						</li>
						<li>
							<span>03</span>
							<div>
								<strong>Funbridge JSONを取り込む</strong>
								<p>Funbridgeの実戦を評価し、次の課題へ戻ります。</p>
							</div>
						</li>
					</ol>
				</section>
				<section className="panel dark-panel">
					<p className="eyebrow">RULESET</p>
					<h2>リストA 2026</h2>
					<div className="rule-progress">
						<span style={{ width: "100%" }} />
					</div>
					<strong>22 / 22 項目を収録</strong>
					<p>
						2026年5月1日施行版。公式大項目すべてに評価器IDと学習メタデータを持たせています。
					</p>
					<Link search={{ rule: undefined }} to="/rules">
						ルールカタログを見る →
					</Link>
				</section>
			</div>
		</main>
	);
}
